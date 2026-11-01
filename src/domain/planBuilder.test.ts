import { describe, expect, it } from "vitest";
import { communityPlan, TODAY } from "@/test/fixtures";
import { buildPlanFromDraft, planDraftSchema, PlanBuildError, type PlanDraft } from "./planBuilder";
import { eventPlanSchema } from "./types";

function sampleDraft(taskKeys: string[] = ["task_a", "task_b", "task_c"]): PlanDraft {
  return {
    assumptions: ["Assumption 1"],
    ideas: ["Idea 1"],
    budgetItems: [
      {
        category: "Venue",
        description: "Hall rental",
        scaling: "fixed",
        unitCost: null,
        amount: 20_000,
        essential: true,
        notes: "",
      },
      {
        category: "Catering",
        description: "Dinner buffet",
        scaling: "per_guest",
        unitCost: 300,
        amount: 30_000,
        essential: true,
        notes: "",
      },
      {
        category: "Decor",
        description: "Flowers and lighting",
        scaling: "fixed",
        unitCost: null,
        amount: 5_000,
        essential: false,
        notes: "",
      },
    ],
    tasks: taskKeys.map((key, i) => ({
      key,
      title: `Task ${key}`,
      description: `Description for ${key}`,
      priority: "medium" as const,
      daysBeforeEvent: 10 + i * 5,
      dependsOnKeys: i > 0 && taskKeys[i - 1] ? [taskKeys[i - 1]!] : [],
      notes: "",
    })),
    vendors: [
      {
        category: "Venue",
        requirement: "Space for 100",
        questions: ["Is sound equipment included?"],
        budgetCategory: "Venue",
      },
    ],
  };
}

describe("planBuilder task key and ID uniqueness", () => {
  it("rejects drafts with duplicate task keys at schema validation", () => {
    const draftWithDuplicateKeys = sampleDraft(["dup_key", "dup_key", "task_c"]);
    const result = planDraftSchema.safeParse(draftWithDuplicateKeys);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.message === "Task keys must be unique"),
      ).toBe(true);
    }
  });

  it("throws PlanBuildError when buildPlanFromDraft receives duplicate task keys", () => {
    const rawDraft = sampleDraft(["same_key", "same_key", "task_3"]);
    expect(() =>
      buildPlanFromDraft(communityPlan().event, rawDraft, TODAY, new Date().toISOString()),
    ).toThrow(PlanBuildError);
    expect(() =>
      buildPlanFromDraft(communityPlan().event, rawDraft, TODAY, new Date().toISOString()),
    ).toThrow(/duplicate task keys/);
  });

  it("builds unique task IDs and maps dependencies correctly for valid distinct task keys", () => {
    const draft = sampleDraft(["venue_key", "invites_key", "caterer_key"]);
    const plan = buildPlanFromDraft(communityPlan().event, draft, TODAY, new Date().toISOString());

    const taskIds = plan.tasks.map((t) => t.id);
    expect(new Set(taskIds).size).toBe(3);

    // Dependencies must resolve to the unique generated IDs
    const [task0, task1, task2] = plan.tasks;
    expect(task0?.dependsOn).toEqual([]);
    expect(task1?.dependsOn).toEqual([task0?.id]);
    expect(task2?.dependsOn).toEqual([task1?.id]);

    // Ensure the generated plan passes eventPlanSchema validation
    const parsed = eventPlanSchema.safeParse(plan);
    expect(parsed.success).toBe(true);
  });

  it("enforces unique task IDs in eventPlanSchema", () => {
    const plan = communityPlan();
    // Inject a duplicate task ID
    const duplicateIdTasks = [
      ...plan.tasks,
      {
        ...plan.tasks[0]!,
        title: "Duplicate ID task",
      },
    ];
    const invalidPlan = { ...plan, tasks: duplicateIdTasks };
    const result = eventPlanSchema.safeParse(invalidPlan);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === "Task IDs must be unique")).toBe(
        true,
      );
    }
  });
});
