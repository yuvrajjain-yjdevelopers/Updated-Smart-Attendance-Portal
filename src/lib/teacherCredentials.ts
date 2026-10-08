import { randomInt } from "node:crypto";

const upper="ABCDEFGHJKLMNPQRSTUVWXYZ";
const lower="abcdefghjkmnpqrstuvwxyz";
const digits="23456789";
const symbols="!@#$%";
function pick(chars:string){return chars[randomInt(chars.length)];}
export function generateTeacherPassword(){const chars=[pick(upper),pick(lower),pick(digits),pick(symbols)];const all=upper+lower+digits+symbols;while(chars.length<12)chars.push(pick(all));for(let i=chars.length-1;i>0;i--){const j=randomInt(i+1);[chars[i],chars[j]]=[chars[j],chars[i]];}return chars.join("");}
