import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ExtractedEvent } from "@/domain/planBuilder";
import type { EventDetails } from "@/domain/types";
import { extractEventDetails } from "@/lib/planning.functions";
import { todayIso } from "@/state/usePlanWorkspace";
import { EventDetailsForm, emptyFormValues, formValuesFromExtraction, type EventFormValues } from "./EventDetailsForm";

const EXAMPLE =
  "A community celebration for our neighbourhood association in Pune, about 100 guests, six weeks from today. Budget is ₹1,00,000. We want a warm, festive feel with local food, a small stage for performances, wheelchair access and vegetarian options. Photography is a priority.";

interface OnboardingProps {
  onGenerate: (event: EventDetails) => Promise<string | null>;
}

export function Onboarding({ onGenerate }: OnboardingProps) {
  const extract = useServerFn(extractEventDetails);
  const [step, setStep] = useState<"describe" | "review">("describe");
  const [description, setDescription] = useState("");
  const [extraction, setExtraction] = useState<ExtractedEvent | null>(null);
  const [initialValues, setInitialValues] = useState<EventFormValues>(emptyFormValues());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExtract() {
    setError(null);
    if (description.trim().length < 10) {
      setError("Please describe your event in at least a sentence.");
      return;
    }
    setBusy(true);
    try {
      const result = await extract({ data: { text: description.slice(0, 2000), today: todayIso() } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setExtraction(result.data);
      setInitialValues(formValuesFromExtraction(result.data));
      setStep("review");
    } catch {
      setError("Could not reach the planning assistant. Please try again or fill in the details manually.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <header className="mb-8">
        <p className="eyebrow">Event Planning Assistant</p>
        <h1 className="mt-2 text-4xl sm:text-5xl font-semibold text-foreground">Plan an event that actually happens.</h1>
        <p className="mt-3 text-lg text-muted-foreground max-w-2xl">
          Weddings, birthdays and community events — a budget, timeline and vendor checklist you can keep revising in plain language.
        </p>
      </header>

      {step === "describe" ? (
        <section aria-labelledby="describe-heading" className="panel p-5 sm:p-7">
          <h2 id="describe-heading" className="text-2xl font-semibold">1. Describe your event</h2>
          <p className="mt-1 text-sm text-muted-foreground">Write it the way you'd tell a friend. You'll review everything before a plan is created.</p>
          <div className="mt-5 space-y-2">
            <Label htmlFor="event-description">Event description</Label>
            <Textarea
              id="event-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={6}
              placeholder="e.g. My sister's wedding in Jaipur next March, around 200 guests, budget ₹8 lakh…"
              aria-describedby="description-count"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => setDescription(EXAMPLE)}>
                Use an example description
              </button>
              <span id="description-count">{description.length}/2000</span>
            </div>
          </div>
          {error && (
            <Alert variant="destructive" className="mt-4" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={handleExtract} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
              {busy ? "Reading your description…" : "Extract details"}
            </Button>
            <Button variant="outline" onClick={() => { setExtraction(null); setInitialValues(emptyFormValues()); setStep("review"); }} disabled={busy}>
              <PenLine aria-hidden="true" /> Fill in manually
            </Button>
          </div>
        </section>
      ) : (
        <EventDetailsForm
          initialValues={initialValues}
          extraction={extraction}
          onBack={() => setStep("describe")}
          onSubmit={onGenerate}
        />
      )}
    </main>
  );
}
