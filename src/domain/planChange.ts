import { z } from "zod";
import {
  analyzeOverrun,
  applyGuestCountChange,
  formatMoney,
  summarizeBudget,
  type BudgetSummary,
  type GuestCountImpact,
  type OverrunAnalysis,
} from "./budget";
import { createId, roundMoney } from "./ids";
import {
  daysBetween,
  computeDeadline,
  rescheduleTasks,
  shiftIsoDate,
  tasksNeedingAttention,
  validateDependencies,
  type DependencyIssue,
  type TaskScheduleImpact,
} from "./timeline";
import {
  BOOKING_STATUSES,
  COST_SCALINGS,
  COST_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  isoDateSchema,
  type BookingStatus,
  type CostScaling,
  type CostStatus,
  type EventPlan,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "./types";

/* ------------------------------------------------------------------ */
/* Proposal shape (what the AI may suggest — never trusted as-is)      */
/* ------------------------------------------------------------------ */

export const OPERATION_TYPES = [
  "set_guest_count",
  "set_budget",
  "shift_event_date_days",
  "set_event_date",
  "update_budget_item_amount",
  "add_budget_item",
  "remove_budget_item",
  "set_budget_item_essential",
  "set_budget_item_cost_status",
  "update_task_status",
  "add_task",
  "set_vendor_booking_status",
] as const;
export type OperationType = (typeof OPERATION_TYPES)[number];

export const proposedOperationSchema = z.object({
  type: z.enum(OPERATION_TYPES),
  targetId: z.string().max(64).nullable(),
  numberValue: z.number().finite().nullable(),
  textValue: z.string().max(300).nullable(),
  dateValue: z.string().max(20).nullable(),
  statusValue: z.string().max(30).nullable(),
  category: z.string().max(60).nullable(),
  scaling: z.enum(COST_SCALINGS).nullable(),
  essential: z.boolean().nullable(),
  reason: z.string().max(400),
});
export type ProposedOperation = z.infer<typeof proposedOperationSchema>;

export const alternativeSchema = z.object({
  title: z.string().max(140),
  description: z.string().max(500),
  estimatedSaving: z.number().finite().min(0).nullable(),
  consequence: z.string().max(400),
});

export const planChangeProposalSchema = z.object({
  intent: z.enum(["modify", "question"]),
  summary: z.string().max(800),
  answer: z.string().max(2000),
  operations: z.array(proposedOperationSchema).max(20),
  tradeoffs: z.array(z.string().max(400)).max(8),
  alternatives: z.array(alternativeSchema).max(6),
  clarifyingQuestions: z.array(z.string().max(300)).max(5),
});
export type PlanChangeProposal = z.infer<typeof planChangeProposalSchema>;

/* ------------------------------------------------------------------ */
/* Validated, normalised operations                                    */
/* ------------------------------------------------------------------ */

export type NormalizedOperation =
  | { type: "set_guest_count"; value: number }
  | { type: "set_budget"; value: number }
  | { type: "set_event_date"; date: string }
  | { type: "update_budget_item_amount"; itemId: string; amount: number }
  | {
      type: "add_budget_item";
      category: string;
      description: string;
      amount: number;
      scaling: CostScaling;
      essential: boolean;
    }
  | { type: "remove_budget_item"; itemId: string }
  | { type: "set_budget_item_essential"; itemId: string; essential: boolean }
  | { type: "set_budget_item_cost_status"; itemId: string; status: CostStatus }
  | { type: "update_task_status"; taskId: string; status: TaskStatus }
  | {
      type: "add_task";
      title: string;
      description: string;
      daysBeforeEvent: number;
      priority: TaskPriority;
    }
  | { type: "set_vendor_booking_status"; vendorId: string; status: BookingStatus };

export interface ValidatedOperation {
  key: string;
  operation: NormalizedOperation;
  label: string;
  reason: string;
  /** Consequential changes need an explicit tick from the user before applying. */
  confirmationReason: string | null;
}

export interface RejectedOperation {
  label: string;
  reason: string;
}

export interface ProposalValidation {
  operations: ValidatedOperation[];
  rejected: RejectedOperation[];
}

const MAX_DATE_HORIZON_DAYS = 3 * 365;

const isOneOf = <T extends string>(values: readonly T[], v: string | null): v is T =>
  v !== null && (values as readonly string[]).includes(v);

const label = (s: string) => s.replace(/_/g, " ");

export function validateProposal(
  plan: EventPlan,
  proposal: PlanChangeProposal,
  today: string,
): ProposalValidation {
  const operations: ValidatedOperation[] = [];
  const rejected: RejectedOperation[] = [];
  const { event } = plan;
  const money = (n: number) => formatMoney(n, event.currency);
  const reject = (l: string, reason: string) => rejected.push({ label: l, reason });
  const accept = (
    operation: NormalizedOperation,
    l: string,
    reason: string,
    confirmationReason: string | null = null,
  ) => {
    // Event-level operations are singletons: the last proposal wins.
    if (
      operation.type === "set_guest_count" ||
      operation.type === "set_budget" ||
      operation.type === "set_event_date"
    ) {
      const existing = operations.findIndex((o) => o.operation.type === operation.type);
      if (existing >= 0) operations.splice(existing, 1);
    }
    operations.push({ key: createId("op"), operation, label: l, reason, confirmationReason });
  };

  for (const op of proposal.operations) {
    const item = op.targetId ? plan.budgetItems.find((i) => i.id === op.targetId) : undefined;
    const task = op.targetId ? plan.tasks.find((t) => t.id === op.targetId) : undefined;
    const vendor = op.targetId ? plan.vendors.find((v) => v.id === op.targetId) : undefined;

    switch (op.type) {
      case "set_guest_count": {
        const v = op.numberValue;
        if (v === null || !Number.isInteger(v) || v < 1 || v > 10_000) {
          reject("Change guest count", "Guest count must be a whole number between 1 and 10,000.");
        } else if (v === event.guestCount) {
          reject("Change guest count", `Guest count is already ${v}.`);
        } else {
          accept(
            { type: "set_guest_count", value: v },
            `Guest count ${event.guestCount} → ${v}`,
            op.reason,
          );
        }
        break;
      }
      case "set_budget": {
        const v = op.numberValue;
        if (v === null || roundMoney(v) <= 0 || v > 1_000_000_000) {
          reject("Change budget", "Budget must be a positive amount.");
        } else if (v === event.budget) {
          reject("Change budget", `Budget is already ${money(v)}.`);
        } else {
          accept(
            { type: "set_budget", value: roundMoney(v) },
            `Budget ${money(event.budget)} → ${money(v)}`,
            op.reason,
          );
        }
        break;
      }
      case "shift_event_date_days":
      case "set_event_date": {
        let date: string | null = null;
        if (op.type === "shift_event_date_days") {
          const d = op.numberValue;
          if (d !== null && Number.isInteger(d) && d !== 0 && Math.abs(d) <= 730)
            date = shiftIsoDate(event.date, d);
        } else if (op.dateValue && isoDateSchema.safeParse(op.dateValue).success) {
          date = op.dateValue;
        }
        if (!date || Number.isNaN(Date.parse(date))) {
          reject("Change event date", "The new date could not be understood.");
        } else if (date === event.date) {
          reject("Change event date", "The event is already on that date.");
        } else if (daysBetween(today, date) < 0) {
          reject("Change event date", `The new date (${date}) would be in the past.`);
        } else if (daysBetween(today, date) > MAX_DATE_HORIZON_DAYS) {
          reject("Change event date", "The new date is more than three years away.");
        } else {
          accept({ type: "set_event_date", date }, `Event date ${event.date} → ${date}`, op.reason);
        }
        break;
      }
      case "update_budget_item_amount": {
        const v = op.numberValue;
        if (!item) reject("Update budget item", "Referenced budget item does not exist.");
        else if (v === null || v < 0 || v > 1_000_000_000)
          reject(`Update ${item.description}`, "Amount must be zero or more.");
        else if (item.costStatus !== "estimate")
          reject(
            `Update ${item.description}`,
            `This is a ${item.costStatus} vendor figure. Only you can change it, in the Budget tab.`,
          );
        else if (
          operations.some(
            (existing) =>
              existing.operation.type === "update_budget_item_amount" &&
              existing.operation.itemId === item.id,
          )
        )
          reject(
            `Update ${item.description}`,
            "This item has more than one proposed amount. Review it as a single change.",
          );
        else if (roundMoney(v) === item.amount)
          reject(`Update ${item.description}`, "The estimate is already this amount.");
        else if (item.essential && roundMoney(v) < item.amount)
          reject(
            `Update ${item.description}`,
            "This item is marked essential. The assistant can only reduce optional estimates; adjust this priority yourself first if your plans have changed.",
          );
        else {
          const decrease = item.amount > 0 ? (item.amount - roundMoney(v)) / item.amount : 0;
          const needsConfirmation = decrease >= 0.5 || roundMoney(v) === 0;
          const confirmation = needsConfirmation
            ? roundMoney(v) === 0
              ? "This sets an estimated cost to zero. Confirm it is genuinely free or cancelled."
              : "This reduces the estimate by at least half. Confirm the new amount is realistic."
            : null;
          accept(
            { type: "update_budget_item_amount", itemId: item.id, amount: roundMoney(v) },
            `${item.description}: ${money(item.amount)} → ${money(v)} (estimate)`,
            op.reason,
            confirmation,
          );
        }
        break;
      }
      case "add_budget_item": {
        const v = op.numberValue;
        const description = op.textValue?.trim();
        const category = op.category?.trim();
        if (
          plan.budgetItems.length +
            operations.filter((entry) => entry.operation.type === "add_budget_item").length >=
          60
        ) {
          reject("Add budget item", "An event plan can have at most 60 budget items.");
        } else if (!description || !category || v === null || v < 0 || v > 1_000_000_000) {
          reject(
            "Add budget item",
            "A new item needs a category, description and non-negative amount.",
          );
        } else {
          accept(
            {
              type: "add_budget_item",
              category,
              description,
              amount: roundMoney(v),
              scaling: op.scaling ?? "fixed",
              essential: op.essential ?? false,
            },
            `Add ${description} (${money(v)} estimate)`,
            op.reason,
          );
        }
        break;
      }
      case "remove_budget_item": {
        if (!item) reject("Remove budget item", "Referenced budget item does not exist.");
        else if (item.essential)
          reject(
            `Remove ${item.description}`,
            "This item is marked essential. Mark it optional yourself first if you want to drop it.",
          );
        else if (item.costStatus === "confirmed")
          reject(
            `Remove ${item.description}`,
            "This cost is confirmed with a vendor and cannot be removed by the assistant.",
          );
        else
          accept(
            { type: "remove_budget_item", itemId: item.id },
            `Remove ${item.description} (saves ${money(item.amount)})`,
            op.reason,
          );
        break;
      }
      case "set_budget_item_essential": {
        if (!item || op.essential === null)
          reject("Change priority", "Referenced budget item does not exist.");
        else if (item.essential === op.essential)
          reject(`Change ${item.description}`, "No change needed.");
        else
          accept(
            { type: "set_budget_item_essential", itemId: item.id, essential: op.essential },
            `${item.description}: mark ${op.essential ? "essential" : "optional"}`,
            op.reason,
            op.essential ? null : "This changes one of your priorities.",
          );
        break;
      }
      case "set_budget_item_cost_status": {
        if (!item) reject("Change cost status", "Referenced budget item does not exist.");
        else if (!isOneOf(COST_STATUSES, op.statusValue))
          reject(`Change ${item.description}`, "Unknown cost status.");
        else if (op.statusValue === item.costStatus)
          reject(`Change ${item.description}`, "No change needed.");
        else
          accept(
            { type: "set_budget_item_cost_status", itemId: item.id, status: op.statusValue },
            `${item.description}: ${label(item.costStatus)} → ${label(op.statusValue)}`,
            op.reason,
            op.statusValue === "estimate"
              ? null
              : `Only confirm this if you actually have a ${op.statusValue === "confirmed" ? "confirmed agreement" : "quote"} from the vendor.`,
          );
        break;
      }
      case "update_task_status": {
        if (!task) reject("Update task", "Referenced task does not exist.");
        else if (!isOneOf(TASK_STATUSES, op.statusValue))
          reject(`Update ${task.title}`, "Unknown task status.");
        else if (op.statusValue === task.status)
          reject(`Update ${task.title}`, "No change needed.");
        else
          accept(
            { type: "update_task_status", taskId: task.id, status: op.statusValue },
            `${task.title}: ${label(task.status)} → ${label(op.statusValue)}`,
            op.reason,
            task.status === "completed" ? "This reopens work you already completed." : null,
          );
        break;
      }
      case "add_task": {
        const title = op.textValue?.trim();
        const days = op.numberValue;
        if (
          plan.tasks.length +
            operations.filter((entry) => entry.operation.type === "add_task").length >=
          80
        ) {
          reject("Add task", "An event plan can have at most 80 tasks.");
        } else if (!title || days === null || !Number.isInteger(days) || days < 0 || days > 730) {
          reject("Add task", "A new task needs a title and a lead time in whole days.");
        } else {
          const priority: TaskPriority = isOneOf(TASK_PRIORITIES, op.statusValue)
            ? op.statusValue
            : "medium";
          accept(
            {
              type: "add_task",
              title,
              description: op.reason.slice(0, 600),
              daysBeforeEvent: days,
              priority,
            },
            `Add task: ${title}`,
            op.reason,
          );
        }
        break;
      }
      case "set_vendor_booking_status": {
        if (!vendor) reject("Update vendor", "Referenced vendor requirement does not exist.");
        else if (!isOneOf(BOOKING_STATUSES, op.statusValue))
          reject(`Update ${vendor.category}`, "Unknown booking status.");
        else if (op.statusValue === vendor.bookingStatus)
          reject(`Update ${vendor.category}`, "No change needed.");
        else
          accept(
            { type: "set_vendor_booking_status", vendorId: vendor.id, status: op.statusValue },
            `${vendor.category}: ${label(vendor.bookingStatus)} → ${label(op.statusValue)}`,
            op.reason,
            op.statusValue === "booked"
              ? "Only mark as booked if the vendor has actually confirmed your booking."
              : vendor.bookingStatus === "booked"
                ? "This changes an existing booking."
                : null,
          );
        break;
      }
    }
  }
  const acceptedDecreases = new Set(
    operations.flatMap((entry) => {
      const operation = entry.operation;
      if (operation.type !== "update_budget_item_amount") return [];
      const item = plan.budgetItems.find((current) => current.id === operation.itemId);
      return item && operation.amount < item.amount ? [item.id] : [];
    }),
  );
  const broadEstimateReduction =
    plan.budgetItems.length > 0 && acceptedDecreases.size >= Math.ceil(plan.budgetItems.length / 2);
  if (broadEstimateReduction) {
    for (const entry of operations) {
      const operation = entry.operation;
      if (operation.type !== "update_budget_item_amount" || entry.confirmationReason !== null)
        continue;
      entry.confirmationReason =
        "This is part of a proposal reducing at least half of the budget items. Review the full set of changes.";
    }
  }
  return { operations, rejected };
}

/* ------------------------------------------------------------------ */
/* Applying operations deterministically                               */
/* ------------------------------------------------------------------ */

export interface ChangeReport {
  changes: string[];
  consequences: string[];
  guestImpacts: GuestCountImpact[];
  scheduleImpacts: TaskScheduleImpact[];
  unchanged: { budgetItems: number; tasks: number; vendors: number };
  budgetBefore: BudgetSummary;
  budgetAfter: BudgetSummary;
  attention: Task[];
  overrun: OverrunAnalysis | null;
  dependencyIssues: DependencyIssue[];
}

export interface ChangePreview {
  plan: EventPlan;
  report: ChangeReport;
}

export function applyOperations(
  plan: EventPlan,
  operations: NormalizedOperation[],
  today: string,
): ChangePreview {
  const money = (n: number) => formatMoney(n, plan.event.currency);
  let event = { ...plan.event };
  let budgetItems = [...plan.budgetItems];
  let tasks = [...plan.tasks];
  let vendors = [...plan.vendors];
  const changes: string[] = [];
  const consequences: string[] = [];
  const touched = {
    items: new Set<string>(),
    tasks: new Set<string>(),
    vendors: new Set<string>(),
  };
  let guestImpacts: GuestCountImpact[] = [];
  let scheduleImpacts: TaskScheduleImpact[] = [];

  const order: NormalizedOperation["type"][] = ["set_guest_count", "set_budget", "set_event_date"];
  const sorted = [...operations].sort((a, b) => {
    const ra = order.indexOf(a.type);
    const rb = order.indexOf(b.type);
    return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb);
  });

  for (const op of sorted) {
    switch (op.type) {
      case "set_guest_count": {
        const previous = event.guestCount;
        event = { ...event, guestCount: op.value };
        const result = applyGuestCountChange(budgetItems, op.value);
        budgetItems = result.items;
        guestImpacts = result.impacts;
        result.impacts.forEach((i) => i.updated && touched.items.add(i.itemId));
        changes.push(`Guest count changed from ${previous} to ${op.value}.`);
        const fixedCount = budgetItems.filter((i) => i.scaling === "fixed").length;
        if (fixedCount)
          changes.push(`${fixedCount} fixed-price items were not scaled with guest count.`);
        const pending = result.impacts.filter((i) => !i.updated);
        if (pending.length)
          consequences.push(
            `${pending.length} vendor figure(s) were based on ${previous} guests and need revised quotes: ${pending.map((p) => p.description).join(", ")}.`,
          );
        if (op.value > previous && vendors.some((v) => /venue|hall|space/i.test(v.category)))
          consequences.push(
            `Check that the venue can accommodate ${op.value} guests — capacity has not been verified.`,
          );
        break;
      }
      case "set_budget": {
        changes.push(`Budget changed from ${money(event.budget)} to ${money(op.value)}.`);
        event = { ...event, budget: op.value };
        break;
      }
      case "set_event_date": {
        const previous = event.date;
        event = { ...event, date: op.date, dateIsApproximate: false };
        const result = rescheduleTasks(tasks, op.date, today);
        tasks = result.tasks;
        scheduleImpacts = result.impacts;
        result.impacts.forEach((i) => touched.tasks.add(i.taskId));
        const diff = daysBetween(previous, op.date);
        changes.push(
          `Event moved ${Math.abs(diff)} day(s) ${diff < 0 ? "earlier" : "later"}: ${previous} → ${op.date}. ${result.impacts.length} task deadline(s) recalculated; completed tasks kept as they were.`,
        );
        const compressed = result.impacts.filter((i) => i.reason === "compressed");
        if (compressed.length)
          consequences.push(
            `${compressed.length} task(s) no longer have their ideal lead time and are now due today: ${compressed.map((c) => c.title).join(", ")}.`,
          );
        const booked = vendors.filter((v) => v.bookingStatus === "booked");
        if (booked.length)
          consequences.push(
            `Booked vendors must confirm they are available on ${op.date} (not verified): ${booked.map((b) => b.category).join(", ")}.`,
          );
        break;
      }
      case "update_budget_item_amount": {
        budgetItems = budgetItems.map((i) => {
          if (i.id !== op.itemId) return i;
          changes.push(
            `${i.description} estimate changed from ${money(i.amount)} to ${money(op.amount)}.`,
          );
          const unitCost = i.scaling === "per_guest" ? op.amount / event.guestCount : i.unitCost;
          return { ...i, amount: op.amount, unitCost };
        });
        touched.items.add(op.itemId);
        break;
      }
      case "add_budget_item": {
        const id = createId("bud");
        budgetItems.push({
          id,
          category: op.category,
          description: op.description,
          scaling: op.scaling,
          unitCost: op.scaling === "per_guest" ? op.amount / event.guestCount : null,
          amount: op.amount,
          costStatus: "estimate",
          essential: op.essential,
          notes: "Planning estimate suggested by the assistant.",
        });
        touched.items.add(id);
        changes.push(`Added ${op.description} (${money(op.amount)} estimate).`);
        break;
      }
      case "remove_budget_item": {
        const item = budgetItems.find((i) => i.id === op.itemId);
        if (!item) break;
        budgetItems = budgetItems.filter((i) => i.id !== op.itemId);
        vendors = vendors.map((v) =>
          v.budgetItemId === op.itemId ? { ...v, budgetItemId: null } : v,
        );
        touched.items.add(op.itemId);
        changes.push(`Removed ${item.description} (${money(item.amount)}).`);
        break;
      }
      case "set_budget_item_essential": {
        budgetItems = budgetItems.map((i) =>
          i.id === op.itemId ? { ...i, essential: op.essential } : i,
        );
        touched.items.add(op.itemId);
        const item = budgetItems.find((i) => i.id === op.itemId);
        if (item)
          changes.push(`${item.description} marked ${op.essential ? "essential" : "optional"}.`);
        break;
      }
      case "set_budget_item_cost_status": {
        budgetItems = budgetItems.map((i) =>
          i.id === op.itemId ? { ...i, costStatus: op.status } : i,
        );
        touched.items.add(op.itemId);
        const item = budgetItems.find((i) => i.id === op.itemId);
        if (item) changes.push(`${item.description} cost status set to ${label(op.status)}.`);
        break;
      }
      case "update_task_status": {
        tasks = tasks.map((t) => (t.id === op.taskId ? { ...t, status: op.status } : t));
        touched.tasks.add(op.taskId);
        const task = tasks.find((t) => t.id === op.taskId);
        if (task) changes.push(`Task "${task.title}" set to ${label(op.status)}.`);
        break;
      }
      case "add_task": {
        const id = createId("task");
        const { deadline } = computeDeadline(event.date, op.daysBeforeEvent, today);
        tasks.push({
          id,
          title: op.title,
          description: op.description,
          priority: op.priority,
          status: "not_started",
          daysBeforeEvent: op.daysBeforeEvent,
          deadline,
          dependsOn: [],
          notes: "",
        });
        touched.tasks.add(id);
        changes.push(`Added task "${op.title}" due ${deadline}.`);
        break;
      }
      case "set_vendor_booking_status": {
        vendors = vendors.map((v) =>
          v.id === op.vendorId ? { ...v, bookingStatus: op.status } : v,
        );
        touched.vendors.add(op.vendorId);
        const vendor = vendors.find((v) => v.id === op.vendorId);
        if (vendor) changes.push(`${vendor.category} booking status set to ${label(op.status)}.`);
        break;
      }
    }
  }

  const budgetBefore = summarizeBudget(plan.event.budget, plan.budgetItems);
  const budgetAfter = summarizeBudget(event.budget, budgetItems);
  const overrun = budgetAfter.overrun > 0 ? analyzeOverrun(event.budget, budgetItems) : null;
  if (overrun) {
    consequences.unshift(
      `The plan is now ${money(overrun.overrun)} over budget (${money(budgetAfter.totalPlanned)} planned vs ${money(event.budget)}). Largest categories: ${overrun.topContributors.map((c) => `${c.category} ${money(c.amount)}`).join(", ")}.`,
    );
    if (overrun.flexibleOptionalAmount < overrun.overrun)
      consequences.push(
        `Optional unconfirmed items total only ${money(overrun.flexibleOptionalAmount)}, so essential items will also need cheaper options or the budget must rise.`,
      );
  } else if (budgetBefore.overrun > 0) {
    consequences.push("The plan is back within budget.");
  }

  const attention = tasksNeedingAttention(tasks, today);
  if (attention.length)
    consequences.push(`${attention.length} task(s) need attention within the next 7 days.`);
  const dependencyIssues = validateDependencies(tasks);

  const nextPlan: EventPlan = { ...plan, event, budgetItems, tasks, vendors };
  return {
    plan: nextPlan,
    report: {
      changes,
      consequences,
      guestImpacts,
      scheduleImpacts,
      unchanged: {
        budgetItems: plan.budgetItems.filter((i) => !touched.items.has(i.id)).length,
        tasks: plan.tasks.filter((t) => !touched.tasks.has(t.id)).length,
        vendors: plan.vendors.filter((v) => !touched.vendors.has(v.id)).length,
      },
      budgetBefore,
      budgetAfter,
      attention,
      overrun,
      dependencyIssues,
    },
  };
}

/** Records an approved change as a new revision with an explainable history entry. */
export function commitChange(
  preview: ChangePreview,
  request: string,
  summary: string,
  nowIso: string,
): EventPlan {
  const revision = preview.plan.revision + 1;
  return {
    ...preview.plan,
    revision,
    updatedAt: nowIso,
    history: [
      {
        id: createId("rev"),
        revision,
        at: nowIso,
        request: request.slice(0, 300),
        summary: summary.slice(0, 1200),
        changes: preview.report.changes.slice(0, 60),
        consequences: preview.report.consequences.slice(0, 60),
      },
      ...preview.plan.history,
    ].slice(0, 100),
  };
}
