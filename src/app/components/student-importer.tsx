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
      const response=await fetch("/api/students/import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const data=await response.json().catch(()=>null);
      if(!data)throw new Error(`Import server returned an unreadable response (HTTP ${response.status}). Check the server logs.`);
      setNotice(data.message||data.error||"Import complete");
      if(data.mappingNeeded){setMappingData(data);setMapping(data.mapping??{});}
      else setMappingData(null);
      setGroups(data.groups??[]);setReport(data.reportCsv??"");if(response.ok)window.location.reload();
    } catch (error) {setNotice(error instanceof Error?error.message:"Import failed. Check the connection and try again.");} finally {setBusy(false);}
  }
  function downloadReport(){if(!report)return;const url=URL.createObjectURL(new Blob([report],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="student-import-errors.csv";a.click();URL.revokeObjectURL(url);}
  return <section className="student-importer">
    <div className="student-importer-heading"><div><h2>Import student master data</h2><p>CSV or XLSX · up to 5,000 rows · 2 MB maximum</p></div><a href="/students_template.csv" download>Download CSV template <span aria-hidden="true">↓</span></a></div>
    <label className={`student-file-picker${file ? " has-file" : ""}`}>
      <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e=>{setFile(e.target.files?.[0]??null);setNotice("");setMappingData(null);setGroups([]);}}/>
      <span className="student-file-icon" aria-hidden="true">↑</span><span className="student-file-copy"><b>{file ? file.name : "Choose your student list"}</b><small>{file ? `${(file.size / 1024).toFixed(0)} KB · Ready to validate` : "Select an Excel (.xlsx) or CSV (.csv) file"}</small></span><span className="student-browse-button">Browse files</span>
    </label>
    <p className="student-import-note">Registration numbers are normalized and mobile numbers are validated. PDF student lists must be converted to Excel first; detention PDFs are uploaded from a section page.</p>
    <div className="student-import-actions"><label className="student-auto-sections"><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/><span><b>Create missing sections automatically</b><small>New sections from the file will be added to your directory.</small></span></label><button disabled={!file||busy} onClick={()=>upload()} className="student-import-button">{busy?"Checking file…":"Validate and import"}</button></div>
    {notice&&<p role="status" className="student-import-notice">{notice}</p>}
    {mappingData&&<div className="student-mapping"><h3>Match your spreadsheet columns</h3><p>Found: {mappingData.found.join(", ")||"no headers"}. Required: registration number, student name, and section.</p><div className="student-mapping-grid">{fields.map(field=><label key={field}>{field.replaceAll("_"," ")}<select value={mapping[field]??""} onChange={e=>setMapping(old=>({...old,[field]:e.target.value}))}><option value="">Not mapped</option>{mappingData.found.map((header,i)=><option key={`${i}-${header}`} value={header}>{header}</option>)}</select></label>)}</div><button disabled={busy||fields.slice(0,3).some(field=>!mapping[field])} onClick={()=>upload(true)} className="student-import-button">Import with these columns</button></div>}
    {!!groups.length&&<div className="student-import-errors">{groups.map(group=><div key={group.type}><h3>{group.type}: {group.count} row(s)</h3><ul>{group.examples.map((example,i)=><li key={i}>Row {example.row}: {example.message}</li>)}</ul></div>)}<button onClick={downloadReport}>Download error report CSV</button></div>}
  </section>;
}
