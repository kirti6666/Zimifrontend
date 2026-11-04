import { ApiError } from "./client";
import type { DiamondStatistics } from "./types";

export const validStatisticsDate = (date: unknown): date is string => typeof date === "string" &&
  /^(20\d{2}|2100)-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) &&
  new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;

/** A chart accepts complete, contiguous, server-confirmed earning buckets only. */
export function diamondStatisticsFrom(value: unknown): DiamondStatistics {
  const fail = (): never => { throw new ApiError("Your diamond statistics could not be loaded. Try again.", 502); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const data = value as Record<string, unknown>;
  if (!["daily", "weekly", "monthly"].includes(String(data.period)) || data.timeZone !== "Asia/Kolkata" ||
    !validStatisticsDate(data.anchorDate) || data.diamondScale !== 1000000 ||
    !Number.isSafeInteger(data.totalDiamondUnits) || Number(data.totalDiamondUnits) < 0 ||
    (data.historicalTiming !== undefined && typeof data.historicalTiming !== "boolean") ||
    typeof data.startAt !== "string" || typeof data.endAt !== "string" || !Array.isArray(data.buckets)) return fail();
  const start = Date.parse(data.startAt), end = Date.parse(data.endAt), day = 86400000;
  const step = data.period === "daily" ? day / 24 : day;
  const count = data.period === "daily" ? 24 : data.period === "weekly" ? 7 : (end - start) / day;
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isInteger(count) ||
    (data.period === "monthly" && (count < 28 || count > 31)) || end - start !== step * count || data.buckets.length !== count) return fail();
  const anchor = Date.parse(`${data.anchorDate}T00:00:00+05:30`);
  if (anchor < start || anchor >= end || (start + 19800000) % day !== 0) return fail();
  const buckets = data.buckets.map((value: unknown, index: number) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
    const bucket = value as Record<string, unknown>;
    if (typeof bucket.startAt !== "string" || typeof bucket.endAt !== "string" ||
      Date.parse(bucket.startAt) !== start + index * step || Date.parse(bucket.endAt) !== start + (index + 1) * step ||
      typeof bucket.label !== "string" || !bucket.label || bucket.label.length > 20 ||
      !Number.isSafeInteger(bucket.diamondUnits) || Number(bucket.diamondUnits) < 0) return fail();
    return { startAt: bucket.startAt, endAt: bucket.endAt, label: bucket.label, diamondUnits: Number(bucket.diamondUnits) };
  });
  if (buckets.reduce((sum, bucket) => sum + BigInt(bucket.diamondUnits), 0n) !== BigInt(Number(data.totalDiamondUnits))) return fail();
  return { period: data.period as DiamondStatistics["period"], timeZone: "Asia/Kolkata", anchorDate: data.anchorDate,
    startAt: data.startAt, endAt: data.endAt, totalDiamondUnits: Number(data.totalDiamondUnits), diamondScale: 1000000,
    historicalTiming: data.historicalTiming === true, buckets };
}
