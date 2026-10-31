import { describe, expect, it } from "vitest";
import { communityPlan } from "@/test/fixtures";
import { clearPlan, loadPlan, restoreRecoveryPlan, savePlan } from "./planStorage";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}

const PLAN_KEY = "event-planner.plan.v1";
const RECOVERY_KEY = "event-planner.plan.v1.recovery";
const BACKUP_KEY = "event-planner.plan.v1.pre-recovery";

describe("plan storage resilience", () => {
  it("round-trips a validated plan", () => {
    const storage = new MemoryStorage();
    const plan = communityPlan();
    expect(savePlan(plan, storage)).toBe(true);
    expect(loadPlan(storage)).toMatchObject({ plan, discarded: false, unavailable: false });
  });

  it("retains incompatible saved data for recovery instead of deleting it", () => {
    const storage = new MemoryStorage();
    storage.setItem(PLAN_KEY, JSON.stringify({ schemaVersion: 0, existing: "user data" }));
    expect(loadPlan(storage)).toMatchObject({
      plan: null,
      discarded: true,
      recoveryAvailable: false,
      recovery: { status: "invalid" },
    });
    expect(storage.getItem(PLAN_KEY)).toBeNull();
    expect(storage.getItem(RECOVERY_KEY)).toBe(
      JSON.stringify({ schemaVersion: 0, existing: "user data" }),
    );
  });

  it("handles storage access failures without throwing or claiming a save", () => {
    const unavailable = {
      get length(): number {
        throw new Error("blocked");
      },
      clear() {
        throw new Error("blocked");
      },
      getItem() {
        throw new Error("blocked");
      },
      key() {
        throw new Error("blocked");
      },
      removeItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    } as Storage;
    expect(loadPlan(unavailable).unavailable).toBe(true);
    expect(savePlan(communityPlan(), unavailable)).toBe(false);
    expect(clearPlan(unavailable)).toBe(false);
  });

  it("reports whether reset actually removed the stored plan", () => {
    const storage = new MemoryStorage();
    savePlan(communityPlan(), storage);
    expect(clearPlan(storage)).toBe(true);
    expect(storage.getItem(PLAN_KEY)).toBeNull();

    storage.setItem(PLAN_KEY, JSON.stringify(communityPlan()));
    storage.removeItem = () => {
      throw new Error("storage blocked");
    };
    expect(clearPlan(storage)).toBe(false);
    expect(storage.getItem(PLAN_KEY)).not.toBeNull();
  });

  it("leaves the original incompatible data in place if recovery storage is full", () => {
    const raw = "{not valid json";
    const storage = new MemoryStorage();
    storage.setItem(PLAN_KEY, raw);
    storage.setItem = () => {
      throw new Error("quota exceeded");
    };
    expect(loadPlan(storage)).toMatchObject({ discarded: true, recoveryAvailable: false });
    expect(storage.getItem(PLAN_KEY)).toBe(raw);
  });

  it("discovers and validates a recovery plan without changing the active plan", () => {
    const storage = new MemoryStorage();
    const active = communityPlan();
    const recovery = {
      ...communityPlan(),
      id: "recovery-event",
      event: { ...communityPlan().event, name: "Recovered celebration" },
    };
    savePlan(active, storage);
    storage.setItem(RECOVERY_KEY, JSON.stringify(recovery));

    const loaded = loadPlan(storage);
    expect(loaded.plan).toEqual(active);
    expect(loaded.recovery).toMatchObject({ status: "available", plan: recovery });
    expect(storage.getItem(RECOVERY_KEY)).toBe(JSON.stringify(recovery));
  });

  it("does not replace a valid active plan with invalid recovery data", () => {
    const storage = new MemoryStorage();
    const active = communityPlan();
    savePlan(active, storage);
    storage.setItem(RECOVERY_KEY, "{bad recovery");

    expect(restoreRecoveryPlan(null, storage)).toEqual({ ok: false, reason: "invalid" });
    expect(loadPlan(storage).plan).toEqual(active);
    expect(storage.getItem(RECOVERY_KEY)).toBe("{bad recovery");
  });

  it("preserves the active copy before an explicit recovery restore", () => {
    const storage = new MemoryStorage();
    const active = communityPlan();
    const recovery = {
      ...communityPlan(),
      id: "recovery-event",
      event: { ...communityPlan().event, name: "Recovered celebration" },
    };
    savePlan(active, storage);
    storage.setItem(RECOVERY_KEY, JSON.stringify(recovery));

    const result = restoreRecoveryPlan(active, storage);
    expect(result).toMatchObject({ ok: true, plan: recovery, recoveryCopyRetained: false });
    expect(loadPlan(storage).plan).toEqual(recovery);
    expect(storage.getItem(BACKUP_KEY)).toBe(JSON.stringify(active));
    expect(storage.getItem(RECOVERY_KEY)).toBeNull();
  });

  it("does not overwrite an existing distinct backup or the active plan", () => {
    const storage = new MemoryStorage();
    const active = communityPlan();
    const existingBackup = { ...communityPlan(), id: "older-backup" };
    const recovery = { ...communityPlan(), id: "recovery-event" };
    savePlan(active, storage);
    storage.setItem(BACKUP_KEY, JSON.stringify(existingBackup));
    storage.setItem(RECOVERY_KEY, JSON.stringify(recovery));

    expect(restoreRecoveryPlan(null, storage)).toEqual({ ok: false, reason: "preserve_failed" });
    expect(loadPlan(storage).plan).toEqual(active);
    expect(storage.getItem(BACKUP_KEY)).toBe(JSON.stringify(existingBackup));
    expect(storage.getItem(RECOVERY_KEY)).toBe(JSON.stringify(recovery));
  });
  it("does not overwrite a valid recovery candidate with a later invalid active value", () => {
    const storage = new MemoryStorage();
    const invalidActive = "{broken newer data";
    const recovery = { ...communityPlan(), id: "older-recovery" };
    storage.setItem(PLAN_KEY, invalidActive);
    storage.setItem(RECOVERY_KEY, JSON.stringify(recovery));

    const loaded = loadPlan(storage);
    expect(loaded.recovery).toMatchObject({ status: "available", plan: recovery });
    expect(storage.getItem(PLAN_KEY)).toBe(invalidActive);
    expect(storage.getItem(RECOVERY_KEY)).toBe(JSON.stringify(recovery));
  });

  it("keeps the active plan intact when writing the recovered plan fails", () => {
    const storage = new MemoryStorage();
    const active = communityPlan();
    const recovery = { ...communityPlan(), id: "recovery-event" };
    savePlan(active, storage);
    storage.setItem(RECOVERY_KEY, JSON.stringify(recovery));
    const originalSetItem = storage.setItem.bind(storage);
    storage.setItem = (key, value) => {
      if (key === PLAN_KEY) throw new Error("quota exceeded");
      originalSetItem(key, value);
    };

    expect(restoreRecoveryPlan(active, storage)).toEqual({ ok: false, reason: "save_failed" });
    expect(storage.getItem(PLAN_KEY)).toBe(JSON.stringify(active));
    expect(storage.getItem(BACKUP_KEY)).toBe(JSON.stringify(active));
    expect(storage.getItem(RECOVERY_KEY)).toBe(JSON.stringify(recovery));
  });
});
