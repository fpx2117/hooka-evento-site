import { DiscountCfg } from "../types";

export function pickDiscountRule(
  rules: DiscountCfg[],
  ticketType: "general" | "vip",
  qty: number
): DiscountCfg | null {
  const active = rules.filter(
    (r) => r.isActive !== false && r.ticketType === ticketType
  );
  if (!active.length) return null;
  const candidates = active.filter((r) => (r.minQty || 0) <= qty);
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    if ((b.minQty || 0) !== (a.minQty || 0))
      return (b.minQty || 0) - (a.minQty || 0);
    if ((b.priority || 0) !== (a.priority || 0))
      return (b.priority || 0) - (a.priority || 0);
    return (b.value || 0) - (a.value || 0);
  });
  return candidates[0] || null;
}

export function applyDiscount(
  unit: number,
  qty: number,
  rule: DiscountCfg | null
): {
  subtotal: number;
  discount: number;
  total: number;
  rule?: DiscountCfg | null;
} {
  const cleanUnit = Math.max(0, unit || 0);
  const cleanQty = Math.max(1, qty || 1);
  const subtotal = cleanUnit * cleanQty;
  if (!rule) return { subtotal, discount: 0, total: subtotal, rule: null };

  let discount = 0;
  if (rule.type === "percent") {
    discount = Math.floor((subtotal * Math.max(0, rule.value || 0)) / 100);
  } else {
    discount = Math.max(0, Math.floor(rule.value || 0));
  }
  const total = Math.max(0, subtotal - discount);
  return { subtotal, discount, total, rule };
}

export function range(from: number, to: number): number[] {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return [];
  const len = to - from + 1;
  return Array.from({ length: len }, (_, i) => from + i);
}
