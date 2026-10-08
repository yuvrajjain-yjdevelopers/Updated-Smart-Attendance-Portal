import { normalizeIndianMobile } from "@/lib/phone";

export const STUDENT_FIELDS = ["reg_no","name","section","branch","total_attendance_pct","student_mobile","parent_mobile"] as const;
const ALIASES: Record<(typeof STUDENT_FIELDS)[number], string[]> = {
  reg_no: ["reg_no","reg no","registration no","registration number","roll no","enrollment no","enrolment no"],
  name: ["name","student name"],
  section: ["section","class","div","division"],
  branch: ["branch"],
  total_attendance_pct: ["total_attendance_pct","attendance","attendance %","total attendance","total attendance %"],
  student_mobile: ["student_mobile","student mobile","mobile","phone","student phone"],
  parent_mobile: ["parent_mobile","parent mobile","father mobile","guardian mobile","parent phone"],
};
export function normalizeHeader(value: string) { return value.replace(/^\uFEFF/,"").trim().toLowerCase().replace(/[_-]+/g," ").replace(/\s+/g," "); }
export function mapStudentHeaders(headers: string[], mapping?: Record<string,string>) {
  const normalized = headers.map((header) => ({ raw: header, key: normalizeHeader(header) }));
  const selected: Record<string,string> = {};
  for (const field of STUDENT_FIELDS) {
    const chosen = mapping?.[field];
    const match = chosen ? normalized.find((item) => item.raw === chosen) : normalized.find((item) => ALIASES[field].map(normalizeHeader).includes(item.key));
    if (match) selected[field] = match.raw;
  }
  const required = ["reg_no","name","section"];
  return { mapping: selected, missing: required.filter((field) => !selected[field]), found: headers };
}

export type ImportError = { row: number; type: string; message: string; values: Record<string,string> };
export function groupImportErrors(errors: ImportError[]) {
  const groups = new Map<string,ImportError[]>();
  for (const error of errors) groups.set(error.type,[...(groups.get(error.type)??[]),error]);
  return [...groups.entries()].map(([type,items])=>({type,count:items.length,examples:items.slice(0,5)}));
}

export function validateStudentRows(rows: Record<string,string>[], headers: string[], mapping?: Record<string,string>) {
  const mapped = mapStudentHeaders(headers,mapping);
  if (mapped.missing.length) return { mappingNeeded: true as const, found: headers, missing: mapped.missing, mapping: mapped.mapping };
  const records: Array<{regNo:string;name:string;section:string;parentMobile:string;studentMobile:string|null;branch:string|null;totalAttendancePct:number|null}> = [];
  const errors: ImportError[] = [];
  rows.forEach((raw,index)=>{
    const get=(field:string)=>(raw[mapped.mapping[field]]??"").trim();
    const values=Object.fromEntries(Object.entries(raw).map(([key,value])=>[key,String(value??"")]));
    const regNo=get("reg_no");const name=get("name");const section=get("section");
    if(!regNo||!name||!section){errors.push({row:index+2,type:"Missing required value",message:"Registration number, student name, and section are required",values});return;}
    if(regNo.length>100){errors.push({row:index+2,type:"Invalid registration number",message:"Registration number is longer than 100 characters",values});return;}
    const pctText=get("total_attendance_pct");const pct=pctText?Number(pctText.replace("%","")):null;
    if(pctText&&(pct===null||!Number.isFinite(pct)||pct<0||pct>100)){errors.push({row:index+2,type:"Invalid attendance",message:"Attendance must be a number from 0 to 100",values});return;}
    try {
      const parent=get("parent_mobile");const student=get("student_mobile");
      records.push({regNo:regNo.toUpperCase(),name,section, parentMobile:parent?normalizeIndianMobile(parent):"", studentMobile:student?normalizeIndianMobile(student):null, branch:get("branch")||null,totalAttendancePct:pct});
    } catch (error) {const reason=error instanceof Error?error.message:"Invalid mobile number";const type=reason.includes("scientific")?"Spreadsheet damaged mobile":"Invalid mobile number";errors.push({row:index+2,type,message:reason,values});}
  });
  return { mappingNeeded:false as const, mapping:mapped.mapping, records, errors, groups:groupImportErrors(errors) };
}

export function errorReportCsv(errors: ImportError[]) {
  const quote=(value:string)=>`"${value.replaceAll('"','""')}"`;
  const columns=[...new Set(errors.flatMap(item=>Object.keys(item.values)))];
  return [["row","error_type","error",...columns].map(quote).join(","),...errors.map(item=>[String(item.row),item.type,item.message,...columns.map(column=>item.values[column]??"")].map(quote).join(","))].join("\r\n");
}
