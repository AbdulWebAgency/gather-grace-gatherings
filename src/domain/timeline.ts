import { addDays, differenceInCalendarDays, format, max as maxDate, min as minDate, parseISO } from "date-fns";
import type { Task } from "./types";

/** Deterministic timeline and dependency engine. */

export const URGENT_WINDOW_DAYS = 7;

export function toIsoDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function parseIsoDate(value: string): Date {
  return parseISO(value);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return differenceInCalendarDays(parseISO(toIso), parseISO(fromIso));
}

export function shiftIsoDate(iso: string, days: number): string {
  return toIsoDate(addDays(parseISO(iso), days));
}

/**
 * Deadline = event date − lead time, but never earlier than today and never
 * later than the event itself, so we never create impossible dates.
 */
export function computeDeadline(
  eventDate: string,
  daysBeforeEvent: number,
  today: string,
): { deadline: string; compressed: boolean } {
  const event = parseISO(eventDate);
  const ideal = addDays(event, -daysBeforeEvent);
  const todayDate = parseISO(today);
  const bounded = minDate([maxDate([ideal, todayDate]), event]);
  return { deadline: toIsoDate(bounded), compressed: ideal < todayDate };
}

export type TaskUrgency = "completed" | "overdue" | "urgent" | "upcoming";

export function classifyTask(task: Task, today: string): TaskUrgency {
  if (task.status === "completed") return "completed";
  const days = daysBetween(today, task.deadline);
  if (days < 0) return "overdue";
  if (days <= URGENT_WINDOW_DAYS) return "urgent";
  return "upcoming";
}

export function sortTasksChronologically(tasks: Task[]): Task[] {
  const rank = { high: 0, medium: 1, low: 2 } as const;
  return [...tasks].sort(
    (a, b) => a.deadline.localeCompare(b.deadline) || rank[a.priority] - rank[b.priority],
  );
}

export function tasksNeedingAttention(tasks: Task[], today: string): Task[] {
  return sortTasksChronologically(
    tasks.filter((t) => {
      const u = classifyTask(t, today);
      return u === "overdue" || u === "urgent" || t.status === "blocked";
    }),
  );
}

export function incompletePrerequisites(task: Task, tasks: Task[]): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return task.dependsOn
    .map((id) => byId.get(id))
    .filter((t): t is Task => t !== undefined && t.status !== "completed");
}

export interface DependencyIssue {
  kind: "unknown_dependency" | "self_dependency" | "cycle" | "order";
  taskId: string;
  message: string;
}

export function validateDependencies(tasks: Task[]): DependencyIssue[] {
  const issues: DependencyIssue[] = [];
  const byId = new Map(tasks.map((t) => [t.id, t]));

  for (const task of tasks) {
    for (const dep of task.dependsOn) {
      if (dep === task.id) {
        issues.push({ kind: "self_dependency", taskId: task.id, message: `"${task.title}" depends on itself.` });
      } else if (!byId.has(dep)) {
        issues.push({ kind: "unknown_dependency", taskId: task.id, message: `"${task.title}" depends on a task that does not exist.` });
      } else {
        const prereq = byId.get(dep)!;
        // A completed prerequisite cannot block anything, whatever its old deadline.
        if (prereq.deadline > task.deadline && task.status !== "completed" && prereq.status !== "completed") {
          issues.push({
            kind: "order",
            taskId: task.id,
            message: `"${task.title}" is due before its prerequisite "${prereq.title}".`,
          });
        }
      }
    }
  }

  // Cycle detection (DFS with colouring).
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (id: string, trail: string[]): void => {
    state.set(id, 1);
    for (const dep of byId.get(id)?.dependsOn ?? []) {
      if (!byId.has(dep) || dep === id) continue;
      const s = state.get(dep) ?? 0;
      if (s === 1) {
        issues.push({ kind: "cycle", taskId: id, message: `Circular dependency: ${[...trail, id, dep].map((t) => byId.get(t)?.title ?? t).join(" → ")}` });
      } else if (s === 0) {
        visit(dep, [...trail, id]);
      }
    }
    state.set(id, 2);
  };
  for (const t of tasks) if ((state.get(t.id) ?? 0) === 0) visit(t.id, []);

  return issues;
}

/** Topological order (prerequisites first). Assumes no cycles. */
function topologicalOrder(tasks: Task[]): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const out: Task[] = [];
  const visit = (t: Task) => {
    if (seen.has(t.id)) return;
    seen.add(t.id);
    for (const dep of t.dependsOn) {
      const d = byId.get(dep);
      if (d) visit(d);
    }
    out.push(t);
  };
  tasks.forEach(visit);
  return out;
}

export interface TaskScheduleImpact {
  taskId: string;
  title: string;
  before: string;
  after: string;
  reason: "rescheduled" | "compressed" | "dependency_adjusted";
}

/**
 * Recalculates deadlines for a new event date. Completed tasks keep their
 * deadline and status. Status of every task is preserved. Dependents are
 * pushed so they are never due before their prerequisites.
 */
export function rescheduleTasks(
  tasks: Task[],
  eventDate: string,
  today: string,
): { tasks: Task[]; impacts: TaskScheduleImpact[] } {
  const scheduled = new Map<string, { deadline: string; reason: TaskScheduleImpact["reason"] | null }>();

  for (const task of topologicalOrder(tasks)) {
    if (task.status === "completed") {
      scheduled.set(task.id, { deadline: task.deadline, reason: null });
      continue;
    }
    const { deadline, compressed } = computeDeadline(eventDate, task.daysBeforeEvent, today);
    let finalDeadline = deadline;
    let reason: TaskScheduleImpact["reason"] = compressed ? "compressed" : "rescheduled";
    for (const dep of task.dependsOn) {
      const prereq = scheduled.get(dep);
      const prereqTask = tasks.find((t) => t.id === dep);
      if (prereq && prereqTask && prereqTask.status !== "completed" && prereq.deadline > finalDeadline) {
        finalDeadline = prereq.deadline > eventDate ? eventDate : prereq.deadline;
        reason = "dependency_adjusted";
      }
    }
    scheduled.set(task.id, { deadline: finalDeadline, reason });
  }

  const impacts: TaskScheduleImpact[] = [];
  const updated = tasks.map((task) => {
    const s = scheduled.get(task.id)!;
    if (s.deadline === task.deadline) return task;
    impacts.push({ taskId: task.id, title: task.title, before: task.deadline, after: s.deadline, reason: s.reason ?? "rescheduled" });
    return { ...task, deadline: s.deadline };
  });
  return { tasks: updated, impacts };
}
