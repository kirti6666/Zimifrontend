import { ApiError } from "./client";
import type { PayoutKyc, WithdrawalQuote } from "./types";
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const id = (value: unknown) => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
const nonnegative = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const text = (value: unknown, max: number) => typeof value === "string" && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
export function payoutKycFrom(value: unknown): PayoutKyc {
  const fail = (): never => { throw new ApiError("Your payout verification details could not be loaded. Try again.", 502); };
  if (!object(value) || typeof value.required !== "boolean" || !object(value.kyc)) return fail();
  const k = value.kyc;
  if (!["missing", "pending", "verified", "rejected"].includes(String(k.status)) || k.panNumber !== undefined || k.bankAccountNumber !== undefined || (k.ownerType !== undefined && k.ownerType !== "host") ||
    (k.id !== undefined && !id(k.id)) || (k.ownerId !== undefined && !text(k.ownerId, 100)) ||
    (k.revision !== undefined && (!Number.isSafeInteger(k.revision) || Number(k.revision) < 1)) ||
    (k.legalName !== undefined && !text(k.legalName, 100)) ||
    (k.panMasked !== undefined && (typeof k.panMasked !== "string" || !/^[*\u2022\u25cf]{6}[A-Z0-9]{4}$/i.test(k.panMasked))) ||
    (k.payoutType !== undefined && k.payoutType !== "upi" && k.payoutType !== "bank") ||
    (k.payoutAddress !== undefined && !text(k.payoutAddress, 200)) ||
    (k.bankLast4 !== undefined && (typeof k.bankLast4 !== "string" || !/^\d{4}$/.test(k.bankLast4))) ||
    (k.ifsc !== undefined && (typeof k.ifsc !== "string" || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(k.ifsc))) ||
    (k.reason != null && !text(k.reason, 500)) ||
    [k.legalName,k.payoutAddress,k.reason].some(value => typeof value === "string" && /\b[A-Z]{5}\d{4}[A-Z]\b/i.test(value)) ||
    (k.payoutType === "bank" && typeof k.payoutAddress === "string" && /\b\d{8,}\b/.test(k.payoutAddress)) ||
    (k.status === "verified" && (!id(k.id) || !text(k.payoutAddress, 200)))) return fail();
  const summary: PayoutKyc["kyc"] = { status: k.status as PayoutKyc["kyc"]["status"] };
  for (const field of ["id", "ownerId", "legalName", "panMasked", "payoutType", "payoutAddress", "bankLast4", "ifsc", "reason"] as const)
    if (k[field] != null) Object.assign(summary, { [field]: k[field] });
  if (k.revision !== undefined) summary.revision = Number(k.revision);
  return { required: value.required, kyc: summary };
}
export function withdrawalQuoteFrom(value: unknown): WithdrawalQuote {
  const fail = (): never => { throw new ApiError("Your withdrawal quote could not be confirmed. Refresh and review again.", 502); };
  if (!object(value) || ![1, 2].includes(Number(value.policyVersion)) || typeof value.policyVersion !== "number" ||
    !nonnegative(value.grossAmountPaise) || Number(value.grossAmountPaise) <= 0 || !nonnegative(value.tdsPaise) || !nonnegative(value.netAmountPaise) || !nonnegative(value.diamondUnits) ||
    BigInt(Number(value.tdsPaise)) + BigInt(Number(value.netAmountPaise)) !== BigInt(Number(value.grossAmountPaise)) ||
    typeof value.tdsPercent !== "number" || !Number.isFinite(value.tdsPercent) || value.tdsPercent < 0 || value.tdsPercent > 100 || Number(value.tdsPercent.toFixed(6)) !== value.tdsPercent ||
    (value.settingsVersionId !== undefined && !id(value.settingsVersionId)) || (value.kycId !== undefined && !id(value.kycId)) || !(text(value.payoutAddress, 200) || value.policyVersion === 1 && value.payoutAddress === "") ||
    (value.policyVersion === 2 && (!id(value.settingsVersionId) || !id(value.kycId))) ||
    (value.policyVersion === 1 && (value.tdsPaise !== 0 || value.tdsPercent !== 0))) return fail();
  if (BigInt(Number(value.grossAmountPaise)) * BigInt(Math.round(value.tdsPercent * 1000000)) / 100000000n !== BigInt(Number(value.tdsPaise))) return fail();
  return { policyVersion: value.policyVersion as 1 | 2, grossAmountPaise: Number(value.grossAmountPaise), tdsPaise: Number(value.tdsPaise), netAmountPaise: Number(value.netAmountPaise), tdsPercent: value.tdsPercent,
    diamondUnits: Number(value.diamondUnits), payoutAddress: String(value.payoutAddress), ...(value.settingsVersionId !== undefined ? { settingsVersionId: String(value.settingsVersionId) } : {}), ...(value.kycId !== undefined ? { kycId: String(value.kycId) } : {}) };
}
