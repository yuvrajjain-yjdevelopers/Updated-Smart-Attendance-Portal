import { describe,expect,it } from "vitest";
import { isDetained,shouldSkipDuplicate } from "@/lib/attendance";
describe("attendance and duplicate rules",()=>{it("uses a strict attendance threshold",()=>{expect(isDetained(74.9)).toBe(true);expect(isDetained(75)).toBe(false)});it("skips a sent message unless resending was requested",()=>{expect(shouldSkipDuplicate(["SENT"])).toBe(true);expect(shouldSkipDuplicate(["OPENED"])).toBe(true);expect(shouldSkipDuplicate(["FAILED"])).toBe(false);expect(shouldSkipDuplicate(["SENT"],true)).toBe(false)})});
