import { describe,expect,it } from "vitest";
import { parseDetentionPdfPages } from "./detentionPdf";

describe("detention PDF text parser",()=>{
 it("reads AVG rows, wrapped names, roll numbers, subject codes, and page boundaries",()=>{
  const pages=["BRANCH: COMPUTER SCIENCE & ENGINEERING SPECIALIZATION IN CYBER\nSECURITY\nROLL NO NAME AVG ATT DETAINED COURSE\n1 33 4 4NI21CS001 Asha Devi\nKumari 74.9 %\nUNHUPR10\n1 -\nPage 1 of 2", "ROLL NO NAME AVG ATT DETAINED COURSE\n1 4NI21CS002 Ravi Kumar 75.0 %\nUNHUPR102\nLegend tail"];
  const parsed=parseDetentionPdfPages(pages);
  expect(parsed).toHaveLength(2);expect(parsed[0]).toMatchObject({regNo:"4NI21CS001",avg:74.9,branch:"COMPUTER SCIENCE & ENGINEERING SPECIALIZATION IN CYBER SECURITY"});expect(parsed[0].name).toContain("Asha Devi Kumari");expect(parsed[0].subjects).toContain("UNHUPR101");expect(parsed[1].avg).toBe(75);
 });
 it("counts fake college blocks with 60 students and the 75.0 threshold boundary",()=>{
  const sizes=[14,37,8,1];const pages:string[]=[];let ordinal=1;
  for(const [block,size] of sizes.entries()){const lines=[`BRANCH: COMPUTER SCIENCE & ENGINEERING BLOCK ${block+1}`,"ROLL NO NAME AVG ATT DETAINED COURSE"];for(let i=0;i<size;i++){const avg=ordinal===60?75.0:ordinal<=45?74.9:75.1;lines.push(`${i+1} - 4NI21CS${String(ordinal).padStart(3,"0")} Fake Student ${ordinal} ${avg.toFixed(1)} %`,`UNHUPR101`);ordinal++;}pages.push(lines.join("\n"));}
  const parsed=parseDetentionPdfPages(pages);expect(parsed).toHaveLength(60);expect(parsed.filter(s=>s.avg<75)).toHaveLength(45);expect(parsed.filter(s=>s.avg>=75)).toHaveLength(15);expect(parsed.filter(s=>s.avg===75)).toHaveLength(1);expect(new Set(parsed.map(s=>s.branch)).size).toBe(4);
 });
 it("reads the college provisional detention report layout without mistaking subject percentages for AVG",()=>{
  const pages=[[
   "Degree : B.Tech. Branch : ARTIFICIAL INTELLIGENCE Semester : I",
   "Section : A Attendance Less Than 75.0 Upto Date : 26/09/2026",
   "S. NO ROLL NO REGISTRATION NO. STUDENT NAME UNBSPR101 AVG. ATT CGPA DETAINED COURSE",
   "1 - GHRUA26011450001 PUSHPAK ANAND GULKARI",
   "89% 100% 96% 100% 100% 100% 100% 75% 94%",
   "88% 71% 73%",
   "91.0 % N/A UNITPR102 - , UNITT102 -",
   "2 - GHRUA26011450002 KOUNEN AYAZ SHEIKH",
   "78% 76% 63% 67% 86% 63% 73% 100% 75%",
   "50% 43% 55%",
   "67.0 % N/A",
   "UNBST103 - , UNCSPR101 - ,",
   "UNEEPR101 - , UNEET101 - ,",
   "UNHUT101 - , UNITPR102 - , UNITT102 -",
  ].join("\n")];
  const parsed=parseDetentionPdfPages(pages);
  expect(parsed).toHaveLength(2);
  expect(parsed[0]).toMatchObject({regNo:"GHRUA26011450001",name:"PUSHPAK ANAND GULKARI",avg:91,subjects:["UNITPR102","UNITT102"],branch:"ARTIFICIAL INTELLIGENCE"});
  expect(parsed[1]).toMatchObject({regNo:"GHRUA26011450002",avg:67,subjects:["UNBST103","UNCSPR101","UNEEPR101","UNEET101","UNHUT101","UNITPR102","UNITT102"]});
 });
});
