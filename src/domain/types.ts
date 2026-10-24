import { z } from "zod";

/**
 * Authoritative domain model for an event plan.
 * Every record loaded from storage or produced from AI output is validated
 * against these schemas before it reaches application state.
 */

export const EVENT_CATEGORIES = ["wedding", "birthday", "community"] as const;
export const COST_STATUSES = ["estimate", "quoted", "confirmed"] as const;
export const COST_SCALINGS = ["per_guest", "fixed"] as const;
export const TASK_STATUSES = ["not_started", "in_progress", "completed", "blocked"] as const;
export const TASK_PRIORITIES = ["high", "medium", "low"] as const;
export const BOOKING_STATUSES = ["not_contacted", "contacted", "quote_received", "booked"] as const;
export const QUOTE_STATUSES = ["received", "accepted", "declined"] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export type CostStatus = (typeof COST_STATUSES)[number];
export type CostScaling = (typeof COST_SCALINGS)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD");
const shortText = z.string().trim().max(300);
const longText = z.string().trim().max(1200);
const idSchema = z.string().min(1).max(64);
const money = z.number().finite().min(0).max(1_000_000_000);

export const eventDetailsSchema = z.object({
  name: z.string().trim().min(1, "Event name is required").max(120),
  category: z.enum(EVENT_CATEGORIES),
  date: isoDateSchema,
  dateIsApproximate: z.boolean(),
  location: shortText,
  guestCount: z.number().int().min(1).max(10_000),
  budget: money.refine((v) => v > 0, "Budget must be greater than zero"),
  currency: z.string().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code"),
  theme: shortText,
  priorities: z.array(shortText).max(10),
  mustHaves: z.array(shortText).max(15),
  accessibilityNeeds: z.array(shortText).max(10),
  dietaryCulturalNeeds: z.array(shortText).max(10),
  constraints: z.array(shortText).max(10),
});
export type EventDetails = z.infer<typeof eventDetailsSchema>;

export const budgetItemSchema = z.object({
  id: idSchema,
  category: z.string().trim().min(1).max(60),
  description: shortText,
  scaling: z.enum(COST_SCALINGS),
  /** Cost per guest; only meaningful when scaling is per_guest. */
  unitCost: money.nullable(),
  amount: money,
  costStatus: z.enum(COST_STATUSES),
  essential: z.boolean(),
  notes: shortText,
});
export type BudgetItem = z.infer<typeof budgetItemSchema>;

export const taskSchema = z.object({
  id: idSchema,
  title: z.string().trim().min(1).max(140),
  description: longText,
  priority: z.enum(TASK_PRIORITIES),
  status: z.enum(TASK_STATUSES),
  /** Lead time the plan wants before the event; kept stable when the date moves. */
  daysBeforeEvent: z.number().int().min(0).max(730),
  deadline: isoDateSchema,
  dependsOn: z.array(idSchema).max(10),
  notes: shortText,
});
export type Task = z.infer<typeof taskSchema>;

export const quoteSchema = z.object({
  id: idSchema,
  vendorName: z.string().trim().min(1).max(120),
  amount: money,
  contact: shortText,
  inclusions: shortText,
  exclusions: shortText,
  status: z.enum(QUOTE_STATUSES),
});
export type Quote = z.infer<typeof quoteSchema>;

export const vendorRequirementSchema = z.object({
  id: idSchema,
  category: z.string().trim().min(1).max(60),
  requirement: longText,
  budgetItemId: idSchema.nullable(),
  quotes: z.array(quoteSchema).max(20),
  questions: z.array(shortText).max(10),
  bookingStatus: z.enum(BOOKING_STATUSES),
  notes: shortText,
});
export type VendorRequirement = z.infer<typeof vendorRequirementSchema>;

export const planChangeRecordSchema = z.object({
  id: idSchema,
  revision: z.number().int().min(1),
  at: z.string().max(40),
  request: shortText,
  summary: longText,
  changes: z.array(longText).max(60),
  consequences: z.array(longText).max(60),
});
export type PlanChangeRecord = z.infer<typeof planChangeRecordSchema>;

export const eventPlanSchema = z.object({
  schemaVersion: z.literal(1),
  id: idSchema,
  revision: z.number().int().min(1),
  event: eventDetailsSchema,
  assumptions: z.array(longText).max(30),
  ideas: z.array(longText).max(20),
  budgetItems: z.array(budgetItemSchema).max(60),
  tasks: z.array(taskSchema).max(80),
  vendors: z.array(vendorRequirementSchema).max(30),
  history: z.array(planChangeRecordSchema).max(100),
  createdAt: z.string().max(40),
  updatedAt: z.string().max(40),
});
export type EventPlan = z.infer<typeof eventPlanSchema>;
