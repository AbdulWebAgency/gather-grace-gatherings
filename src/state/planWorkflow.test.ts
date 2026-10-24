import { describe, expect, it } from "vitest";
import { communityPlan, op, proposal, TODAY } from "@/test/fixtures";
import { commitChange } from "@/domain/planChange";
import { createPlan, previewPendingChange, requestPlanChange, type ProposeFn } from "./planWorkflow";

const propose = (ops: Parameters<typeof proposal>[0]): ProposeFn => async () => ({ ok: true, data: proposal(ops) });

describe("plan workflow failure handling", () => {
  it("leaves the plan unchanged when the AI fails or throws", async () => {
    const plan = communityPlan();
    const snapshot = structuredClone(plan);
    const failed = await requestPlanChange(plan, "Add 50 guests", async () => ({ ok: false, error: "AI down" }), TODAY);
    expect(failed).toEqual({ status: "error", message: "AI down" });
    const thrown = await requestPlanChange(plan, "Add 50 guests", async () => { throw new Error("network"); }, TODAY);
    expect(thrown.status).toBe("error");
    expect(plan).toEqual(snapshot);
  });

  it("reports an error when the AI draft cannot be built", async () => {
    const r = await createPlan(communityPlan().event, async () => ({ ok: false, error: "malformed" }), TODAY);
    expect(r).toEqual({ status: "error", message: "malformed" });
  });

  it("drops invalid operations without corrupting the plan; discarding keeps it unchanged", async () => {
    const plan = communityPlan();
    const snapshot = structuredClone(plan);
    const r = await requestPlanChange(
      plan,
      "mixed",
      propose([op({ type: "set_guest_count", numberValue: -5 }), op({ type: "remove_budget_item", targetId: "bud_venue" }), op({ type: "set_budget", numberValue: 90_000 })]),
      TODAY,
    );
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.value.validation.rejected).toHaveLength(2);
    const preview = previewPendingChange(plan, r.value, TODAY);
    expect(preview.plan.event.guestCount).toBe(100);
    expect(preview.plan.event.budget).toBe(90_000);
    expect(preview.plan.budgetItems).toEqual(plan.budgetItems);
    expect(plan).toEqual(snapshot); // discarding = never committing the preview
  });
});

describe("acceptance scenario: 150 guests, ₹85,000, two weeks earlier", () => {
  it("updates the plan through the real validation, preview and commit path", async () => {
    const plan = communityPlan();
    const snapshot = structuredClone(plan);
    const r = await requestPlanChange(
      plan,
      "Increase the guest count to 150, reduce the budget to ₹85,000, and move the event two weeks earlier.",
      propose([
        op({ type: "shift_event_date_days", numberValue: -14 }),
        op({ type: "set_budget", numberValue: 85_000 }),
        op({ type: "set_guest_count", numberValue: 150 }),
      ]),
      TODAY,
    );
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.value.validation.rejected).toEqual([]);
    expect(r.value.selected).toHaveLength(3);

    const preview = previewPendingChange(plan, r.value, TODAY);
    expect(plan).toEqual(snapshot); // nothing applied before acceptance

    const next = commitChange(preview, r.value.request, "summary", "2026-03-01T10:00:00.000Z");
    expect(next.event).toMatchObject({ guestCount: 150, budget: 85_000, date: "2026-03-29" });
    expect(next.revision).toBe(2);
    expect(next.history[0]?.changes.length).toBeGreaterThan(0);

    const amount = (id: string) => next.budgetItems.find((i) => i.id === id)?.amount;
    expect(amount("bud_catering")).toBe(60_000);
    expect(amount("bud_favours")).toBe(7_500);
    expect(amount("bud_venue")).toBe(20_000);
    expect(amount("bud_photo")).toBe(15_000);
    expect(amount("bud_decor")).toBe(10_000);
    expect(amount("bud_chairs")).toBe(5_000); // confirmed: kept, flagged
    expect(preview.report.guestImpacts.find((i) => i.itemId === "bud_chairs")?.updated).toBe(false);

    expect(preview.report.budgetAfter.totalPlanned).toBe(117_500);
    expect(preview.report.budgetAfter.overrun).toBe(32_500);
    expect(preview.report.budgetAfter.byStatus).toEqual({ estimate: 77_500, quoted: 15_000, confirmed: 25_000 });
    expect(preview.report.overrun?.overrun).toBe(32_500);

    const task = (id: string) => next.tasks.find((t) => t.id === id)!;
    expect(task("task_venue")).toMatchObject({ status: "completed", deadline: "2026-03-08" });
    expect(task("task_invites").deadline).toBe(TODAY);
    expect(task("task_caterer")).toMatchObject({ deadline: "2026-03-08", status: "in_progress" });
    expect(task("task_menu").deadline).toBe("2026-03-19");
    expect(task("task_decor").deadline).toBe("2026-03-26");
    expect(preview.report.dependencyIssues).toEqual([]);
    expect(preview.report.attention.map((t) => t.id)).toEqual(["task_invites", "task_caterer"]);
    expect(preview.report.scheduleImpacts.find((i) => i.taskId === "task_invites")?.reason).toBe("compressed");

    expect(next.vendors).toEqual(plan.vendors);
    expect(next.tasks.map((t) => t.id)).toEqual(plan.tasks.map((t) => t.id));
    expect(next.budgetItems.map((i) => i.id)).toEqual(plan.budgetItems.map((i) => i.id));
  });
});
