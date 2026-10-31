import type { AIResult } from "@/ai/provider";
import { buildPlanFromDraft, type PlanDraft, PlanBuildError } from "@/domain/planBuilder";
import {
  applyOperations,
  validateProposal,
  type ChangePreview,
  type PlanChangeProposal,
  type ProposalValidation,
  type ValidatedOperation,
} from "@/domain/planChange";
import { eventPlanSchema, type EventDetails, type EventPlan } from "@/domain/types";

/**
 * Orchestration between AI calls and deterministic domain logic.
 * These functions never mutate the current plan; on failure the caller keeps
 * its existing state untouched.
 */

export type ProposeFn = (input: {
  plan: EventPlan;
  request: string;
  today: string;
}) => Promise<AIResult<PlanChangeProposal>>;
export type DraftFn = (input: {
  event: EventDetails;
  today: string;
}) => Promise<AIResult<PlanDraft>>;

export interface PendingChange {
  request: string;
  basePlanSignature: string;
  proposal: PlanChangeProposal;
  validation: ProposalValidation;
  /** Keys of operations the user has chosen to apply. */
  selected: string[];
}

export type WorkflowResult<T> = { status: "ok"; value: T } | { status: "error"; message: string };
export function createRequestSequence() {
  let current = 0;
  return {
    begin: () => ++current,
    invalidate: () => {
      current += 1;
    },
    isCurrent: (request: number) => request === current,
  };
}

export function validatePlanUpdate(
  plan: EventPlan,
  update: (plan: EventPlan) => EventPlan,
): WorkflowResult<EventPlan> {
  try {
    const parsed = eventPlanSchema.safeParse(update(plan));
    return parsed.success
      ? { status: "ok", value: parsed.data }
      : {
          status: "error",
          message: "This change would make the event plan invalid. Nothing was changed.",
        };
  } catch {
    return { status: "error", message: "This change could not be applied. Nothing was changed." };
  }
}

export function defaultSelection(operations: ValidatedOperation[]): string[] {
  return operations.filter((o) => o.confirmationReason === null).map((o) => o.key);
}

export async function requestPlanChange(
  plan: EventPlan,
  request: string,
  propose: ProposeFn,
  today: string,
): Promise<WorkflowResult<PendingChange>> {
  const trimmed = request.trim();
  if (trimmed.length < 2)
    return { status: "error", message: "Please describe the change you want." };
  if (trimmed.length > 2000)
    return { status: "error", message: "Please keep requests under 2,000 characters." };
  let result: AIResult<PlanChangeProposal>;
  try {
    result = await propose({ plan, request: trimmed, today });
  } catch {
    return {
      status: "error",
      message: "Could not reach the planning assistant. Your plan has not been changed.",
    };
  }
  if (!result.ok) return { status: "error", message: result.error };
  const validation = validateProposal(plan, result.data, today);
  return {
    status: "ok",
    value: {
      request: trimmed,
      basePlanSignature: JSON.stringify(plan),
      proposal: result.data,
      validation,
      selected: defaultSelection(validation.operations),
    },
  };
}

export function appliedChangeSummary(preview: ChangePreview): string {
  return preview.report.changes.join(" ") || "No changes were applied.";
}

export function pendingChangeIsStale(plan: EventPlan, pending: PendingChange): boolean {
  return JSON.stringify(plan) !== pending.basePlanSignature;
}

export function previewPendingChange(
  plan: EventPlan,
  pending: PendingChange,
  today: string,
): ChangePreview {
  const ops = pending.validation.operations
    .filter((o) => pending.selected.includes(o.key))
    .map((o) => o.operation);
  return applyOperations(plan, ops, today);
}

export async function createPlan(
  event: EventDetails,
  draft: DraftFn,
  today: string,
): Promise<WorkflowResult<EventPlan>> {
  let result: AIResult<PlanDraft>;
  try {
    result = await draft({ event, today });
  } catch {
    return {
      status: "error",
      message: "Could not reach the planning assistant. Please try again.",
    };
  }
  if (!result.ok) return { status: "error", message: result.error };
  try {
    return {
      status: "ok",
      value: buildPlanFromDraft(event, result.data, today, new Date().toISOString()),
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof PlanBuildError
          ? `${error.message} Please try again.`
          : "The generated plan could not be used. Please try again.",
    };
  }
}
