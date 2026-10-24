import { roundMoney } from "./ids";
import type { BudgetItem, CostStatus, EventPlan } from "./types";

/** Deterministic budget engine. The AI never computes authoritative totals. */

export interface CategoryTotal {
  category: string;
  amount: number;
  share: number;
  hasEssential: boolean;
}

export interface BudgetSummary {
  budget: number;
  totalPlanned: number;
  byStatus: Record<CostStatus, number>;
  remaining: number;
  overrun: number;
  utilization: number;
  byCategory: CategoryTotal[];
}

export function summarizeBudget(budget: number, items: BudgetItem[]): BudgetSummary {
  const byStatus: Record<CostStatus, number> = { estimate: 0, quoted: 0, confirmed: 0 };
  const categoryMap = new Map<string, { amount: number; hasEssential: boolean }>();
  let totalPlanned = 0;

  for (const item of items) {
    totalPlanned += item.amount;
    byStatus[item.costStatus] += item.amount;
    const entry = categoryMap.get(item.category) ?? { amount: 0, hasEssential: false };
    entry.amount += item.amount;
    entry.hasEssential = entry.hasEssential || item.essential;
    categoryMap.set(item.category, entry);
  }

  const byCategory = [...categoryMap.entries()]
    .map(([category, v]) => ({
      category,
      amount: v.amount,
      share: totalPlanned > 0 ? v.amount / totalPlanned : 0,
      hasEssential: v.hasEssential,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    budget,
    totalPlanned,
    byStatus,
    remaining: Math.max(0, budget - totalPlanned),
    overrun: Math.max(0, totalPlanned - budget),
    utilization: budget > 0 ? totalPlanned / budget : 0,
    byCategory,
  };
}

export function summarizePlanBudget(plan: EventPlan): BudgetSummary {
  return summarizeBudget(plan.event.budget, plan.budgetItems);
}

export interface GuestCountImpact {
  itemId: string;
  description: string;
  category: string;
  before: number;
  after: number;
  updated: boolean;
  note: string;
}

/**
 * Applies a guest-count change. Only per-guest *estimates* are recalculated.
 * Quoted or confirmed per-guest costs keep their recorded amount and are flagged
 * for follow-up, because a vendor's figure cannot be changed by the app.
 * Fixed-cost items are never scaled.
 */
export function applyGuestCountChange(
  items: BudgetItem[],
  newGuestCount: number,
): { items: BudgetItem[]; impacts: GuestCountImpact[] } {
  const impacts: GuestCountImpact[] = [];
  const updatedItems = items.map((item) => {
    if (item.scaling !== "per_guest" || item.unitCost === null) return item;
    const projected = roundMoney(item.unitCost * newGuestCount);
    if (projected === item.amount) return item;

    if (item.costStatus === "estimate") {
      impacts.push({
        itemId: item.id,
        description: item.description,
        category: item.category,
        before: item.amount,
        after: projected,
        updated: true,
        note: "Per-guest estimate recalculated.",
      });
      return { ...item, amount: projected };
    }

    impacts.push({
      itemId: item.id,
      description: item.description,
      category: item.category,
      before: item.amount,
      after: projected,
      updated: false,
      note:
        item.costStatus === "confirmed"
          ? "Confirmed cost kept as recorded. Ask the vendor to revise it for the new guest count."
          : "Vendor quote kept as recorded. Request a revised quote for the new guest count.",
    });
    return item;
  });
  return { items: updatedItems, impacts };
}

export interface OverrunAnalysis {
  overrun: number;
  topContributors: CategoryTotal[];
  /** Optional, not-yet-confirmed items that could be reduced or dropped. */
  savingCandidates: BudgetItem[];
  /** Amount that is still flexible (estimates + quotes on optional items). */
  flexibleOptionalAmount: number;
}

export function analyzeOverrun(budget: number, items: BudgetItem[]): OverrunAnalysis {
  const summary = summarizeBudget(budget, items);
  const savingCandidates = items
    .filter((i) => !i.essential && i.costStatus !== "confirmed")
    .sort((a, b) => b.amount - a.amount);
  return {
    overrun: summary.overrun,
    topContributors: summary.byCategory.slice(0, 3),
    savingCandidates,
    flexibleOptionalAmount: savingCandidates.reduce((sum, i) => sum + i.amount, 0),
  };
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString()}`;
  }
}
