import { format, parseISO } from "date-fns";
import type { EventPlan } from "@/domain/types";

export function HistoryPanel({ plan }: { plan: EventPlan }) {
  return (
    <section className="panel p-5 mt-2" aria-labelledby="history-heading">
      <h2 id="history-heading" className="text-xl font-semibold">Plan changes</h2>
      <p className="text-sm text-muted-foreground">Every change you approved through the assistant, newest first.</p>
      <ol className="mt-4 space-y-4">
        {plan.history.map((h) => (
          <li key={h.id} className="border-l-2 border-primary/40 pl-4">
            <p className="eyebrow">Revision {h.revision} · {format(parseISO(h.at), "d MMM yyyy, HH:mm")}</p>
            <p className="mt-1 font-semibold">{h.request}</p>
            <p className="text-sm">{h.summary}</p>
            {h.changes.length > 0 && <ul className="mt-1.5 list-disc pl-5 text-sm space-y-0.5">{h.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>}
            {h.consequences.length > 0 && (
              <>
                <p className="mt-2 text-xs font-semibold text-muted-foreground">Consequences flagged</p>
                <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-0.5">{h.consequences.map((c, i) => <li key={i}>{c}</li>)}</ul>
              </>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
