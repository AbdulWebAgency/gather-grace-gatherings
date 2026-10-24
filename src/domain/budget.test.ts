import { describe, expect, it } from "vitest";
import { communityPlan } from "@/test/fixtures";
import { addBudgetItem, updateBudgetItem } from "./planEdits";
import { analyzeOverrun, applyGuestCountChange, summarizeBudget } from "./budget";

describe("budget engine", () => {
  it("computes totals, remaining and status split", () => {
    const s = summarizeBudget(100_000, communityPlan().budgetItems);
    expect(s.totalPlanned).toBe(95_000);
    expect(s.remaining).toBe(5_000);
    expect(s.overrun).toBe(0);
    expect(s.byStatus).toEqual({ estimate: 55_000, quoted: 15_000, confirmed: 25_000 });
    expect(s.byCategory[0]).toMatchObject({ category: "Catering", amount: 40_000 });
  });

  it("detects overruns", () => {
    const s = summarizeBudget(85_000, communityPlan().budgetItems);
    expect(s.overrun).toBe(10_000);
    expect(s.remaining).toBe(0);
    const a = analyzeOverrun(85_000, communityPlan().budgetItems);
    expect(a.savingCandidates.map((i) => i.id)).toEqual(["bud_decor", "bud_favours"]);
    expect(a.flexibleOptionalAmount).toBe(15_000);
  });

  it("scales per-guest estimates only, never fixed items or vendor figures", () => {
    const { items, impacts } = applyGuestCountChange(communityPlan().budgetItems, 150);
    const byId = Object.fromEntries(items.map((i) => [i.id, i.amount]));
    expect(byId).toMatchObject({ bud_catering: 60_000, bud_favours: 7_500, bud_venue: 20_000, bud_photo: 15_000, bud_decor: 10_000, bud_chairs: 5_000 });
    const chairs = impacts.find((i) => i.itemId === "bud_chairs");
    expect(chairs).toMatchObject({ updated: false, after: 7_500 });
  });

  it("handles invalid manual amounts safely", () => {
    const plan = communityPlan();
    expect(updateBudgetItem(plan, "bud_decor", { amount: -500 }).budgetItems.find((i) => i.id === "bud_decor")?.amount).toBe(0);
    expect(updateBudgetItem(plan, "bud_decor", { amount: Number.NaN }).budgetItems.find((i) => i.id === "bud_decor")?.amount).toBe(0);
    expect(addBudgetItem(plan, { category: "X", description: "Y", amount: Number.POSITIVE_INFINITY, essential: false, costStatus: "estimate" }).budgetItems.at(-1)?.amount).toBe(0);
  });
});
