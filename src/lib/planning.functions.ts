import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ExtractedEvent, PlanDraft } from "@/domain/planBuilder";
import type { PlanChangeProposal } from "@/domain/planChange";
import { eventDetailsSchema, eventPlanSchema, isoDateSchema } from "@/domain/types";
import type { AIResult } from "@/ai/provider";

/** Server boundary: validates inputs, calls the AI provider, never leaks internals. */

const MAX_TEXT = 2000;

async function run<T>(fn: () => Promise<T>): Promise<AIResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    const { AIProviderError } = await import("@/ai/provider");
    if (error instanceof AIProviderError) return { ok: false, error: error.userMessage };
    console.error("Planning function failed", error);
    return { ok: false, error: "Something went wrong while contacting the AI. Your plan has not been changed." };
  }
}

const provider = async () => (await import("@/ai/geminiProvider.server")).getPlanningProvider();

export const extractEventDetails = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ text: z.string().trim().min(10, "Please describe your event in a little more detail.").max(MAX_TEXT), today: isoDateSchema }).parse(input),
  )
  .handler(async ({ data }): Promise<AIResult<ExtractedEvent>> => run(async () => (await provider()).extractEventDetails(data)));

export const generatePlanDraft = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ event: eventDetailsSchema, today: isoDateSchema }).parse(input))
  .handler(async ({ data }): Promise<AIResult<PlanDraft>> => run(async () => (await provider()).generatePlanDraft(data)));

export const proposePlanChange = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ plan: eventPlanSchema, request: z.string().trim().min(2).max(MAX_TEXT), today: isoDateSchema }).parse(input),
  )
  .handler(async ({ data }): Promise<AIResult<PlanChangeProposal>> => run(async () => (await provider()).proposePlanChange(data)));
