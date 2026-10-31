import type { RefObject } from "react";
import { AlertTriangle, ArrowRight, Ban, CheckCircle2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatMoney } from "@/domain/budget";
import type { ChangePreview } from "@/domain/planChange";
import { classifyTask } from "@/domain/timeline";
import type { EventPlan } from "@/domain/types";
import type { PendingChange } from "@/state/planWorkflow";
import { todayIso } from "@/state/usePlanWorkspace";
import { pendingChangeIsStale } from "@/state/planWorkflow";

interface Props {
  headingRef: RefObject<HTMLHeadingElement | null>;
  plan: EventPlan;
  pending: PendingChange;
  preview: ChangePreview;
  onToggle: (key: string) => void;
  onAccept: () => void;
  onDiscard: () => void;
}

export function ChangeReview({
  headingRef,
  plan,
  pending,
  preview,
  onToggle,
  onAccept,
  onDiscard,
}: Props) {
  const money = (n: number) => formatMoney(n, plan.event.currency);
  const { proposal, validation } = pending;
  const { report } = preview;
  const today = todayIso();
  const hasOps = validation.operations.length > 0;
  const hasProposalOperations = proposal.operations.length > 0;
  const selectedCount = pending.selected.length;
  const stale = pendingChangeIsStale(plan, pending);

  return (
    <section
      className="rounded-xl border-2 border-primary/40 bg-card p-5 shadow-card"
      aria-labelledby="review-heading"
    >
      <p className="eyebrow">
        {hasProposalOperations ? "Proposed change — review before applying" : "Assistant answer"}
      </p>
      <h2
        id="review-heading"
        ref={headingRef}
        tabIndex={-1}
        className="mt-1 text-2xl font-semibold outline-none"
      >
        “{pending.request}”
      </h2>
      {hasProposalOperations ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Review the validated changes below. Rejected operations are listed separately and will not
          be applied.
        </p>
      ) : (
        proposal.summary && <p className="mt-2">{proposal.summary}</p>
      )}
      {!hasProposalOperations && proposal.answer && (
        <p className="mt-2 text-sm text-muted-foreground whitespace-pre-line">{proposal.answer}</p>
      )}

      {proposal.clarifyingQuestions.length > 0 && (
        <div className="mt-3 rounded-lg bg-accent/50 p-3 text-sm">
          <p className="font-semibold">The assistant needs to know:</p>
          <ul className="list-disc pl-5">
            {proposal.clarifyingQuestions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      {hasOps && (
        <fieldset className="mt-4">
          <legend className="font-semibold">Changes to apply</legend>
          <ul className="mt-2 space-y-2">
            {validation.operations.map((op) => {
              const id = `op-${op.key}`;
              return (
                <li key={op.key} className="flex items-start gap-3 rounded-lg border p-3">
                  <Checkbox
                    id={id}
                    checked={pending.selected.includes(op.key)}
                    onCheckedChange={() => onToggle(op.key)}
                    aria-describedby={op.confirmationReason ? `${id}-warn` : undefined}
                  />
                  <div className="text-sm">
                    <label htmlFor={id} className="font-medium cursor-pointer">
                      {op.label}
                    </label>
                    {op.reason && <p className="text-muted-foreground">{op.reason}</p>}
                    {op.confirmationReason && (
                      <p
                        id={`${id}-warn`}
                        className="mt-1 flex items-center gap-1 text-warning-foreground font-medium"
                      >
                        <ShieldAlert className="size-4 text-warning" aria-hidden="true" />
                        Needs your confirmation: {op.confirmationReason}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      {validation.rejected.length > 0 && (
        <div className="mt-4">
          <p className="font-semibold flex items-center gap-1.5">
            <Ban className="size-4" aria-hidden="true" />
            Not applied (failed validation)
          </p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {validation.rejected.map((r, i) => (
              <li key={i}>
                <strong>{r.label}:</strong> {r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasOps && selectedCount > 0 && (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg bg-muted p-4 text-sm">
            <p className="font-semibold">Budget impact</p>
            <dl className="mt-2 space-y-1">
              <Row
                label="Budget"
                before={money(report.budgetBefore.budget)}
                after={money(report.budgetAfter.budget)}
              />
              <Row
                label="Planned spend"
                before={money(report.budgetBefore.totalPlanned)}
                after={money(report.budgetAfter.totalPlanned)}
              />
              <Row
                label="Confirmed costs"
                before={money(report.budgetBefore.byStatus.confirmed)}
                after={money(report.budgetAfter.byStatus.confirmed)}
              />
              <Row
                label="Still estimates"
                before={money(report.budgetBefore.byStatus.estimate)}
                after={money(report.budgetAfter.byStatus.estimate)}
              />
            </dl>
            <p
              className={`mt-2 font-semibold flex items-center gap-1.5 ${report.budgetAfter.overrun > 0 ? "text-destructive" : "text-success"}`}
            >
              {report.budgetAfter.overrun > 0 ? (
                <AlertTriangle className="size-4" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="size-4" aria-hidden="true" />
              )}
              {report.budgetAfter.overrun > 0
                ? `Over budget by ${money(report.budgetAfter.overrun)}`
                : `${money(report.budgetAfter.remaining)} remaining`}
            </p>
            {report.guestImpacts.length > 0 && (
              <>
                <p className="mt-3 font-semibold">Guest-count effects</p>
                <ul className="mt-1 space-y-1">
                  {report.guestImpacts.map((g) => (
                    <li key={g.itemId}>
                      {g.description}: {money(g.before)} → {money(g.after)}{" "}
                      {g.updated ? "(estimate updated)" : <em>— {g.note}</em>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div className="rounded-lg bg-muted p-4 text-sm">
            <p className="font-semibold">Timeline impact</p>
            {report.scheduleImpacts.length === 0 ? (
              <p className="mt-1 text-muted-foreground">No deadlines move.</p>
            ) : (
              <ul className="mt-2 space-y-1 max-h-48 overflow-auto">
                {report.scheduleImpacts.map((s) => (
                  <li key={s.taskId}>
                    {s.title}: {s.before} → {s.after}
                    {s.reason === "compressed" && " (lead time squeezed)"}
                    {s.reason === "dependency_adjusted" && " (follows its prerequisite)"}
                  </li>
                ))}
              </ul>
            )}
            {report.attention.length > 0 && (
              <>
                <p className="mt-3 font-semibold">Needs attention after this change</p>
                <ul className="mt-1 space-y-1">
                  {report.attention.slice(0, 6).map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2">
                      <span>{t.title}</span>
                      <StatusBadge status={classifyTask(t, today)} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      {!hasOps && report.attention.length > 0 && (
        <div className="mt-4 text-sm">
          <p className="font-semibold">Tasks needing attention now</p>
          <ul className="mt-1 space-y-1">
            {report.attention.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2">
                <span>
                  {t.title} — due {t.deadline}
                </span>
                <StatusBadge status={classifyTask(t, today)} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasOps && selectedCount > 0 && report.consequences.length > 0 && (
        <div className="mt-4">
          <p className="font-semibold">Consequences to consider</p>
          <ul className="mt-1 list-disc pl-5 text-sm space-y-0.5">
            {report.consequences.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {!hasProposalOperations && proposal.tradeoffs.length > 0 && (
        <div className="mt-4">
          <p className="font-semibold">Trade-offs</p>
          <ul className="mt-1 list-disc pl-5 text-sm space-y-0.5">
            {proposal.tradeoffs.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      {!hasProposalOperations && proposal.alternatives.length > 0 && (
        <div className="mt-4">
          <p className="font-semibold">Alternatives (suggestions — not applied)</p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {proposal.alternatives.map((a, i) => (
              <li key={i} className="rounded-lg border p-3 text-sm">
                <p className="font-semibold">
                  {a.title}
                  {a.estimatedSaving ? (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      · saves ~{money(a.estimatedSaving)} (estimate)
                    </span>
                  ) : null}
                </p>
                <p>{a.description}</p>
                <p className="mt-1 text-muted-foreground">
                  <strong>Consequence:</strong> {a.consequence}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground">
            To use an alternative, ask the assistant for it by name.
          </p>
        </div>
      )}

      {stale && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          This proposal is based on an earlier version of the plan. Discard it and ask again to
          review changes against the current plan.
        </p>
      )}

      {hasOps && selectedCount > 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          Unchanged: {report.unchanged.budgetItems} budget items, {report.unchanged.tasks} tasks,{" "}
          {report.unchanged.vendors} vendor records. Completed tasks keep their status and dates.
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        {hasOps ? (
          <>
            <Button onClick={onAccept} disabled={selectedCount === 0 || stale}>
              Apply {selectedCount} change{selectedCount === 1 ? "" : "s"}
            </Button>
            <Button variant="outline" onClick={onDiscard}>
              Discard proposal
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={onDiscard}>
            Close
          </Button>
        )}
      </div>
    </section>
  );
}

function Row({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt>{label}</dt>
      <dd className="tabular-nums">
        {before === after ? (
          before
        ) : (
          <>
            {before} <ArrowRight className="inline size-3.5" aria-label="to" />{" "}
            <strong>{after}</strong>
          </>
        )}
      </dd>
    </div>
  );
}
