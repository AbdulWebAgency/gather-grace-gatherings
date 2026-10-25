import { createGoogle } from "@ai-sdk/google";
import { generateObject, jsonSchema } from "ai";
import type { z } from "zod";
import {
  extractedEventJsonSchema,
  planDraftJsonSchema,
  planChangeJsonSchema,
} from "./jsonSchemas";
import {
  extractedEventSchema,
  planDraftSchema,
  type ExtractedEvent,
  type PlanDraft,
} from "@/domain/planBuilder";
import {
  planChangeProposalSchema,
  type PlanChangeProposal,
} from "@/domain/planChange";
import type { EventDetails, EventPlan } from "@/domain/types";
import {
  CHANGE_INSTRUCTIONS,
  EXTRACT_INSTRUCTIONS,
  PLAN_INSTRUCTIONS,
  changeInput,
  extractInput,
  planInput,
} from "./prompts";
import { AIProviderError, type PlanningAIProvider } from "./provider";

/**
 * Google Gemini implementation of the PlanningAIProvider interface using the
 * Vercel AI SDK (@ai-sdk/google and generateObject).
 * Server-only: reads GEMINI_API_KEY from environment variables.
 */

function getApiKey(): string {
  const key = process.env["GEMINI_API_KEY"] || process.env["GOOGLE_GENERATIVE_AI_API_KEY"];
  if (!key) {
    throw new AIProviderError(
      "config",
      "The AI service is not configured. GEMINI_API_KEY is missing.",
    );
  }
  return key;
}

function getModelName(): string {
  return process.env["GEMINI_MODEL"] ?? "gemini-3.1-flash-lite";
}

function mapGeminiError(error: unknown): AIProviderError {
  if (error instanceof AIProviderError) return error;

  const err = error as {
    statusCode?: number;
    status?: number;
    message?: string;
    name?: string;
  };

  const status = err.statusCode ?? err.status;
  const message = err.message ?? "";

  // Safety / content moderation refusal
  if (
    /safety|blocked|harm|refus/i.test(message) ||
    err.name === "AI_RefusalError"
  ) {
    return new AIProviderError("refused", "The AI declined to answer this request.");
  }

  // Rate limits / quota exhaustion
  if (status === 429 || /rate limit|quota|resource exhausted/i.test(message)) {
    return new AIProviderError(
      "rate_limited",
      "The AI service is busy. Please wait a moment and try again.",
    );
  }

  // Authentication / invalid API key
  if (
    status === 401 ||
    /api key|unauthorized|unauthenticated|invalid_api_key/i.test(message)
  ) {
    return new AIProviderError("config", "The AI service is not configured correctly.");
  }

  // Billing / credits
  if (status === 402 || /credit|billing/i.test(message)) {
    return new AIProviderError(
      "credits",
      "AI credits or quota are exhausted. Please check your Google Gemini billing settings.",
    );
  }

  // Permissions / forbidden
  if (status === 403 || /permission denied|forbidden/i.test(message)) {
    return new AIProviderError("denied", "The AI service declined this request.");
  }

  // Parsing / schema validation issues
  if (
    err.name === "TypeValidationError" ||
    err.name === "JSONParseError" ||
    err.name === "NoObjectGeneratedError" ||
    /malformed|parse|validation/i.test(message)
  ) {
    return new AIProviderError(
      "malformed",
      "The AI returned an unreadable or incomplete response. Your plan has not been changed — please try again.",
    );
  }
  console.error("Gemini provider API error:", {
    name: error instanceof Error ? error.name : "Unknown",
    message: error instanceof Error ? error.message : String(error),
    statusCode:
      typeof error === "object" && error !== null && "statusCode" in error
        ? error.statusCode
        : undefined,
    responseBody:
      typeof error === "object" && error !== null && "responseBody" in error
        ? error.responseBody
        : undefined,
    isRetryable:
      typeof error === "object" && error !== null && "isRetryable" in error
        ? error.isRetryable
        : undefined,
    finishReason:
      typeof error === "object" && error !== null && "finishReason" in error
        ? error.finishReason
        : undefined,
    responseModel:
      typeof error === "object" && error !== null && "response" in error
        ? (error.response as { modelId?: string } | undefined)?.modelId
        : undefined,
  });
  return new AIProviderError(
    "unavailable",
    "The AI service is temporarily unavailable. Your plan has not been changed.",
  );
}
function adaptSchema(value: unknown): any {
  if (Array.isArray(value)) {
    return value.map(adaptSchema);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(source)) {
    if (key === "type" && Array.isArray(child) && child.includes("null")) {
      result["type"] = child.find((type) => type !== "null");
      result["nullable"] = true;
    } else if (key === "enum" && Array.isArray(child)) {
      result["enum"] = child.filter((item) => item !== null);
    } else {
      result[key] = adaptSchema(child);
    }
  }

  return result;
}
interface StructuredGeminiCall<T> {
  instructions: string;
  input: string;
  validator: z.ZodType<T>;
  jsonSchema: unknown;
}

async function callStructured<T>(call: StructuredGeminiCall<T>): Promise<T> {
  const apiKey = getApiKey();
  const google = createGoogle({ apiKey });
  const model = google(getModelName());

  try {
    const result = await generateObject({
      model,
      system: call.instructions,
      prompt: call.input,
      schema: jsonSchema(adaptSchema(call.jsonSchema)),
    });

    // Ensure the returned object strictly passes domain Zod validation
    const parsed = call.validator.safeParse(result.object);
    if (!parsed.success) {
      console.error("AI output failed validation", parsed.error.issues.slice(0, 5));
      throw new AIProviderError(
        "malformed",
        "The AI returned an incomplete proposal. Your plan has not been changed — please try again.",
      );
    }

    return parsed.data;
  } catch (error) {
    throw mapGeminiError(error);
  }
}

export class GeminiPlanningProvider implements PlanningAIProvider {
  extractEventDetails({ text, today }: { text: string; today: string }): Promise<ExtractedEvent> {
    return callStructured({
      instructions: EXTRACT_INSTRUCTIONS,
      input: extractInput(text, today),
      validator: extractedEventSchema,
      jsonSchema: extractedEventJsonSchema,
    });
  }

  generatePlanDraft({ event, today }: { event: EventDetails; today: string }): Promise<PlanDraft> {
    return callStructured({
      instructions: PLAN_INSTRUCTIONS,
      input: planInput(event, today),
      validator: planDraftSchema,
      jsonSchema: planDraftJsonSchema,
    });
  }

  proposePlanChange({
    plan,
    request,
    today,
  }: {
    plan: EventPlan;
    request: string;
    today: string;
  }): Promise<PlanChangeProposal> {
    return callStructured({
      instructions: CHANGE_INSTRUCTIONS,
      input: changeInput(plan, request, today),
      validator: planChangeProposalSchema,
      jsonSchema: planChangeJsonSchema,
    });
  }
}

/** Factory function for the planning server functions */
export function getPlanningProvider(): PlanningAIProvider {
  return new GeminiPlanningProvider();
}
