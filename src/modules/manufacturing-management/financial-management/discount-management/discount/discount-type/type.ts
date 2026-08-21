// src/modules/financial-management/discount-type/type.ts
import { z } from "zod";

/** ===== Line Discount (Available list) ===== */
export const lineDiscountSchema = z.object({
  id: z.coerce.number(),
  line_discount: z.string().min(1),
  percentage: z.union([z.string(), z.number()]),
  sort: z.union([z.number(), z.null()]).optional(),
});
export type LineDiscountRow = z.infer<typeof lineDiscountSchema>;

/** ===== Applied line (for table display) ===== */
export const appliedLineSchema = z.object({
  link_id: z.coerce.number().optional(),
  line_id: z.coerce.number(),
  code: z.string(),
  percentage: z.string(),
});
export type AppliedLine = z.infer<typeof appliedLineSchema>;

/** ===== Discount Type row (table) ===== */
export const discountTypeRowSchema = z.object({
  id: z.coerce.number(),
  discount_type: z.string().min(1),
  total_percent: z.string().default("0"),
  applied_lines: z.array(appliedLineSchema).default([]),
});
export type DiscountTypeRow = z.infer<typeof discountTypeRowSchema>;

/** ===== Upsert payload (dialog -> API) ===== */
export const discountTypeUpsertSchema = z.object({
  id: z.number().optional(),
  discount_type: z.string().trim().min(1, "Discount Type is required"),
  line_ids: z.array(z.number()).default([]),
});
export type DiscountTypeUpsert = z.infer<typeof discountTypeUpsertSchema>;

/* ============================================================
   Client-side totals (same behavior as API route)
   ============================================================ */

const SCALE = 40n;
const SCALE_FACTOR = 10n ** SCALE;

function clampBigInt(x: bigint, lo: bigint, hi: bigint) {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

function parseDecimalToBigInt(value: string, scale: bigint): bigint {
  const s = String(value ?? "").trim();
  if (!s) return 0n;

  const neg = s.startsWith("-");
  const raw = neg ? s.slice(1) : s;

  const [intPartRaw, fracRaw = ""] = raw.split(".");
  const intPart = intPartRaw.replace(/[^\d]/g, "") || "0";
  const frac = fracRaw.replace(/[^\d]/g, "");

  const wanted = Number(scale);
  const fracPadded = (frac + "0".repeat(wanted)).slice(0, wanted);

  const bi =
    BigInt(intPart) * (10n ** scale) +
    BigInt(fracPadded || "0");

  return neg ? -bi : bi;
}

function formatFixed(
  x: bigint,
  inScale: bigint,
  decimals: number,
): string {
  const neg = x < 0n;
  const abs = neg ? -x : x;

  const outScale = BigInt(decimals);

  if (inScale > outScale) {
    const diff = inScale - outScale;
    const div = 10n ** diff;

    // round half up
    const q = abs / div;
    const r = abs % div;
    const half = div / 2n;
    const rounded = r >= half ? q + 1n : q;

    const s = rounded.toString();
    const intLen = s.length - decimals;
    const intPart = intLen > 0 ? s.slice(0, intLen) : "0";
    const fracPart = intLen > 0 ? s.slice(intLen) : s.padStart(decimals, "0");
    return `${neg ? "-" : ""}${intPart}.${fracPart.padStart(decimals, "0")}`;
  }

  if (inScale < outScale) {
    const diff = outScale - inScale;
    const mul = 10n ** diff;
    const up = abs * mul;

    const s = up.toString();
    const intLen = s.length - decimals;
    const intPart = intLen > 0 ? s.slice(0, intLen) : "0";
    const fracPart = intLen > 0 ? s.slice(intLen) : s.padStart(decimals, "0");
    return `${neg ? "-" : ""}${intPart}.${fracPart.padStart(decimals, "0")}`;
  }

  // equal
  const s = abs.toString();
  const intLen = s.length - decimals;
  const intPart = intLen > 0 ? s.slice(0, intLen) : "0";
  const fracPart = intLen > 0 ? s.slice(intLen) : s.padStart(decimals, "0");
  return `${neg ? "-" : ""}${intPart}.${fracPart.padStart(decimals, "0")}`;
}

export function computeTotals(percentages: Array<string | number>) {
  let mult = SCALE_FACTOR;

  for (const pRaw of percentages) {
    let pStr = String(pRaw ?? "0").trim();
    if (!pStr || !/^-?\d+(\.\d+)?$/.test(pStr)) pStr = "0";

    const pScaled = parseDecimalToBigInt(pStr, SCALE);
    const ratioScaled = pScaled / 100n;
    const oneMinusScaled = SCALE_FACTOR - ratioScaled;

    mult = (mult * oneMinusScaled) / SCALE_FACTOR;
  }

  mult = clampBigInt(mult, 0n, SCALE_FACTOR);
  const eff = SCALE_FACTOR - mult;
  const percentScaled = eff * 100n;

  return {
    multiplier: formatFixed(mult, SCALE, 20),
    percent: formatFixed(percentScaled, SCALE, 16),
  };
}

/** UI helper: show percent like screenshot (4 decimals) */
export function formatPercent4(p16: string) {
  const s = String(p16 ?? "0").trim();
  // take numeric safely; if NaN -> 0
  const n = Number(s);
  if (!Number.isFinite(n)) return "0.0000";
  return n.toFixed(4);
}

/** Table helper: compact percent (trim trailing zeros, cap decimals) */
export function formatPercentCompact(pAny: string) {
  const n = Number(String(pAny ?? "0"));
  if (!Number.isFinite(n)) return "0%";
  // cap to 10 decimals, then trim
  let s = n.toFixed(10);
  s = s.replace(/\.?0+$/, "");
  return `${s}%`;
}
