import { eventPlanSchema, type EventPlan } from "@/domain/types";

/**
 * Browser-local persistence. Data stays on this device only; it is validated
 * on load and discarded if it no longer matches the schema.
 */
const STORAGE_KEY = "event-planner.plan.v1";

export type LoadResult = { plan: EventPlan | null; discarded: boolean };

export function loadPlan(storage: Storage | undefined = globalThis.localStorage): LoadResult {
  if (!storage) return { plan: null, discarded: false };
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return { plan: null, discarded: false };
  try {
    const parsed = eventPlanSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return { plan: parsed.data, discarded: false };
  } catch {
    /* fall through */
  }
  storage.removeItem(STORAGE_KEY);
  return { plan: null, discarded: true };
}

export function savePlan(plan: EventPlan, storage: Storage | undefined = globalThis.localStorage): boolean {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(plan));
    return true;
  } catch {
    return false;
  }
}

export function clearPlan(storage: Storage | undefined = globalThis.localStorage): void {
  storage?.removeItem(STORAGE_KEY);
}
