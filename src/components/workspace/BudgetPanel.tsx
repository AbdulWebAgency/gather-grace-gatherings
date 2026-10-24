import { useState, type FormEvent } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/common/NativeSelect";
import { StatusBadge } from "@/components/common/StatusBadge";
import { analyzeOverrun, formatMoney, summarizePlanBudget } from "@/domain/budget";
import { addBudgetItem, removeBudgetItem, updateBudgetItem } from "@/domain/planEdits";
import { COST_STATUSES, type BudgetItem, type CostStatus, type EventPlan } from "@/domain/types";

type Update = (updater: (p: EventPlan) => EventPlan, message?: string) => void;

export function BudgetPanel({ plan, onUpdate }: { plan: EventPlan; onUpdate: Update }) {
  const money = (n: number) => formatMoney(n, plan.event.currency);
  const summary = summarizePlanBudget(plan);
  const overrun = summary.overrun > 0 ? analyzeOverrun(plan.event.budget, plan.budgetItems) : null;
  const pct = Math.min(100, Math.round(summary.utilization * 100));

  return (
    <div className="space-y-5 pt-2">
      <section className="panel p-5" aria-labelledby="budget-summary">
        <h2 id="budget-summary" className="text-xl font-semibold">Budget summary</h2>
        <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div><dt className="text-muted-foreground">Budget</dt><dd className="font-semibold text-lg">{money(summary.budget)}</dd></div>
          <div><dt className="text-muted-foreground">Planned</dt><dd className="font-semibold text-lg">{money(summary.totalPlanned)}</dd></div>
          <div>
            <dt className="text-muted-foreground">{summary.overrun > 0 ? "Over budget by" : "Remaining"}</dt>
            <dd className={`font-semibold text-lg ${summary.overrun > 0 ? "text-destructive" : "text-success"}`}>
              {summary.overrun > 0 && <AlertTriangle className="inline size-4 mr-1 -mt-1" aria-hidden="true" />}
              {money(summary.overrun > 0 ? summary.overrun : summary.remaining)}
            </dd>
          </div>
          <div><dt className="text-muted-foreground">Used</dt><dd className="font-semibold text-lg">{Math.round(summary.utilization * 100)}%</dd></div>
        </dl>
        <div className="mt-3 h-2.5 rounded-full bg-muted overflow-hidden" role="img" aria-label={`${Math.round(summary.utilization * 100)}% of budget planned`}>
          <div className={`h-full ${summary.overrun > 0 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${pct}%` }} />
        </div>
        <ul className="mt-4 grid sm:grid-cols-3 gap-2 text-sm" aria-label="Spend by certainty">
          {COST_STATUSES.map((s) => (
            <li key={s} className="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
              <StatusBadge status={s} /> <span className="font-semibold">{money(summary.byStatus[s])}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">Estimates are AI planning figures. Quoted = a vendor's figure you recorded. Confirmed = agreed with the vendor.</p>
      </section>

      {overrun && (
        <section className="rounded-xl border-2 border-destructive/40 bg-destructive/5 p-5" aria-labelledby="overrun-heading">
          <h2 id="overrun-heading" className="text-lg font-semibold flex items-center gap-2 text-destructive"><AlertTriangle className="size-5" aria-hidden="true" />Over budget by {money(overrun.overrun)}</h2>
          <p className="mt-1 text-sm">Largest categories: {overrun.topContributors.map((c) => `${c.category} (${money(c.amount)}, ${Math.round(c.share * 100)}%)`).join(", ")}.</p>
          {overrun.savingCandidates.length > 0 ? (
            <p className="mt-1 text-sm">Optional items not yet confirmed: {overrun.savingCandidates.slice(0, 4).map((i) => `${i.description} (${money(i.amount)})`).join(", ")} — {money(overrun.flexibleOptionalAmount)} in total.</p>
          ) : (
            <p className="mt-1 text-sm">All remaining items are essential or confirmed. Ask the assistant for cheaper options, or raise the budget.</p>
          )}
        </section>
      )}

      <section className="panel p-5" aria-labelledby="allocation-heading">
        <h2 id="allocation-heading" className="text-xl font-semibold">Allocation by category</h2>
        <ul className="mt-3 space-y-2">
          {summary.byCategory.map((c) => (
            <li key={c.category} className="text-sm">
              <div className="flex justify-between"><span>{c.category}</span><span className="tabular-nums">{money(c.amount)} · {Math.round(c.share * 100)}%</span></div>
              <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-chart-1" style={{ width: `${Math.round(c.share * 100)}%` }} /></div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel p-5" aria-labelledby="items-heading">
        <h2 id="items-heading" className="text-xl font-semibold">Budget items</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Budget items with amounts and cost status</caption>
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="py-2 pr-3 font-medium">Item</th>
                <th scope="col" className="py-2 pr-3 font-medium">Amount</th>
                <th scope="col" className="py-2 pr-3 font-medium">Status</th>
                <th scope="col" className="py-2 pr-3 font-medium">Essential</th>
                <th scope="col" className="py-2 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {plan.budgetItems.map((item) => <BudgetRow key={item.id} item={item} plan={plan} onUpdate={onUpdate} />)}
            </tbody>
          </table>
        </div>
        <AddItemForm currency={plan.event.currency} onAdd={(input) => onUpdate((p) => addBudgetItem(p, input), `Added ${input.description}.`)} />
      </section>
    </div>
  );
}

function BudgetRow({ item, plan, onUpdate }: { item: BudgetItem; plan: EventPlan; onUpdate: Update }) {
  const [draft, setDraft] = useState(String(item.amount));
  const [prevAmount, setPrevAmount] = useState(item.amount);
  if (prevAmount !== item.amount) {
    setPrevAmount(item.amount);
    setDraft(String(item.amount));
  }
  const commit = () => {
    const value = Number(draft);
    if (!Number.isFinite(value) || value < 0) return setDraft(String(item.amount));
    if (value !== item.amount) onUpdate((p) => updateBudgetItem(p, item.id, { amount: value }), `${item.description} set to ${formatMoney(value, plan.event.currency)}.`);
  };
  const id = `amt-${item.id}`;
  return (
    <tr className="border-b last:border-0 align-top">
      <td className="py-2.5 pr-3 min-w-48">
        <p className="font-medium">{item.description}</p>
        <p className="text-xs text-muted-foreground">{item.category} · {item.scaling === "per_guest" ? `per guest${item.unitCost ? ` (~${formatMoney(item.unitCost, plan.event.currency)} each)` : ""}` : "fixed price"}</p>
        {item.notes && <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>}
      </td>
      <td className="py-2.5 pr-3">
        <label htmlFor={id} className="sr-only">Amount for {item.description}</label>
        <Input id={id} type="number" min={0} className="w-32 tabular-nums" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
      </td>
      <td className="py-2.5 pr-3">
        <NativeSelect aria-label={`Cost status for ${item.description}`} value={item.costStatus}
          onChange={(e) => onUpdate((p) => updateBudgetItem(p, item.id, { costStatus: e.target.value as CostStatus }), `${item.description} marked ${e.target.value}.`)}>
          <option value="estimate">Estimate</option>
          <option value="quoted">Quoted</option>
          <option value="confirmed">Confirmed</option>
        </NativeSelect>
      </td>
      <td className="py-2.5 pr-3">
        <Checkbox aria-label={`${item.description} is essential`} checked={item.essential}
          onCheckedChange={(c) => onUpdate((p) => updateBudgetItem(p, item.id, { essential: c === true }))} />
      </td>
      <td className="py-2.5">
        <Button variant="ghost" size="icon" aria-label={`Remove ${item.description}`} disabled={item.essential || item.costStatus === "confirmed"}
          title={item.essential ? "Essential items can't be removed — untick Essential first" : item.costStatus === "confirmed" ? "Confirmed costs can't be removed" : undefined}
          onClick={() => onUpdate((p) => removeBudgetItem(p, item.id), `Removed ${item.description}.`)}>
          <Trash2 aria-hidden="true" />
        </Button>
      </td>
    </tr>
  );
}

function AddItemForm({ currency, onAdd }: { currency: string; onAdd: (i: { category: string; description: string; amount: number; essential: boolean; costStatus: CostStatus }) => void }) {
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!description.trim() || !Number.isFinite(value) || value < 0) return setError("Enter a description and an amount of zero or more.");
    onAdd({ category: category || "Other", description, amount: value, essential: false, costStatus: "estimate" });
    setCategory(""); setDescription(""); setAmount(""); setError(null);
  };
  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.5fr_8rem_auto] items-end border-t pt-4" aria-label="Add budget item">
      <div className="space-y-1"><Label htmlFor="new-cat">Category</Label><Input id="new-cat" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={60} /></div>
      <div className="space-y-1"><Label htmlFor="new-desc">Description</Label><Input id="new-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} /></div>
      <div className="space-y-1"><Label htmlFor="new-amt">Amount ({currency})</Label><Input id="new-amt" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
      <Button type="submit" variant="secondary"><Plus aria-hidden="true" />Add</Button>
      {error && <p role="alert" className="sm:col-span-4 text-sm text-destructive">{error}</p>}
    </form>
  );
}
