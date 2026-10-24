import type { ExtractedEvent, PlanDraft } from "@/domain/planBuilder";
import type { PlanChangeProposal } from "@/domain/planChange";
import type { EventDetails, EventPlan } from "@/domain/types";

/**
 * Provider-agnostic AI boundary. The planning engine and UI only depend on
 * this interface, so swapping the Lovable AI Gateway implementation for a
 * Google Gemini implementation means writing one new class.
 */
export interface PlanningAIProvider {
  extractEventDetails(input: { text: string; today: string }): Promise<ExtractedEvent>;
  generatePlanDraft(input: { event: EventDetails; today: string }): Promise<PlanDraft>;
  proposePlanChange(input: { plan: EventPlan; request: string; today: string }): Promise<PlanChangeProposal>;
}

export type AIErrorCode = "config" | "credits" | "rate_limited" | "denied" | "unavailable" | "malformed" | "refused";

export class AIProviderError extends Error {
  constructor(
    public readonly code: AIErrorCode,
    public readonly userMessage: string,
  ) {
    super(userMessage);
  }
}

export type AIResult<T> = { ok: true; data: T } | { ok: false; error: string };
