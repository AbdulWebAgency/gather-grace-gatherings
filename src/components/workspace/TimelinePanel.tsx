import { useState } from "react";
import { Link2 } from "lucide-react";
import { NativeSelect } from "@/components/common/NativeSelect";
import { StatusBadge } from "@/components/common/StatusBadge";
import { setTaskStatus } from "@/domain/planEdits";
import { classifyTask, daysBetween, incompletePrerequisites, sortTasksChronologically, tasksNeedingAttention } from "@/domain/timeline";
import type { EventPlan, TaskStatus } from "@/domain/types";
import { todayIso } from "@/state/usePlanWorkspace";
import { cn } from "@/lib/utils";

type Filter = "all" | "attention" | "open" | "completed";
const PRIORITY_LABEL = { high: "High priority", medium: "Medium priority", low: "Low priority" } as const;

export function TimelinePanel({ plan, onUpdate }: { plan: EventPlan; onUpdate: (u: (p: EventPlan) => EventPlan, m?: string) => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const today = todayIso();
  const byId = new Map(plan.tasks.map((t) => [t.id, t]));
  const attention = tasksNeedingAttention(plan.tasks, today);
  const tasks =
    filter === "attention" ? attention
      : filter === "open" ? sortTasksChronologically(plan.tasks.filter((t) => t.status !== "completed"))
        : filter === "completed" ? sortTasksChronologically(plan.tasks.filter((t) => t.status === "completed"))
          : sortTasksChronologically(plan.tasks);

  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: `All (${plan.tasks.length})` },
    { value: "attention", label: `Needs attention (${attention.length})` },
    { value: "open", label: "Open" },
    { value: "completed", label: "Completed" },
  ];

  return (
    <section className="panel p-5 mt-2" aria-labelledby="timeline-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="timeline-heading" className="text-xl font-semibold">Timeline</h2>
        <div role="group" aria-label="Filter tasks" className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <button key={f.value} type="button" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}
              className={cn("rounded-full border px-3 py-1 text-xs font-semibold", filter === f.value ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted")}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Event day: {plan.event.date}. Deadlines are calculated from each task's lead time.</p>

      {tasks.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No tasks in this view.</p>
      ) : (
        <ol className="mt-4 space-y-2.5">
          {tasks.map((task) => {
            const urgency = classifyTask(task, today);
            const waiting = incompletePrerequisites(task, plan.tasks);
            const days = daysBetween(today, task.deadline);
            return (
              <li key={task.id} className={cn("rounded-lg border p-3.5", urgency === "overdue" && "border-destructive/40", urgency === "urgent" && "border-warning/50")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className={cn("font-semibold leading-snug", task.status === "completed" && "line-through text-muted-foreground")}>{task.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Due {task.deadline}{task.status !== "completed" && ` · ${days < 0 ? `${-days} day(s) late` : days === 0 ? "today" : `in ${days} day(s)`}`} · {PRIORITY_LABEL[task.priority]}
                    </p>
                    {task.description && <p className="mt-1.5 text-sm">{task.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={urgency} />
                    <NativeSelect aria-label={`Status of ${task.title}`} value={task.status}
                      onChange={(e) => onUpdate((p) => setTaskStatus(p, task.id, e.target.value as TaskStatus), `${task.title} marked ${e.target.value.replace("_", " ")}.`)}>
                      <option value="not_started">Not started</option>
                      <option value="in_progress">In progress</option>
                      <option value="completed">Completed</option>
                      <option value="blocked">Blocked</option>
                    </NativeSelect>
                  </div>
                </div>
                {task.dependsOn.length > 0 && (
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer text-muted-foreground inline-flex items-center gap-1">
                      <Link2 className="size-3.5" aria-hidden="true" />
                      Depends on {task.dependsOn.length} task(s){waiting.length > 0 && task.status !== "completed" ? ` — waiting on ${waiting.length}` : ""}
                    </summary>
                    <ul className="mt-1.5 pl-5 list-disc space-y-0.5">
                      {task.dependsOn.map((id) => {
                        const dep = byId.get(id);
                        return <li key={id}>{dep ? <>{dep.title} — <StatusBadge status={dep.status} className="ml-1" /></> : "Missing task"}</li>;
                      })}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
