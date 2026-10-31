import { describe, expect, it } from "vitest";
import { communityPlan, op, proposal, TODAY } from "@/test/fixtures";
import { applyOperations, planChangeProposalSchema, validateProposal } from "./planChange";
import { planDraftSchema } from "./planBuilder";

const validate = (ops: Parameters<typeof proposal>[0]) =>
  validateProposal(communityPlan(), proposal(ops), TODAY);

describe("plan-change validation", () => {
  it("accepts valid guest, budget and date updates", () => {
    const v = validate([
      op({ type: "set_guest_count", numberValue: 150 }),
      op({ type: "set_budget", numberValue: 85_000 }),
      op({ type: "shift_event_date_days", numberValue: -14 }),
    ]);
    expect(v.rejected).toEqual([]);
    expect(v.operations.map((o) => o.operation)).toEqual([
      { type: "set_guest_count", value: 150 },
      { type: "set_budget", value: 85_000 },
      { type: "set_event_date", date: "2026-03-29" },
    ]);
  });

  it("rejects invalid guest counts, budgets and dates", () => {
    const v = validate([
      op({ type: "set_guest_count", numberValue: 0 }),
      op({ type: "set_guest_count", numberValue: 12.5 }),
      op({ type: "set_budget", numberValue: -100 }),
      op({ type: "set_budget", numberValue: 0.4 }),
      op({ type: "set_event_date", dateValue: "2026-02-01" }),
      op({ type: "set_event_date", dateValue: "2026-02-30" }),
      op({ type: "shift_event_date_days", numberValue: -60 }),
    ]);
    expect(v.operations).toEqual([]);
    expect(v.rejected).toHaveLength(7);
  });

  it("rejects references to nonexistent records", () => {
    const v = validate([
      op({ type: "update_task_status", targetId: "nope", statusValue: "completed" }),
      op({ type: "update_budget_item_amount", targetId: "nope", numberValue: 10 }),
      op({ type: "set_vendor_booking_status", targetId: "nope", statusValue: "booked" }),
    ]);
    expect(v.operations).toEqual([]);
    expect(v.rejected).toHaveLength(3);
  });

  it("protects essential items and confirmed or quoted costs", () => {
    const v = validate([
      op({ type: "remove_budget_item", targetId: "bud_catering" }),
      op({ type: "update_budget_item_amount", targetId: "bud_venue", numberValue: 1 }),
      op({ type: "update_budget_item_amount", targetId: "bud_photo", numberValue: 1 }),
    ]);
    expect(v.operations).toEqual([]);
    expect(v.rejected).toHaveLength(3);
  });

  it("requires explicit confirmation for extreme and zero reductions while allowing legitimate free optional services", () => {
    const extreme = validate([
      op({ type: "update_budget_item_amount", targetId: "bud_decor", numberValue: 1_000 }),
    ]);
    expect(extreme.rejected).toEqual([]);
    expect(extreme.operations[0]?.confirmationReason).toMatch(/at least half/);

    const zero = validate([
      op({ type: "update_budget_item_amount", targetId: "bud_decor", numberValue: 0 }),
    ]);
    expect(zero.rejected).toEqual([]);
    expect(zero.operations[0]?.confirmationReason).toMatch(/zero/);
    expect(zero.operations[0]?.operation).toMatchObject({
      type: "update_budget_item_amount",
      amount: 0,
    });
  });

  it("requires confirmation before setting every budget estimate to zero", () => {
    const plan = communityPlan();
    plan.budgetItems = [
      ...plan.budgetItems,
      {
        ...plan.budgetItems[3]!,
        id: "bud_buffer",
        description: "Budget buffer",
        essential: false,
        costStatus: "estimate",
      },
    ].map((item) => ({ ...item, essential: false, costStatus: "estimate" as const }));
    const v = validateProposal(
      plan,
      proposal(
        plan.budgetItems.map((item) =>
          op({ type: "update_budget_item_amount", targetId: item.id, numberValue: 0 }),
        ),
      ),
      TODAY,
    );
    expect(v.rejected).toEqual([]);
    expect(v.operations).toHaveLength(7);
    expect(
      v.operations.every(
        (item) =>
          item.operation.type === "update_budget_item_amount" && item.operation.amount === 0,
      ),
    ).toBe(true);
    expect(v.operations.every((item) => item.confirmationReason?.includes("zero"))).toBe(true);
  });
  it("rejects reducing essential estimates to zero and removing essential items", () => {
    const v = validate([
      op({ type: "update_budget_item_amount", targetId: "bud_catering", numberValue: 0 }),
      op({ type: "remove_budget_item", targetId: "bud_photo" }),
    ]);
    expect(v.operations).toEqual([]);
    expect(v.rejected).toHaveLength(2);
  });

  it("requires confirmation for a proposal that reduces half or more of the budget items", () => {
    const plan = communityPlan();
    plan.budgetItems = plan.budgetItems.map((item) => ({
      ...item,
      costStatus: "estimate",
      essential: false,
    }));
    const v = validateProposal(
      plan,
      proposal(
        plan.budgetItems.map((item) =>
          op({
            type: "update_budget_item_amount",
            targetId: item.id,
            numberValue: item.amount * 0.9,
          }),
        ),
      ),
      TODAY,
    );
    expect(v.operations).toHaveLength(plan.budgetItems.length);
    expect(v.operations.every((item) => item.confirmationReason !== null)).toBe(true);
  });

  it("counts only accepted decreases when deciding whether a broad review is needed", () => {
    const plan = communityPlan();
    plan.budgetItems = plan.budgetItems.map((item, index) => ({
      ...item,
      costStatus: "estimate",
      essential: index < plan.budgetItems.length - 2,
    }));
    const v = validateProposal(
      plan,
      proposal(
        plan.budgetItems.map((item) =>
          op({
            type: "update_budget_item_amount",
            targetId: item.id,
            numberValue: item.amount * 0.9,
          }),
        ),
      ),
      TODAY,
    );
    expect(v.rejected).toHaveLength(plan.budgetItems.length - 2);
    expect(v.operations).toHaveLength(2);
    expect(v.operations.every((item) => item.confirmationReason === null)).toBe(true);
  });

  it("rejects AI additions that would exceed the plan schema item limits", () => {
    const plan = communityPlan();
    plan.budgetItems = Array.from({ length: 60 }, (_, index) => ({
      ...plan.budgetItems[0]!,
      id: `bud_${index}`,
    }));
    plan.tasks = Array.from({ length: 80 }, (_, index) => ({
      ...plan.tasks[0]!,
      id: `task_${index}`,
    }));
    const v = validateProposal(
      plan,
      proposal([
        op({
          type: "add_budget_item",
          textValue: "Extra item",
          category: "Other",
          numberValue: 10,
        }),
        op({ type: "add_task", textValue: "Extra task", numberValue: 7 }),
      ]),
      TODAY,
    );
    expect(v.operations).toEqual([]);
    expect(v.rejected.map((item) => item.reason)).toEqual([
      "An event plan can have at most 60 budget items.",
      "An event plan can have at most 80 tasks.",
    ]);
  });

  it("rejects duplicate contradictory amount updates and no-op estimates", () => {
    const v = validate([
      op({ type: "update_budget_item_amount", targetId: "bud_decor", numberValue: 9_000 }),
      op({ type: "update_budget_item_amount", targetId: "bud_decor", numberValue: 8_000 }),
      op({ type: "update_budget_item_amount", targetId: "bud_favours", numberValue: 5_000 }),
    ]);
    expect(v.operations).toHaveLength(1);
    expect(v.rejected).toHaveLength(2);
  });
  it("requires user confirmation for bookings, confirmations and reopening work", () => {
    const v = validate([
      op({ type: "set_vendor_booking_status", targetId: "ven_caterer", statusValue: "booked" }),
      op({ type: "set_budget_item_cost_status", targetId: "bud_decor", statusValue: "confirmed" }),
      op({ type: "update_task_status", targetId: "task_venue", statusValue: "in_progress" }),
      op({ type: "set_budget_item_essential", targetId: "bud_catering", essential: false }),
    ]);
    expect(v.operations).toHaveLength(4);
    expect(v.operations.every((o) => o.confirmationReason !== null)).toBe(true);
  });

  it("rejects malformed structured AI output", () => {
    expect(
      planChangeProposalSchema.safeParse({ intent: "modify", operations: "lots" }).success,
    ).toBe(false);
    expect(
      planChangeProposalSchema.safeParse({
        ...proposal([]),
        operations: [{ type: "delete_everything" }],
      }).success,
    ).toBe(false);
    expect(
      planDraftSchema.safeParse({
        assumptions: [],
        ideas: [],
        budgetItems: [],
        tasks: [],
        vendors: [],
      }).success,
    ).toBe(false);
  });

  it("never mutates the original plan and keeps unaffected records intact", () => {
    const plan = communityPlan();
    const snapshot = structuredClone(plan);
    const v = validateProposal(
      plan,
      proposal([op({ type: "remove_budget_item", targetId: "bud_decor" })]),
      TODAY,
    );
    const { plan: next } = applyOperations(
      plan,
      v.operations.map((o) => o.operation),
      TODAY,
    );
    expect(plan).toEqual(snapshot);
    expect(next.budgetItems.map((i) => i.id)).not.toContain("bud_decor");
    expect(next.budgetItems.find((i) => i.id === "bud_photo")).toEqual(
      plan.budgetItems.find((i) => i.id === "bud_photo"),
    );
    expect(next.tasks).toEqual(plan.tasks);
  });
});
