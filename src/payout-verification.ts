/** Small, strict request shapes shared by native input and durable payout intent.
 * Personal KYC input is never passed to storage. */
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const identifier = (value: unknown) => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
export function validPayoutQuoteProof(value: unknown, amountPaise?: number): boolean {
  if (!object(value) || Object.keys(value).length !== 4 || !Object.keys(value).every(key => ["settingsVersionId", "kycId", "netAmountPaise", "diamondUnits"].includes(key))) return false;
  return identifier(value.settingsVersionId) && identifier(value.kycId) && Number.isSafeInteger(value.netAmountPaise) && Number(value.netAmountPaise) >= 0 && Number.isSafeInteger(value.diamondUnits) && Number(value.diamondUnits) >= 0 &&
    (amountPaise === undefined || Number(value.netAmountPaise) <= amountPaise);
}
export function validPayoutKycInput(value: unknown): boolean {
  if (!object(value) || !Object.keys(value).every(key => ["idempotencyKey", "legalName", "panNumber", "payoutType", "upiId", "bankAccountNumber", "ifsc", "requestId"].includes(key))) return false;
  if (typeof value.idempotencyKey !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(value.idempotencyKey) ||
    typeof value.legalName !== "string" || value.legalName.trim().length < 2 || value.legalName.length > 100 || /[\u0000-\u001f\u007f]/.test(value.legalName) ||
    typeof value.panNumber !== "string" || !/^[A-Z]{5}\d{4}[A-Z]$/.test(value.panNumber) ||
    (value.requestId !== undefined && (!Number.isSafeInteger(value.requestId) || Number(value.requestId) <= 0))) return false;
  if (value.payoutType === "upi") return typeof value.upiId === "string" && value.upiId.length >= 5 && value.upiId.length <= 150 && /^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/.test(value.upiId) && value.bankAccountNumber === undefined && value.ifsc === undefined;
  return value.payoutType === "bank" && typeof value.bankAccountNumber === "string" && /^\d{6,24}$/.test(value.bankAccountNumber) &&
    typeof value.ifsc === "string" && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value.ifsc) && value.upiId === undefined;
}
