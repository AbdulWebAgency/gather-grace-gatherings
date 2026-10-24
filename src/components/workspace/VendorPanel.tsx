import { useState, type FormEvent } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/common/NativeSelect";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatMoney } from "@/domain/budget";
import { acceptQuote, addQuote, removeQuote, setVendorBookingStatus } from "@/domain/planEdits";
import type { BookingStatus, EventPlan, VendorRequirement } from "@/domain/types";

type Update = (u: (p: EventPlan) => EventPlan, m?: string) => void;

export function VendorPanel({ plan, onUpdate }: { plan: EventPlan; onUpdate: Update }) {
  if (plan.vendors.length === 0)
    return <p className="panel p-5 mt-2 text-sm text-muted-foreground">No vendor requirements yet. Ask the assistant to add some.</p>;
  return (
    <div className="space-y-4 pt-2">
      <p className="text-sm text-muted-foreground">Record quotes you receive and compare them. The app never contacts vendors or verifies availability for you.</p>
      {plan.vendors.map((v) => <VendorCard key={v.id} vendor={v} plan={plan} onUpdate={onUpdate} />)}
    </div>
  );
}

function VendorCard({ vendor, plan, onUpdate }: { vendor: VendorRequirement; plan: EventPlan; onUpdate: Update }) {
  const money = (n: number) => formatMoney(n, plan.event.currency);
  const linked = plan.budgetItems.find((b) => b.id === vendor.budgetItemId);
  const quotes = [...vendor.quotes].sort((a, b) => a.amount - b.amount);
  const cheapest = quotes[0]?.amount;
  const headingId = `vendor-${vendor.id}`;

  return (
    <section className="panel p-5" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={headingId} className="text-lg font-semibold">{vendor.category}</h3>
          <p className="text-sm mt-0.5">{vendor.requirement}</p>
          {linked && <p className="text-xs text-muted-foreground mt-1">Budget line: {linked.description} — {money(linked.amount)} <StatusBadge status={linked.costStatus} className="ml-1" /></p>}
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={vendor.bookingStatus} />
          <NativeSelect aria-label={`Booking status for ${vendor.category}`} value={vendor.bookingStatus}
            onChange={(e) => onUpdate((p) => setVendorBookingStatus(p, vendor.id, e.target.value as BookingStatus), `${vendor.category} marked ${e.target.value.replace("_", " ")}.`)}>
            <option value="not_contacted">Not contacted</option>
            <option value="contacted">Contacted</option>
            <option value="quote_received">Quote received</option>
            <option value="booked">Booked (I have confirmation)</option>
          </NativeSelect>
        </div>
      </div>

      {vendor.questions.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium">Questions to ask ({vendor.questions.length})</summary>
          <ul className="mt-1.5 list-disc pl-5 space-y-0.5">{vendor.questions.map((q) => <li key={q}>{q}</li>)}</ul>
        </details>
      )}

      <div className="mt-4">
        <h4 className="eyebrow">Recorded quotes</h4>
        {quotes.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">No quotes recorded yet.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Quotes for {vendor.category}, cheapest first</caption>
              <thead className="text-left text-muted-foreground"><tr className="border-b">
                <th scope="col" className="py-1.5 pr-3 font-medium">Vendor</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">Amount</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">Includes / excludes</th>
                <th scope="col" className="py-1.5 font-medium"><span className="sr-only">Actions</span></th>
              </tr></thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-3"><p className="font-medium">{q.vendorName}</p>{q.contact && <p className="text-xs text-muted-foreground">{q.contact}</p>}</td>
                    <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                      {money(q.amount)}
                      {q.amount === cheapest && quotes.length > 1 && <span className="block text-xs text-success font-semibold">Lowest</span>}
                      {linked && <span className="block text-xs text-muted-foreground">{q.amount >= linked.amount ? "+" : "−"}{money(Math.abs(q.amount - linked.amount))} vs plan</span>}
                    </td>
                    <td className="py-2 pr-3 text-xs">{q.inclusions && <p><strong>Incl:</strong> {q.inclusions}</p>}{q.exclusions && <p><strong>Excl:</strong> {q.exclusions}</p>}</td>
                    <td className="py-2 whitespace-nowrap">
                      {q.status === "accepted" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-success"><Check className="size-3.5" aria-hidden="true" />Selected</span>
                      ) : (
                        <Button size="sm" variant="outline" disabled={!linked || linked.costStatus === "confirmed"}
                          onClick={() => onUpdate((p) => acceptQuote(p, vendor.id, q.id), `Quote from ${q.vendorName} recorded as the quoted cost.`)}>
                          Use this quote
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" aria-label={`Remove quote from ${q.vendorName}`} onClick={() => onUpdate((p) => removeQuote(p, vendor.id, q.id), "Quote removed.")}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <AddQuoteForm vendor={vendor} currency={plan.event.currency} onAdd={(q) => onUpdate((p) => addQuote(p, vendor.id, q), `Quote from ${q.vendorName} added.`)} />
      </div>
    </section>
  );
}

function AddQuoteForm({ vendor, currency, onAdd }: { vendor: VendorRequirement; currency: string; onAdd: (q: { vendorName: string; amount: number; contact: string; inclusions: string; exclusions: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ vendorName: "", amount: "", contact: "", inclusions: "", exclusions: "" });
  const [error, setError] = useState<string | null>(null);
  const p = `q-${vendor.id}`;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const amount = Number(v.amount);
    if (!v.vendorName.trim() || !Number.isFinite(amount) || amount < 0) return setError("Enter the vendor's name and the quoted amount.");
    onAdd({ ...v, amount });
    setV({ vendorName: "", amount: "", contact: "", inclusions: "", exclusions: "" });
    setError(null);
    setOpen(false);
  };
  if (!open) return <Button className="mt-3" size="sm" variant="secondary" onClick={() => setOpen(true)}><Plus aria-hidden="true" />Record a quote</Button>;
  return (
    <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2 rounded-lg bg-muted p-3" aria-label={`Record a quote for ${vendor.category}`}>
      <div className="space-y-1"><Label htmlFor={`${p}-name`}>Vendor name</Label><Input id={`${p}-name`} value={v.vendorName} maxLength={120} onChange={(e) => setV({ ...v, vendorName: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor={`${p}-amt`}>Quoted amount ({currency})</Label><Input id={`${p}-amt`} type="number" min={0} value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} /></div>
      <div className="space-y-1 sm:col-span-2"><Label htmlFor={`${p}-contact`}>Contact (optional)</Label><Input id={`${p}-contact`} value={v.contact} maxLength={300} onChange={(e) => setV({ ...v, contact: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor={`${p}-inc`}>Inclusions</Label><Input id={`${p}-inc`} value={v.inclusions} maxLength={300} onChange={(e) => setV({ ...v, inclusions: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor={`${p}-exc`}>Exclusions</Label><Input id={`${p}-exc`} value={v.exclusions} maxLength={300} onChange={(e) => setV({ ...v, exclusions: e.target.value })} /></div>
      {error && <p role="alert" className="sm:col-span-2 text-sm text-destructive">{error}</p>}
      <div className="sm:col-span-2 flex gap-2"><Button type="submit" size="sm">Save quote</Button><Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
    </form>
  );
}
