import { describe, expect, it } from "vitest";
import { communityPlan, TODAY } from "@/test/fixtures";
import { computeDeadline, rescheduleTasks, shiftIsoDate, validateDependencies } from "./timeline";
import { isoDateSchema, type Task } from "./types";

describe("timeline engine", () => {
  it("computes deadlines from event date and lead time", () => {
    expect(computeDeadline("2026-04-12", 10, TODAY)).toEqual({ deadline: "2026-04-02", compressed: false });
    expect(computeDeadline("2026-04-12", 60, TODAY)).toEqual({ deadline: TODAY, compressed: true });
  });

  it("handles month boundaries and leap years", () => {
    expect(shiftIsoDate("2028-03-01", -1)).toBe("2028-02-29");
    expect(shiftIsoDate("2027-03-01", -1)).toBe("2027-02-28");
    expect(shiftIsoDate("2026-01-31", 1)).toBe("2026-02-01");
    expect(computeDeadline("2028-03-05", 5, "2028-01-01").deadline).toBe("2028-02-29");
  });

  it("rejects impossible calendar dates", () => {
    expect(isoDateSchema.safeParse("2026-02-30").success).toBe(false);
    expect(isoDateSchema.safeParse("2027-02-29").success).toBe(false);
    expect(isoDateSchema.safeParse("2028-02-29").success).toBe(true);
  });

  it("moves deadlines earlier/later and keeps completed tasks untouched", () => {
    const tasks = communityPlan().tasks;
    const later = rescheduleTasks(tasks, "2026-04-26", TODAY).tasks;
    expect(later.find((t) => t.id === "task_menu")?.deadline).toBe("2026-04-16");
    const earlier = rescheduleTasks(tasks, "2026-03-29", TODAY).tasks;
    const venue = earlier.find((t) => t.id === "task_venue")!;
    expect(venue).toMatchObject({ status: "completed", deadline: "2026-03-08" });
    expect(earlier.find((t) => t.id === "task_invites")?.deadline).toBe(TODAY);
    expect(earlier.find((t) => t.id === "task_caterer")).toMatchObject({ deadline: "2026-03-08", status: "in_progress" });
    expect(validateDependencies(earlier)).toEqual([]);
  });

  it("pushes dependents after their prerequisites", () => {
    const tasks: Task[] = [
      { id: "a", title: "A", description: "", priority: "high", status: "not_started", daysBeforeEvent: 5, deadline: "2026-04-07", dependsOn: [], notes: "" },
      { id: "b", title: "B", description: "", priority: "high", status: "not_started", daysBeforeEvent: 20, deadline: "2026-03-23", dependsOn: ["a"], notes: "" },
    ];
    const out = rescheduleTasks(tasks, "2026-04-12", TODAY).tasks;
    expect(out.find((t) => t.id === "b")?.deadline).toBe("2026-04-07");
    expect(validateDependencies(out)).toEqual([]);
  });

  it("reports missing, self and cyclic dependencies", () => {
    const base = communityPlan().tasks;
    const broken: Task[] = [
      { ...base[1]!, dependsOn: ["missing"] },
      { ...base[2]!, id: "x", dependsOn: ["x"] },
      { ...base[3]!, id: "p", dependsOn: ["q"] },
      { ...base[4]!, id: "q", dependsOn: ["p"] },
    ];
    const kinds = validateDependencies(broken).map((i) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(["unknown_dependency", "self_dependency", "cycle"]));
  });
});
