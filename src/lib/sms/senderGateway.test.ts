import { describe, expect, it } from "vitest";
import { encryptSecret } from "@/lib/crypto";
import { gatewayForSender, publicGatewayStatus } from "@/lib/sms/senderGateway";

process.env.APP_SECRET = "test-secret-for-unit-tests";
const teacherA = { id: "a", smsGatewayMode: "LOCAL" as const, smsGatewayUrl: "http://phone-a:8080", smsGatewayUser: "a-user", smsGatewayPassEnc: encryptSecret("a-secret"), smsGatewaySenderNumber: "+911111111111", smsGatewayLastTestAt: null, smsGatewayLastSuccessfulTestAt: null, smsGatewayLastTestOk: null };
const teacherB = { id: "b", smsGatewayMode: "LOCAL" as const, smsGatewayUrl: "http://phone-b:8080", smsGatewayUser: "b-user", smsGatewayPassEnc: encryptSecret("b-secret"), smsGatewaySenderNumber: "+922222222222", smsGatewayLastTestAt: null, smsGatewayLastSuccessfulTestAt: null, smsGatewayLastTestOk: null };

describe("sender-owned gateway settings", () => {
  it("uses only the logged-in sender's gateway and never another user's", () => {
    expect(gatewayForSender(teacherA)).toMatchObject({ baseUrl: "http://phone-a:8080", username: "a-user", password: "a-secret" });
    expect(gatewayForSender(teacherB)).toMatchObject({ baseUrl: "http://phone-b:8080", username: "b-user", password: "b-secret" });
  });
  it("blocks sending when the sender has no configured phone", () => {
    expect(() => gatewayForSender({ smsGatewayMode: null, smsGatewayUrl: null, smsGatewayUser: null, smsGatewayPassEnc: null })).toThrow("Set up your phone in Settings first");
  });
  it("never includes a password or encrypted credential in public status", () => {
    const result = publicGatewayStatus(teacherA);
    expect(JSON.stringify(result)).not.toContain("a-secret");
    expect(JSON.stringify(result)).not.toContain(teacherA.smsGatewayPassEnc);
    expect(JSON.stringify(result)).not.toContain("a-user");
    expect(result).toMatchObject({ configured: true, senderNumber: "+911111111111" });
  });
});
