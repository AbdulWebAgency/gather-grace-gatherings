import { AlertTriangle, CheckCircle2, Lightbulb } from "lucide-react";
import { formatMoney, summarizePlanBudget } from "@/domain/budget";
import { classifyTask, daysBetween, sortTasksChronologically, validateDependencies } from "@/domain/timeline";
import type { EventPlan } from "@/domain/types";
import { StatusBadge } from "@/components/common/StatusBadge";
import { todayIso } from "@/state/usePlanWorkspace";

export function OverviewPanel({ plan, onNavigate }: { plan: EventPlan; onNavigate: (tab: string) => void }) {
  const today = todayIso();
  const money = (n: number) => formatMoney(n, plan.event.currency);
  const budget = summarizePlanBudget(plan);
  const daysToGo = daysBetween(today, plan.event.date);
  const nextTasks = sortTasksChronologically(plan.tasks.filter((t) => t.status !== "completed")).slice(0, 5);
  const completed = plan.tasks.filter((t) => t.status === "completed").length;
  const unbooked = plan.vendors.filter((v) => v.bookingStatus !== "booked");
  const estimateCount = plan.budgetItems.filter((i) => i.costStatus === "estimate").length;
  const issues = validateDependencies(plan.tasks);

  return (
    <div className="space-y-5 pt-2">
      <section aria-label="Key figures" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Days to go" value={daysToGo >= 0 ? `${daysToGo}` : "Past"} />
        <Stat label="Planned spend" value={money(budget.totalPlanned)} sub={`of ${money(budget.budget)}`} />
        {budget.overrun > 0 ? (
          <Stat label="Over budget" value={money(budget.overrun)} tone="danger" icon={<AlertTriangle className="size-4" aria-hidden="true" />} />
        ) : (
          <Stat label="Remaining" value={money(budget.remaining)} tone="success" icon={<CheckCircle2 className="size-4" aria-hidden="true" />} />
        )}
        <Stat label="Tasks done" value={`${completed}/${plan.tasks.length}`} />
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="panel p-5" aria-labelledby="next-deadlines">
          <h2 id="next-deadlines" className="text-xl font-semibold">Next deadlines</h2>
          {nextTasks.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Every task is complete. 🎉</p>
          ) : (
            <ul className="mt-3 divide-y">
              {nextTasks.map((t) => (
                <li key={t.id} className="py-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium leading-snug">{t.title}</p>
                    <p className="text-xs text-muted-foreground">Due {t.deadline}</p>
                  </div>
                  <StatusBadge status={classifyTask(t, today)} />
                </li>
              ))}
            </ul>
          )}
          <button className="mt-3 text-sm font-semibold text-primary underline-offset-2 hover:underline" onClick={() => onNavigate("timeline")}>Open timeline</button>
        </section>

        <section className="panel p-5" aria-labelledby="decisions">
          <h2 id="decisions" className="text-xl font-semibold">Outstanding decisions</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {budget.overrun > 0 && <li className="flex gap-2"><AlertTriangle className="size-4 shrink-0 text-destructive mt-0.5" aria-hidden="true" /><span>Plan is {money(budget.overrun)} over budget — choose where to cut or raise the budget.</span></li>}
            {unbooked.length > 0 && <li>• {unbooked.length} vendor requirement(s) not yet booked: {unbooked.slice(0, 4).map((v) => v.category).join(", ")}{unbooked.length > 4 ? "…" : ""}</li>}
            {estimateCount > 0 && <li>• {estimateCount} budget item(s) are still AI estimates — collect quotes to firm them up.</li>}
            {issues.map((i) => <li key={i.taskId + i.kind} className="flex gap-2"><AlertTriangle className="size-4 shrink-0 text-warning mt-0.5" aria-hidden="true" />{i.message}</li>)}
            {budget.overrun === 0 && unbooked.length === 0 && estimateCount === 0 && issues.length === 0 && <li className="text-muted-foreground">Nothing outstanding.</li>}
          </ul>
        </section>
      </div>

      {plan.ideas.length > 0 && (
        <section className="panel p-5" aria-labelledby="ideas">
          <h2 id="ideas" className="text-xl font-semibold flex items-center gap-2"><Lightbulb className="size-5 text-highlight" aria-hidden="true" />Ideas for your event</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 text-sm">{plan.ideas.map((i) => <li key={i} className="rounded-lg bg-muted p-3">{i}</li>)}</ul>
        </section>
      )}

      <section className="panel p-5" aria-labelledby="assumptions">
        <h2 id="assumptions" className="text-xl font-semibold">Assumptions to review</h2>
        <p className="text-sm text-muted-foreground">Nothing here has been booked or verified. Correct anything that's wrong using the assistant.</p>
        <ul className="mt-3 list-disc pl-5 space-y-1 text-sm">{plan.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
      </section>
    </div>
  );
}

function Stat({ label, value, sub, tone, icon }: { label: string; value: string; sub?: string; tone?: "danger" | "success"; icon?: React.ReactNode }) {
  const toneClass = tone === "danger" ? "text-destructive" : tone === "success" ? "text-success" : "text-foreground";
  return (
    <div className="panel p-4">
      <p className="eyebrow flex items-center gap-1.5">{icon}{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold ${toneClass}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
