import { createId, safeMoney } from "./ids";
import type { BookingStatus, BudgetItem, CostStatus, EventPlan, Quote, TaskStatus } from "./types";

/** Direct, user-initiated edits. These are pure functions over the plan. */

const touch = (plan: EventPlan): EventPlan => ({ ...plan, updatedAt: new Date().toISOString() });

export function updateBudgetItem(
  plan: EventPlan,
  itemId: string,
  patch: Partial<Pick<BudgetItem, "amount" | "costStatus" | "essential" | "description" | "notes">>,
): EventPlan {
  return touch({
    ...plan,
    budgetItems: plan.budgetItems.map((i) => {
      if (i.id !== itemId) return i;
      const next = { ...i, ...patch };
      if (patch.amount !== undefined) {
        next.amount = safeMoney(patch.amount);
        if (i.scaling === "per_guest") next.unitCost = next.amount / plan.event.guestCount;
      }
      return next;
    }),
  });
}

export function addBudgetItem(
  plan: EventPlan,
  input: { category: string; description: string; amount: number; essential: boolean; costStatus: CostStatus },
): EventPlan {
  return touch({
    ...plan,
    budgetItems: [
      ...plan.budgetItems,
      {
        id: createId("bud"),
        category: input.category.trim().slice(0, 60) || "Other",
        description: input.description.trim().slice(0, 300) || "Untitled item",
        scaling: "fixed",
        unitCost: null,
        amount: safeMoney(input.amount),
        costStatus: input.costStatus,
        essential: input.essential,
        notes: "Added manually.",
      },
    ],
  });
}

export function removeBudgetItem(plan: EventPlan, itemId: string): EventPlan {
  return touch({
    ...plan,
    budgetItems: plan.budgetItems.filter((i) => i.id !== itemId),
    vendors: plan.vendors.map((v) => (v.budgetItemId === itemId ? { ...v, budgetItemId: null } : v)),
  });
}

export function setTaskStatus(plan: EventPlan, taskId: string, status: TaskStatus): EventPlan {
  return touch({ ...plan, tasks: plan.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)) });
}

export function setVendorBookingStatus(plan: EventPlan, vendorId: string, status: BookingStatus): EventPlan {
  return touch({ ...plan, vendors: plan.vendors.map((v) => (v.id === vendorId ? { ...v, bookingStatus: status } : v)) });
}

export function addQuote(plan: EventPlan, vendorId: string, quote: Omit<Quote, "id" | "status">): EventPlan {
  return touch({
    ...plan,
    vendors: plan.vendors.map((v) =>
      v.id === vendorId
        ? {
            ...v,
            bookingStatus: v.bookingStatus === "booked" ? v.bookingStatus : "quote_received",
            quotes: [...v.quotes, { ...quote, amount: safeMoney(quote.amount), id: createId("quo"), status: "received" as const }].slice(0, 20),
          }
        : v,
    ),
  });
}

export function removeQuote(plan: EventPlan, vendorId: string, quoteId: string): EventPlan {
  return touch({
    ...plan,
    vendors: plan.vendors.map((v) => (v.id === vendorId ? { ...v, quotes: v.quotes.filter((q) => q.id !== quoteId) } : v)),
  });
}

/**
 * Selecting a quote records it as the linked budget item's quoted cost.
 * It never marks the item confirmed or the vendor booked.
 */
export function acceptQuote(plan: EventPlan, vendorId: string, quoteId: string): EventPlan {
  const vendor = plan.vendors.find((v) => v.id === vendorId);
  const quote = vendor?.quotes.find((q) => q.id === quoteId);
  if (!vendor || !quote) return plan;
  const vendors = plan.vendors.map((v) =>
    v.id === vendorId
      ? { ...v, quotes: v.quotes.map((q) => ({ ...q, status: q.id === quoteId ? ("accepted" as const) : q.status === "accepted" ? ("received" as const) : q.status })) }
      : v,
  );
  const budgetItems = plan.budgetItems.map((i) =>
    i.id === vendor.budgetItemId && i.costStatus !== "confirmed"
      ? {
          ...i,
          amount: quote.amount,
          unitCost: i.scaling === "per_guest" ? quote.amount / plan.event.guestCount : i.unitCost,
          costStatus: "quoted" as const,
          notes: `Quote from ${quote.vendorName}.`,
        }
      : i,
  );
  return touch({ ...plan, vendors, budgetItems });
}
