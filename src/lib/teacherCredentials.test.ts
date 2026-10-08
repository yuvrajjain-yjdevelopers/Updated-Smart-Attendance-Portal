import {describe,expect,it} from "vitest";
import {generateTeacherPassword} from "./teacherCredentials";
describe("teacher temporary passwords",()=>{it("creates strong 12 character passwords without ambiguous characters",()=>{const value=generateTeacherPassword();expect(value).toHaveLength(12);expect(value).toMatch(/[A-Z]/);expect(value).toMatch(/[a-z]/);expect(value).toMatch(/[2-9]/);expect(value).toMatch(/[!@#$%]/);expect(value).not.toMatch(/[0O1Il]/);});});
