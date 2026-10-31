import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { communityPlan } from "@/test/fixtures";
import { savePlan } from "./planStorage";

vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => vi.fn(),
}));
vi.mock("@/lib/planning.functions", () => ({
  generatePlanDraft: vi.fn(),
  proposePlanChange: vi.fn(),
}));

import { usePlanWorkspace } from "./usePlanWorkspace";

const originalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

afterEach(() => {
  if (originalStorageDescriptor)
    Object.defineProperty(globalThis, "localStorage", originalStorageDescriptor);
  else Reflect.deleteProperty(globalThis, "localStorage");
  vi.restoreAllMocks();
});

describe("usePlanWorkspace reset", () => {
  it("keeps the active plan when browser storage refuses to delete it", async () => {
    const plan = communityPlan();
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: vi.fn(() => {
        throw new Error("storage blocked");
      }),
    } as unknown as Storage;
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
    savePlan(plan, storage);

    const { result } = renderHook(() => usePlanWorkspace());
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.reset());

    expect(result.current.plan).toEqual(plan);
    expect(result.current.storageNotice).toMatch(/could not be deleted/i);
  });
});
