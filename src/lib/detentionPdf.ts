export type ParsedDetentionStudent={regNo:string;name:string;avg:number;subjects:string[];branch:string};
const AVG=/(\d{1,3}\.\d+)\s*%/;
const REG=/(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{7,24}/i;
const noise=/^(?:page\s+\d+|\d+\s*\/\s*\d+|roll\s*no|reg(?:istration)?\s*no|name\s+of|avg\s*att|detained\s+course|legend|branch\s*:|section\s*:|sl\.?\s*no|subject\s+code)/i;
function tidy(s:string){return s.replace(/\s+/g," ").trim();}
function isSubject(s:string){const value=tidy(s).replace(/[\s-]+/g,"");return /^[A-Z]{2,}[A-Z0-9]{3,}$/i.test(value)&&value.length>=6;}
export function parseDetentionPdfPages(pages:string[]):ParsedDetentionStudent[]{
 const result:ParsedDetentionStudent[]=[];let branch="";let pending:string[]=[];let blockLines:string[]=[];let awaitingBranch=false;let inLegend=false;
 const flush=()=>{if(!blockLines.length)return;const raw=blockLines.map(tidy).filter(Boolean);const idx=raw.findIndex(line=>AVG.test(line));if(idx<0){blockLines=[];return;}const row=raw[idx];const match=row.match(AVG)!;const avg=Number(match[1]);const before=tidy(`${raw.slice(0,idx).join(" ")} ${row.slice(0,match.index)}`);const regNo=before.match(REG)?.[0]?.toUpperCase();if(regNo){const name=tidy(before.replace(regNo," ").replace(/\b\d+\b/g," ").replace(/[-|]/g," "));const after=[row.slice((match.index??0)+match[0].length),...raw.slice(idx+1)];const subjects:string[]=[];for(let i=0;i<after.length;i++){const s=after[i];if(noise.test(s)||s==="-")continue;if(isSubject(s)){let code=s.replace(/[\s-]+/g,"").toUpperCase();if(/^\d+\s*-?$/.test(after[i+1]??"")){code+=tidy(after[i+1]).replace(/\D/g,"");i++;}if(!subjects.includes(code))subjects.push(code);}}if(name)result.push({regNo,name,avg,subjects,branch});}blockLines=[];};
 for(const page of pages){for(const rawLine of page.split(/\r?\n/)){const line=tidy(rawLine);if(!line)continue;if(/^legend\b/i.test(line)){inLegend=true;continue;}if(inLegend&&!(REG.test(line)&&!isSubject(line)))continue;if(REG.test(line)&&!isSubject(line))inLegend=false;if(awaitingBranch){branch=tidy(`${branch} ${line}`);awaitingBranch=false;continue;}const b=line.match(/^(?:branch\s*[:\-]?\s*)?(.{3,90}(?:ENGINEERING|SCIENCE|COMMERCE|ARTS|TECHNOLOGY|SPECIALIZATION).*)$/i);if(b&&!AVG.test(line)){const candidate=tidy(`${line} ${pending.join(" ")}`);if(/ENGINEERING|SCIENCE|COMMERCE|ARTS|TECHNOLOGY|SPECIALIZATION/i.test(candidate)){branch=candidate;awaitingBranch=/\bCYBER$/i.test(candidate);pending=[];continue;}}
 if(/^(?:branch|section)\s*[:\-]?$/i.test(line)){pending=[line];continue;}if(pending.length&&line.length<80&&!AVG.test(line)){pending.push(line);if(pending.join(" ").length<100)continue;}
 if(noise.test(line)&&!AVG.test(line))continue;
 if(REG.test(line)&&!isSubject(line)&&blockLines.length&&blockLines.some(part=>AVG.test(part))){flush();blockLines.push(line);continue;}
 if(blockLines.length){if(/^(?:page\s+\d+|\d+\s*\/\s*\d+)$/i.test(line)){continue;}blockLines.push(line);}
 else if(REG.test(line)&&!isSubject(line))blockLines.push(line);
 }}flush();return result;
}
