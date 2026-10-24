import { z } from "zod";
import { createId, roundMoney } from "./ids";
import { rescheduleTasks, validateDependencies } from "./timeline";
import {
  COST_SCALINGS,
  EVENT_CATEGORIES,
  TASK_PRIORITIES,
  type EventDetails,
  type EventPlan,
  type Task,
  type VendorRequirement,
} from "./types";

/* ---------- AI output: details extracted from natural language ---------- */

export const extractedEventSchema = z.object({
  name: z.string().max(120).nullable(),
  category: z.enum(EVENT_CATEGORIES).nullable(),
  date: z.string().max(20).nullable(),
  dateIsApproximate: z.boolean(),
  location: z.string().max(300).nullable(),
  guestCount: z.number().int().min(1).max(10_000).nullable(),
  budget: z.number().min(0).max(1_000_000_000).nullable(),
  currency: z.string().max(3).nullable(),
  theme: z.string().max(300).nullable(),
  priorities: z.array(z.string().max(300)).max(10),
  mustHaves: z.array(z.string().max(300)).max(15),
  accessibilityNeeds: z.array(z.string().max(300)).max(10),
  dietaryCulturalNeeds: z.array(z.string().max(300)).max(10),
  constraints: z.array(z.string().max(300)).max(10),
  missingInformation: z.array(z.string().max(200)).max(10),
  followUpQuestions: z.array(z.string().max(300)).max(5),
  assumptions: z.array(z.string().max(300)).max(10),
});
export type ExtractedEvent = z.infer<typeof extractedEventSchema>;

/* ---------- AI output: initial plan draft ---------- */

export const planDraftSchema = z.object({
  assumptions: z.array(z.string().max(400)).max(15),
  ideas: z.array(z.string().max(400)).max(10),
  budgetItems: z
    .array(
      z.object({
        category: z.string().min(1).max(60),
        description: z.string().min(1).max(300),
        scaling: z.enum(COST_SCALINGS),
        unitCost: z.number().min(0).max(10_000_000).nullable(),
        amount: z.number().min(0).max(1_000_000_000),
        essential: z.boolean(),
        notes: z.string().max(300),
      }),
    )
    .min(3)
    .max(30),
  tasks: z
    .array(
      z.object({
        key: z.string().min(1).max(40),
        title: z.string().min(1).max(140),
        description: z.string().max(600),
        priority: z.enum(TASK_PRIORITIES),
        daysBeforeEvent: z.number().int().min(0).max(730),
        dependsOnKeys: z.array(z.string().max(40)).max(6),
        notes: z.string().max(300),
      }),
    )
    .min(3)
    .max(40),
  vendors: z
    .array(
      z.object({
        category: z.string().min(1).max(60),
        requirement: z.string().min(1).max(600),
        questions: z.array(z.string().max(300)).max(8),
        budgetCategory: z.string().max(60).nullable(),
      }),
    )
    .max(15),
});
export type PlanDraft = z.infer<typeof planDraftSchema>;

export class PlanBuildError extends Error {}

/**
 * Turns a validated AI draft into an authoritative plan: assigns stable IDs,
 * computes amounts and deadlines deterministically, and marks every cost as an
 * estimate (the AI cannot produce quotes or confirmations).
 */
export function buildPlanFromDraft(event: EventDetails, draft: PlanDraft, today: string, nowIso: string): EventPlan {
  const budgetItems = draft.budgetItems.map((d) => {
    const perGuest = d.scaling === "per_guest";
    const unitCost = perGuest ? (d.unitCost ?? d.amount / event.guestCount) : null;
    const amount = perGuest && unitCost !== null ? roundMoney(unitCost * event.guestCount) : roundMoney(d.amount);
    return {
      id: createId("bud"),
      category: d.category.trim(),
      description: d.description.trim(),
      scaling: d.scaling,
      unitCost,
      amount,
      costStatus: "estimate" as const,
      essential: d.essential,
      notes: d.notes.trim() || "AI planning estimate — not a vendor price.",
    };
  });

  const keyToId = new Map(draft.tasks.map((t) => [t.key, createId("task")]));
  const droppedDeps: string[] = [];
  const draftTasks: Task[] = draft.tasks.map((t) => ({
    id: keyToId.get(t.key)!,
    title: t.title.trim(),
    description: t.description.trim(),
    priority: t.priority,
    status: "not_started",
    daysBeforeEvent: t.daysBeforeEvent,
    deadline: event.date,
    dependsOn: t.dependsOnKeys
      .filter((k) => {
        const ok = keyToId.has(k) && k !== t.key;
        if (!ok) droppedDeps.push(`${t.title} → ${k}`);
        return ok;
      })
      .map((k) => keyToId.get(k)!),
    notes: t.notes.trim(),
  }));

  const cycles = validateDependencies(draftTasks).filter((i) => i.kind === "cycle");
  if (cycles.length) throw new PlanBuildError("The proposed task list contained circular dependencies.");

  const { tasks } = rescheduleTasks(draftTasks, event.date, today);

  const vendors: VendorRequirement[] = draft.vendors.map((v) => {
    const match = budgetItems.find(
      (b) => b.category.toLowerCase() === (v.budgetCategory ?? v.category).toLowerCase(),
    );
    return {
      id: createId("ven"),
      category: v.category.trim(),
      requirement: v.requirement.trim(),
      budgetItemId: match?.id ?? null,
      quotes: [],
      questions: v.questions,
      bookingStatus: "not_contacted",
      notes: "",
    };
  });

  const assumptions = [...draft.assumptions, "All costs are AI planning estimates until you record a vendor quote or confirmation."];
  if (event.dateIsApproximate) assumptions.push(`The date ${event.date} is approximate; deadlines will move when you confirm it.`);
  if (droppedDeps.length) assumptions.push(`${droppedDeps.length} invalid task dependency reference(s) were ignored.`);

  return {
    schemaVersion: 1,
    id: createId("evt"),
    revision: 1,
    event,
    assumptions: assumptions.slice(0, 30),
    ideas: draft.ideas,
    budgetItems,
    tasks,
    vendors,
    history: [
      {
        id: createId("rev"),
        revision: 1,
        at: nowIso,
        request: "Initial plan",
        summary: `Initial plan generated with ${budgetItems.length} budget items, ${tasks.length} tasks and ${vendors.length} vendor requirements.`,
        changes: [],
        consequences: [],
      },
    ],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
