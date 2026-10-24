import { useState, type FormEvent } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { PlanWorkspace } from "@/state/usePlanWorkspace";

const SUGGESTIONS = [
  "Increase the guest count to 150, reduce the budget to ₹85,000, and move the event two weeks earlier.",
  "Keep photography as a priority, but suggest cheaper decoration options.",
  "Mark the venue as booked.",
  "Show me which tasks need immediate attention.",
];

export function AssistantPanel({ ws }: { ws: PlanWorkspace }) {
  const [request, setRequest] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!request.trim() || ws.isProposing) return;
    await ws.askAssistant(request);
  };

  return (
    <section className="panel p-5" aria-labelledby="assistant-heading">
      <h2 id="assistant-heading" className="text-xl font-semibold flex items-center gap-2"><Sparkles className="size-5 text-highlight" aria-hidden="true" />Planning assistant</h2>
      <p className="mt-1 text-sm text-muted-foreground">Describe a change or ask a question. You'll review every proposed change before it's applied.</p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <Label htmlFor="assistant-input" className="sr-only">Your request</Label>
        <Textarea id="assistant-input" rows={4} maxLength={2000} value={request} onChange={(e) => setRequest(e.target.value)}
          placeholder="e.g. Move the event a week later and add a kids' corner"
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e); }} />
        <Button type="submit" className="w-full" disabled={ws.isProposing || !request.trim() || !!ws.pending}>
          {ws.isProposing ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
          {ws.isProposing ? "Working out the changes…" : ws.pending ? "Review the open proposal first" : "Propose changes"}
        </Button>
      </form>
      {ws.assistantError && (
        <Alert variant="destructive" className="mt-3" role="alert"><AlertDescription>{ws.assistantError}</AlertDescription></Alert>
      )}
      <div className="mt-5">
        <p className="eyebrow">Try asking</p>
        <ul className="mt-2 space-y-1.5">
          {SUGGESTIONS.map((s) => (
            <li key={s}>
              <button type="button" onClick={() => setRequest(s)} className="w-full text-left rounded-lg border bg-background px-3 py-2 text-sm hover:bg-muted">{s}</button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
