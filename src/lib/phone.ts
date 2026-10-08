export function normalizeIndianMobile(input: string) {
  const raw = input.trim();
  if (/\d(?:\.\d+)?e\+\d+/i.test(raw)) throw new Error("Mobile number appears in scientific notation; re-import it as text");
  let digits = raw.replace(/[\s()-]/g, "");
  if (digits.startsWith("+91")) digits = digits.slice(3);
  else if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  digits = digits.replace(/\D/g, "");
  if (!/^\d{10}$/.test(digits)) throw new Error("Enter a valid 10-digit Indian mobile number");
  return digits;
}

export function toInternationalMobile(input: string) {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  throw new Error("Enter a valid phone number");
}

export function toWhatsAppNumber(input: string) { return toInternationalMobile(input).replace(/\D/g, ""); }
