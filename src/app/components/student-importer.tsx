"use client";

import { useState } from "react";

type MappingResponse = { found: string[]; expected: string[]; missing: string[]; mapping: Record<string,string> };
type ErrorGroup = { type: string; count: number; examples: { row: number; message: string }[] };
const fields = ["reg_no","name","section","branch","total_attendance_pct","student_mobile","parent_mobile"];

export default function StudentImporter() {
  const [file,setFile]=useState<File|null>(null); const [notice,setNotice]=useState(""); const [groups,setGroups]=useState<ErrorGroup[]>([]);
  const [mappingData,setMappingData]=useState<MappingResponse|null>(null); const [mapping,setMapping]=useState<Record<string,string>>({}); const [auto,setAuto]=useState(true); const [report,setReport]=useState(""); const [busy,setBusy]=useState(false);
  async function upload(useMapping=false) {
    if(!file)return; setBusy(true);setNotice("");setGroups([]);setReport("");
    try {
      const ext=file.name.split(".").pop()?.toLowerCase(); const sig=new Uint8Array(await file.slice(0,5).arrayBuffer());
      if(sig[0]===37&&sig[1]===80&&sig[2]===68&&sig[3]===70&&sig[4]===45){setNotice("This is a PDF. Use Upload detention list on a section page.");return;}
      if(ext!=="csv"&&ext!=="xlsx"){setNotice("Student import accepts .csv or .xlsx files.");return;}
      if(ext==="xlsx"&&!(sig[0]===80&&sig[1]===75)){setNotice("The .xlsx extension does not match the file content.");return;}
      const body:Record<string,unknown>={fileName:file.name,createSections:auto};
      if(ext==="csv")body.csv=await file.text();
      else body.contentBase64=(await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]??"");reader.onerror=()=>reject(new Error("Could not read file"));reader.readAsDataURL(file);}));
      if(useMapping)body.mapping=mapping;
      const response=await fetch("/api/students/import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const data=await response.json();
      setNotice(data.message||data.error||"Import complete");
      if(data.mappingNeeded){setMappingData(data);setMapping(data.mapping??{});}
      else setMappingData(null);
      setGroups(data.groups??[]);setReport(data.reportCsv??"");if(response.ok)window.location.reload();
    } catch {setNotice("Could not read this file. Please choose a valid CSV or XLSX file.");} finally {setBusy(false);}
  }
  function downloadReport(){if(!report)return;const url=URL.createObjectURL(new Blob([report],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="student-import-errors.csv";a.click();URL.revokeObjectURL(url);}
  return <section className="mb-6 rounded-xl border bg-white p-5"><h2 className="font-semibold">Import student master data</h2><p className="mt-1 text-sm text-slate-600">CSV or XLSX, up to 5,000 rows and 2 MB. Reg numbers are uppercased and mobile numbers validated.</p><a className="mt-2 inline-block text-sm text-indigo-700 underline" href="/students_template.csv" download>Download CSV template</a><div className="mt-3 flex flex-wrap items-center gap-3"><input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e=>{setFile(e.target.files?.[0]??null);setNotice("");setMappingData(null);setGroups([]);}}/><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/> Create missing sections automatically</label><button disabled={!file||busy} onClick={()=>upload()} className="rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50">{busy?"Checking…":"Validate and import"}</button></div>
  {notice&&<p role="status" className="mt-3 rounded bg-blue-50 p-3 text-sm">{notice}</p>}
  {mappingData&&<div className="mt-3 rounded border p-4"><h3 className="font-medium">Map the columns in this file</h3><p className="mt-1 text-sm">Found: {mappingData.found.join(", ")||"no headers"}. Required: registration number, student name, and section.</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{fields.map(field=><label key={field} className="text-sm">{field.replaceAll("_"," ")}<select className="mt-1 block w-full rounded border p-2" value={mapping[field]??""} onChange={e=>setMapping(old=>({...old,[field]:e.target.value}))}><option value="">Not mapped</option>{mappingData.found.map((header,i)=><option key={`${i}-${header}`} value={header}>{header}</option>)}</select></label>)}</div><button disabled={busy||fields.slice(0,3).some(field=>!mapping[field])} onClick={()=>upload(true)} className="mt-3 rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50">Import with these columns</button></div>}
  {!!groups.length&&<div className="mt-3 space-y-3">{groups.map(group=><div key={group.type} className="rounded border border-red-200 bg-red-50 p-3 text-sm"><h3 className="font-medium text-red-900">{group.type}: {group.count} row(s)</h3><ul className="mt-1 list-disc pl-5 text-red-800">{group.examples.map((example,i)=><li key={i}>Row {example.row}: {example.message}</li>)}</ul></div>)}<button onClick={downloadReport} className="rounded border px-3 py-2 text-sm">Download error report CSV</button></div>}</section>;
}
