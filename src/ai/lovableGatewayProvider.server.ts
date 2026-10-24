import type { z } from "zod";
import { extractedEventSchema, planDraftSchema } from "@/domain/planBuilder";
import { planChangeProposalSchema } from "@/domain/planChange";
import { extractedEventJsonSchema, planChangeJsonSchema, planDraftJsonSchema } from "./jsonSchemas";
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
 * Lovable AI Gateway implementation (OpenAI Responses API, streamed, strict
 * JSON-schema output). Server-only: reads the API key from the environment.
 */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/responses";
const MODEL = "openai/gpt-6-astra";
const MAX_OUTPUT_CHARS = 120_000;

interface StructuredCall<T> {
  instructions: string;
  input: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  validator: z.ZodType<T>;
}

function mapStatus(status: number, body: string): AIProviderError {
  let message = "";
  try {
    message = (JSON.parse(body) as { message?: string; error?: { message?: string } }).message ?? "";
  } catch {
    /* ignore */
  }
  if (status === 401) return new AIProviderError("config", "The AI service is not configured correctly.");
  if (status === 402) return new AIProviderError("credits", message || "AI credits are exhausted. Add credits in Settings → Plans & credits.");
  if (status === 403) return new AIProviderError("denied", message || "The AI service declined this request.");
  if (status === 429) return new AIProviderError("rate_limited", "The AI service is busy. Please wait a moment and try again.");
  return new AIProviderError("unavailable", "The AI service is temporarily unavailable. Your plan has not been changed.");
}

async function readStreamedText(response: Response): Promise<string> {
  if (!response.body) throw new AIProviderError("unavailable", "The AI service returned no data.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = frame
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("");
      if (!data || data === "[DONE]") continue;
      let event: { type?: string; delta?: string; response?: { error?: { message?: string } }; message?: string };
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }
      if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
        text += event.delta;
        if (text.length > MAX_OUTPUT_CHARS) throw new AIProviderError("malformed", "The AI response was too large.");
      } else if (event.type === "response.refusal.delta" || event.type === "response.refusal.done") {
        throw new AIProviderError("refused", "The AI declined to answer this request.");
      } else if (event.type === "response.failed" || event.type === "error") {
        console.error("AI stream failed", event.response?.error?.message ?? event.message);
        throw new AIProviderError("unavailable", "The AI service failed to complete the request. Your plan has not been changed.");
      }
    }
  }
  return text;
}

async function callStructured<T>(call: StructuredCall<T>): Promise<T> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new AIProviderError("config", "The AI service is not configured.");

  let response: Response;
  try {
    response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: MODEL,
        instructions: call.instructions,
        input: [{ role: "user", content: call.input }],
        reasoning: { effort: "low" },
        store: false,
        stream: true,
        text: { format: { type: "json_schema", name: call.schemaName, schema: call.jsonSchema, strict: true } },
      }),
    });
  } catch (error) {
    console.error("AI network error", error);
    throw new AIProviderError("unavailable", "Could not reach the AI service. Your plan has not been changed.");
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("AI gateway error", response.status, body.slice(0, 500));
    throw mapStatus(response.status, body);
  }

  const text = await readStreamedText(response);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AIProviderError("malformed", "The AI returned an unreadable response. Your plan has not been changed — please try again.");
  }
  const result = call.validator.safeParse(parsed);
  if (!result.success) {
    console.error("AI output failed validation", result.error.issues.slice(0, 5));
    throw new AIProviderError("malformed", "The AI returned an incomplete proposal. Your plan has not been changed — please try again.");
  }
  return result.data;
}

export class LovableGatewayPlanningProvider implements PlanningAIProvider {
  extractEventDetails({ text, today }: { text: string; today: string }) {
    return callStructured({
      instructions: EXTRACT_INSTRUCTIONS,
      input: extractInput(text, today),
      schemaName: "extracted_event",
      jsonSchema: extractedEventJsonSchema,
      validator: extractedEventSchema,
    });
  }

  generatePlanDraft({ event, today }: Parameters<PlanningAIProvider["generatePlanDraft"]>[0]) {
    return callStructured({
      instructions: PLAN_INSTRUCTIONS,
      input: planInput(event, today),
      schemaName: "plan_draft",
      jsonSchema: planDraftJsonSchema,
      validator: planDraftSchema,
    });
  }

  proposePlanChange({ plan, request, today }: Parameters<PlanningAIProvider["proposePlanChange"]>[0]) {
    return callStructured({
      instructions: CHANGE_INSTRUCTIONS,
      input: changeInput(plan, request, today),
      schemaName: "plan_change",
      jsonSchema: planChangeJsonSchema,
      validator: planChangeProposalSchema,
    });
  }
}

/** Single place to swap providers (e.g. a future GeminiPlanningProvider). */
export function getPlanningProvider(): PlanningAIProvider {
  return new LovableGatewayPlanningProvider();
}
