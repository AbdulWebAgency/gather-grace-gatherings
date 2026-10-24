import type { PlanChangeProposal, ProposedOperation } from "@/domain/planChange";
import type { EventPlan } from "@/domain/types";

/** Fixed planning date used by every deterministic test. */
export const TODAY = "2026-03-01";
/** 42 days after TODAY. */
export const EVENT_DATE = "2026-04-12";

export function communityPlan(): EventPlan {
  return {
    schemaVersion: 1,
    id: "evt_test",
    revision: 1,
    event: {
      name: "Neighbourhood Spring Celebration",
      category: "community",
      date: EVENT_DATE,
      dateIsApproximate: false,
      location: "Pune",
      guestCount: 100,
      budget: 100_000,
      currency: "INR",
      theme: "Spring",
      priorities: ["Photography"],
      mustHaves: [],
      accessibilityNeeds: [],
      dietaryCulturalNeeds: [],
      constraints: [],
    },
    assumptions: [],
    ideas: [],
    budgetItems: [
      { id: "bud_catering", category: "Catering", description: "Catering", scaling: "per_guest", unitCost: 400, amount: 40_000, costStatus: "estimate", essential: true, notes: "" },
      { id: "bud_venue", category: "Venue", description: "Community hall", scaling: "fixed", unitCost: null, amount: 20_000, costStatus: "confirmed", essential: true, notes: "" },
      { id: "bud_photo", category: "Photography", description: "Photographer", scaling: "fixed", unitCost: null, amount: 15_000, costStatus: "quoted", essential: true, notes: "" },
      { id: "bud_decor", category: "Decoration", description: "Decorations", scaling: "fixed", unitCost: null, amount: 10_000, costStatus: "estimate", essential: false, notes: "" },
      { id: "bud_favours", category: "Favours", description: "Return gifts", scaling: "per_guest", unitCost: 50, amount: 5_000, costStatus: "estimate", essential: false, notes: "" },
      { id: "bud_chairs", category: "Rentals", description: "Chair rental", scaling: "per_guest", unitCost: 50, amount: 5_000, costStatus: "confirmed", essential: true, notes: "" },
    ],
    tasks: [
      { id: "task_venue", title: "Book venue", description: "", priority: "high", status: "completed", daysBeforeEvent: 35, deadline: "2026-03-08", dependsOn: [], notes: "" },
      { id: "task_invites", title: "Send invitations", description: "", priority: "high", status: "not_started", daysBeforeEvent: 28, deadline: "2026-03-15", dependsOn: ["task_venue"], notes: "" },
      { id: "task_caterer", title: "Confirm caterer", description: "", priority: "high", status: "in_progress", daysBeforeEvent: 21, deadline: "2026-03-22", dependsOn: ["task_venue"], notes: "" },
      { id: "task_menu", title: "Finalise menu", description: "", priority: "medium", status: "not_started", daysBeforeEvent: 10, deadline: "2026-04-02", dependsOn: ["task_caterer"], notes: "" },
      { id: "task_decor", title: "Buy decorations", description: "", priority: "low", status: "not_started", daysBeforeEvent: 3, deadline: "2026-04-09", dependsOn: [], notes: "" },
    ],
    vendors: [
      { id: "ven_venue", category: "Venue", requirement: "Hall for 100", budgetItemId: "bud_venue", quotes: [], questions: [], bookingStatus: "booked", notes: "" },
      { id: "ven_caterer", category: "Catering", requirement: "Veg buffet", budgetItemId: "bud_catering", quotes: [], questions: [], bookingStatus: "contacted", notes: "" },
    ],
    history: [],
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
  };
}

export function op(partial: Partial<ProposedOperation> & Pick<ProposedOperation, "type">): ProposedOperation {
  return {
    targetId: null,
    numberValue: null,
    textValue: null,
    dateValue: null,
    statusValue: null,
    category: null,
    scaling: null,
    essential: null,
    reason: "test",
    ...partial,
  };
}

export function proposal(operations: ProposedOperation[]): PlanChangeProposal {
  return { intent: "modify", summary: "test", answer: "", operations, tradeoffs: [], alternatives: [], clarifyingQuestions: [] };
}
