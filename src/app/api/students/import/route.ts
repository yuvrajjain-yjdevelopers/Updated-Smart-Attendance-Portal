import { NextResponse } from "next/server";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateStudentRows,errorReportCsv } from "@/lib/studentImport";
export const dynamic = "force-dynamic";

const requestSchema=z.object({fileName:z.string().min(1).max(200),csv:z.string().optional(),contentBase64:z.string().optional(),createSections:z.boolean().default(true),mapping:z.record(z.string(),z.string()).optional(),targetSectionId:z.string().optional()});
export async function POST(request:Request) {
  const user=await currentUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  if(user.role!=="HOD")return NextResponse.json({error:"Forbidden"},{status:403});
  const parsed=requestSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"Choose a .csv or .xlsx student master file"},{status:400});
  const {fileName,createSections}=parsed.data;let mapping=parsed.data.mapping;const extension=fileName.split(".").pop()?.toLowerCase();
  let rows:Record<string,string>[]=[];let headers:string[]=[];
  if(extension==="pdf"||parsed.data.csv?.startsWith("%PDF-")||parsed.data.contentBase64&&Buffer.from(parsed.data.contentBase64,"base64").subarray(0,5).toString()==="%PDF-")return NextResponse.json({error:"This is a PDF. Use Upload detention list on a section page."},{status:415});
  if(extension==="xlsx"){
    if(!parsed.data.contentBase64)return NextResponse.json({error:"Could not read this XLSX file"},{status:400});
    const bytes=Buffer.from(parsed.data.contentBase64,"base64");
    if(bytes.length>2_000_000)return NextResponse.json({error:"File must be 2 MB or smaller"},{status:413});
    if(bytes.subarray(0,2).toString()!=="PK")return NextResponse.json({error:"The .xlsx extension does not match the file content"},{status:415});
    const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes as unknown as ArrayBuffer);const sheet=workbook.worksheets[0];if(!sheet)return NextResponse.json({error:"The workbook has no worksheets"},{status:400});
    headers=(sheet.getRow(1).values as ExcelJS.CellValue[]).slice(1).map((value)=>String(value??""));
    for(let rowNumber=2;rowNumber<=sheet.rowCount;rowNumber++){const row=sheet.getRow(rowNumber);const rowValues=Array.isArray(row.values)?row.values:[];if(rowValues.length<=1)continue;const values:Record<string,string>={};headers.forEach((header,index)=>{values[header]=row.getCell(index+1).text.trim();});if(Object.values(values).some(Boolean))rows.push(values);}
  } else if(extension==="csv"){
    const csv=parsed.data.csv;
    if(csv===undefined)return NextResponse.json({error:"Could not read this CSV file"},{status:400});
    if(Buffer.byteLength(csv,"utf8")>2_000_000)return NextResponse.json({error:"File must be 2 MB or smaller"},{status:413});
    if(csv.startsWith("PK\u0003\u0004"))return NextResponse.json({error:"This is an Excel workbook. Save it as .xlsx or choose the XLSX file."},{status:415});
    const parsedCsv=Papa.parse<Record<string,string>>(csv,{header:true,skipEmptyLines:true,transformHeader:h=>h.trim()});headers=parsedCsv.meta.fields??[];rows=parsedCsv.data;
  }else return NextResponse.json({error:"Student import accepts .csv or .xlsx files. This is a PDF. Use Upload detention list on a section page."},{status:415});
  if(parsed.data.targetSectionId){const target=await db.section.findUnique({where:{id:parsed.data.targetSectionId}});if(!target)return NextResponse.json({error:"Section not found"},{status:404});rows=rows.map(row=>({...row,__target_section:target.name}));headers=[...headers,"__target_section"];mapping={...mapping,section:"__target_section"};}
  if(rows.length>5000)return NextResponse.json({error:"File may contain at most 5,000 student rows"},{status:400});
  const checked=validateStudentRows(rows,headers,mapping);
  if(checked.mappingNeeded)return NextResponse.json({error:"The column headers were not recognized. Map the found columns to the expected fields.",mappingNeeded:true,found:checked.found,expected:["reg_no","name","section","branch (optional)","total_attendance_pct (optional)","student_mobile (optional)","parent_mobile (optional)"],missing:checked.missing,mapping:checked.mapping},{status:422});
  if(checked.errors.length)return NextResponse.json({error:`${checked.errors.length} rows need correction`,groups:checked.groups,reportCsv:errorReportCsv(checked.errors)},{status:400});
  const currentSections=new Map((await db.section.findMany()).map(section=>[section.name.toLowerCase(),section]));
  const missingNames=[...new Set(checked.records.map(row=>row.section).filter(section=>!currentSections.has(section.toLowerCase())))];
  if(missingNames.length&&!createSections)return NextResponse.json({error:`Create these sections first: ${missingNames.join(", ")}`},{status:400});
  await db.$transaction(async tx=>{
    for(const name of missingNames){const section=await tx.section.create({data:{name}});currentSections.set(name.toLowerCase(),section);}

    // Read existing registrations once, then bulk-insert new students. The old
    // per-row upsert loop kept an interactive transaction open for thousands
    // of network round trips and commonly expired on hosted PostgreSQL.
    const existing=await tx.student.findMany({
      where:{regNo:{in:checked.records.map(row=>row.regNo)}},
      select:{regNo:true},
    });
    const existingRegs=new Set(existing.map(student=>student.regNo));
    const newStudents=checked.records
      .filter(row=>!existingRegs.has(row.regNo))
      .map(row=>({
        regNo:row.regNo,
        name:row.name,
        sectionId:currentSections.get(row.section.toLowerCase())!.id,
        parentMobile:row.parentMobile,
        studentMobile:row.studentMobile,
        branch:row.branch,
        totalAttendancePct:row.totalAttendancePct,
      }));
    if(newStudents.length) await tx.student.createMany({data:newStudents});

    // Preserve the existing import behavior: re-importing a registration
    // updates that student's details and section assignment.
    for(const row of checked.records){
      if(!existingRegs.has(row.regNo)) continue;
      await tx.student.update({where:{regNo:row.regNo},data:{
        name:row.name,
        sectionId:currentSections.get(row.section.toLowerCase())!.id,
        parentMobile:row.parentMobile,
        studentMobile:row.studentMobile,
        branch:row.branch,
        totalAttendancePct:row.totalAttendancePct,
      }});
    }
  },{maxWait:10_000,timeout:30_000});
  // Prepared messages refresh on demand when a sender opens the dashboard,
  // section, or prepared-message API. Keeping that work out of this request
  // lets large roster imports finish within serverless function limits.
  return NextResponse.json({imported:checked.records.length,message:`Imported ${checked.records.length} student rows`});
}
