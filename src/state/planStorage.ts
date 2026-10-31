import { eventPlanSchema, type EventPlan } from "@/domain/types";

/** Browser-local persistence; incompatible source data is preserved for recovery. */
const STORAGE_KEY = "event-planner.plan.v1";
const RECOVERY_KEY = "event-planner.plan.v1.recovery";
const PRE_RECOVERY_KEY = "event-planner.plan.v1.pre-recovery";

export type RecoveryState =
  | { status: "available"; plan: EventPlan }
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "unavailable" };

export type LoadResult = {
  plan: EventPlan | null;
  discarded: boolean;
  unavailable: boolean;
  recoveryAvailable: boolean;
  recovery: RecoveryState;
};

export type RecoveryResult =
  | { ok: true; plan: EventPlan; recoveryCopyRetained: boolean }
  | {
      ok: false;
      reason: "missing" | "invalid" | "unavailable" | "save_failed" | "preserve_failed";
    };

function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function inspectRecovery(storage: Storage): RecoveryState {
  let raw: string | null;
  try {
    raw = storage.getItem(RECOVERY_KEY);
  } catch {
    return { status: "unavailable" };
  }
  if (raw === null) return { status: "missing" };
  try {
    const parsed = eventPlanSchema.safeParse(JSON.parse(raw));
    return parsed.success ? { status: "available", plan: parsed.data } : { status: "invalid" };
  } catch {
    return { status: "invalid" };
  }
}

export function loadPlan(storage: Storage | undefined = browserStorage()): LoadResult {
  if (!storage)
    return {
      plan: null,
      discarded: false,
      unavailable: true,
      recoveryAvailable: false,
      recovery: { status: "unavailable" },
    };
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return {
      plan: null,
      discarded: false,
      unavailable: true,
      recoveryAvailable: false,
      recovery: { status: "unavailable" },
    };
  }

  let plan: EventPlan | null = null;
  let discarded = false;
  if (raw !== null) {
    try {
      const parsed = eventPlanSchema.safeParse(JSON.parse(raw));
      if (parsed.success) plan = parsed.data;
      else discarded = true;
    } catch {
      discarded = true;
    }

    if (discarded) {
      // Never replace an existing recovery candidate with a newer invalid value.
      const recoveryBefore = inspectRecovery(storage);
      if (recoveryBefore.status === "missing") {
        try {
          storage.setItem(RECOVERY_KEY, raw);
          storage.removeItem(STORAGE_KEY);
        } catch {
          // Keep the source value in place if it cannot be copied safely.
        }
      }
    }
  }

  const recovery = inspectRecovery(storage);
  return {
    plan,
    discarded,
    unavailable: recovery.status === "unavailable",
    recoveryAvailable: recovery.status === "available",
    recovery,
  };
}

/** Restore only validated recovery data, preserving the active stored value first. */
export function restoreRecoveryPlan(
  currentPlan: EventPlan | null,
  storage: Storage | undefined = browserStorage(),
): RecoveryResult {
  if (!storage) return { ok: false, reason: "unavailable" };
  const recovery = inspectRecovery(storage);
  if (recovery.status === "missing") return { ok: false, reason: "missing" };
  if (recovery.status === "invalid") return { ok: false, reason: "invalid" };
  if (recovery.status === "unavailable") return { ok: false, reason: "unavailable" };

  let activeRaw: string | null;
  let recoveryRaw: string | null;
  let existingBackup: string | null;
  try {
    activeRaw = storage.getItem(STORAGE_KEY);
    recoveryRaw = storage.getItem(RECOVERY_KEY);
    existingBackup = storage.getItem(PRE_RECOVERY_KEY);
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (recoveryRaw === null) return { ok: false, reason: "missing" };

  const activeSnapshot = currentPlan ? JSON.stringify(currentPlan) : activeRaw;
  // Do not replace an existing backup or mismatch an unsaved active plan.
  if (currentPlan && activeRaw !== null && activeRaw !== activeSnapshot) {
    return { ok: false, reason: "preserve_failed" };
  }
  if (activeSnapshot !== null && existingBackup !== null && existingBackup !== activeSnapshot) {
    return { ok: false, reason: "preserve_failed" };
  }
  if (activeSnapshot !== null && existingBackup === null) {
    try {
      storage.setItem(PRE_RECOVERY_KEY, activeSnapshot);
    } catch {
      return { ok: false, reason: "preserve_failed" };
    }
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(recovery.plan));
  } catch {
    return { ok: false, reason: "save_failed" };
  }

  let recoveryCopyRetained = false;
  try {
    storage.removeItem(RECOVERY_KEY);
  } catch {
    recoveryCopyRetained = true;
  }
  return { ok: true, plan: recovery.plan, recoveryCopyRetained };
}

export function savePlan(
  plan: EventPlan,
  storage: Storage | undefined = browserStorage(),
): boolean {
  try {
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(plan));
    return true;
  } catch {
    return false;
  }
}

export function clearPlan(storage: Storage | undefined = browserStorage()): boolean {
  try {
    if (!storage) return false;
    storage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
