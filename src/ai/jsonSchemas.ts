/**
 * Strict JSON Schemas sent to the model for structured output. They mirror the
 * zod schemas in the domain layer, which remain the authoritative validators.
 */
import { OPERATION_TYPES } from "@/domain/planChange";
import {
  BOOKING_STATUSES,
  COST_SCALINGS,
  COST_STATUSES,
  EVENT_CATEGORIES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "@/domain/types";

type Schema = Record<string, unknown>;

const str: Schema = { type: "string" };
const nullableStr: Schema = { type: ["string", "null"] };
const num: Schema = { type: "number" };
const nullableNum: Schema = { type: ["number", "null"] };
const int: Schema = { type: "integer" };
const nullableInt: Schema = { type: ["integer", "null"] };
const bool: Schema = { type: "boolean" };
const nullableBool: Schema = { type: ["boolean", "null"] };
const arr = (items: Schema): Schema => ({ type: "array", items });
const strEnum = (values: readonly string[]): Schema => ({ type: "string", enum: [...values] });
const nullableEnum = (values: readonly string[]): Schema => ({ type: ["string", "null"], enum: [...values, null] });
const obj = (properties: Record<string, Schema>): Schema => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const extractedEventJsonSchema = obj({
  name: nullableStr,
  category: nullableEnum(EVENT_CATEGORIES),
  date: nullableStr,
  dateIsApproximate: bool,
  location: nullableStr,
  guestCount: nullableInt,
  budget: nullableNum,
  currency: nullableStr,
  theme: nullableStr,
  priorities: arr(str),
  mustHaves: arr(str),
  accessibilityNeeds: arr(str),
  dietaryCulturalNeeds: arr(str),
  constraints: arr(str),
  missingInformation: arr(str),
  followUpQuestions: arr(str),
  assumptions: arr(str),
});

export const planDraftJsonSchema = obj({
  assumptions: arr(str),
  ideas: arr(str),
  budgetItems: arr(
    obj({
      category: str,
      description: str,
      scaling: strEnum(COST_SCALINGS),
      unitCost: nullableNum,
      amount: num,
      essential: bool,
      notes: str,
    }),
  ),
  tasks: arr(
    obj({
      key: str,
      title: str,
      description: str,
      priority: strEnum(TASK_PRIORITIES),
      daysBeforeEvent: int,
      dependsOnKeys: arr(str),
      notes: str,
    }),
  ),
  vendors: arr(
    obj({
      category: str,
      requirement: str,
      questions: arr(str),
      budgetCategory: nullableStr,
    }),
  ),
});

const STATUS_VALUES = [...new Set([...COST_STATUSES, ...TASK_STATUSES, ...BOOKING_STATUSES, ...TASK_PRIORITIES])];

export const planChangeJsonSchema = obj({
  intent: strEnum(["modify", "question"]),
  summary: str,
  answer: str,
  operations: arr(
    obj({
      type: strEnum(OPERATION_TYPES),
      targetId: nullableStr,
      numberValue: nullableNum,
      textValue: nullableStr,
      dateValue: nullableStr,
      statusValue: nullableEnum(STATUS_VALUES),
      category: nullableStr,
      scaling: nullableEnum(COST_SCALINGS),
      essential: nullableBool,
      reason: str,
    }),
  ),
  tradeoffs: arr(str),
  alternatives: arr(
    obj({
      title: str,
      description: str,
      estimatedSaving: nullableNum,
      consequence: str,
    }),
  ),
  clarifyingQuestions: arr(str),
});
