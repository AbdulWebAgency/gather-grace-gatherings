import { useId, useState, type FormEvent } from "react";
import { ArrowLeft, HelpCircle, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ExtractedEvent } from "@/domain/planBuilder";
import { EVENT_CATEGORIES, eventDetailsSchema, type EventDetails } from "@/domain/types";

export interface EventFormValues {
  name: string;
  category: string;
  date: string;
  dateIsApproximate: boolean;
  location: string;
  guestCount: string;
  budget: string;
  currency: string;
  theme: string;
  priorities: string;
  mustHaves: string;
  accessibilityNeeds: string;
  dietaryCulturalNeeds: string;
  constraints: string;
}

export function emptyFormValues(): EventFormValues {
  return {
    name: "", category: "community", date: "", dateIsApproximate: false, location: "", guestCount: "", budget: "",
    currency: "INR", theme: "", priorities: "", mustHaves: "", accessibilityNeeds: "", dietaryCulturalNeeds: "", constraints: "",
  };
}

const joinLines = (items: string[]) => items.join("\n");
const splitLines = (value: string) =>
  value.split(/\n|;/).map((s) => s.trim()).filter(Boolean).slice(0, 10);

export function formValuesFromExtraction(x: ExtractedEvent): EventFormValues {
  return {
    name: x.name ?? "",
    category: x.category ?? "community",
    date: x.date && /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? x.date : "",
    dateIsApproximate: x.dateIsApproximate,
    location: x.location ?? "",
    guestCount: x.guestCount?.toString() ?? "",
    budget: x.budget?.toString() ?? "",
    currency: (x.currency ?? "INR").toUpperCase(),
    theme: x.theme ?? "",
    priorities: joinLines(x.priorities),
    mustHaves: joinLines(x.mustHaves),
    accessibilityNeeds: joinLines(x.accessibilityNeeds),
    dietaryCulturalNeeds: joinLines(x.dietaryCulturalNeeds),
    constraints: joinLines(x.constraints),
  };
}

function toEventDetails(v: EventFormValues) {
  return eventDetailsSchema.safeParse({
    name: v.name,
    category: v.category,
    date: v.date,
    dateIsApproximate: v.dateIsApproximate,
    location: v.location,
    guestCount: v.guestCount === "" ? NaN : Number(v.guestCount),
    budget: v.budget === "" ? NaN : Number(v.budget.replace(/,/g, "")),
    currency: v.currency.trim().toUpperCase(),
    theme: v.theme,
    priorities: splitLines(v.priorities),
    mustHaves: splitLines(v.mustHaves),
    accessibilityNeeds: splitLines(v.accessibilityNeeds),
    dietaryCulturalNeeds: splitLines(v.dietaryCulturalNeeds),
    constraints: splitLines(v.constraints),
  });
}

const FIELD_MESSAGES: Partial<Record<keyof EventFormValues, string>> = {
  date: "Enter the event date (an approximate date is fine — tick the box below).",
  guestCount: "Enter an expected number of guests between 1 and 10,000.",
  budget: "Enter a total budget greater than zero.",
  name: "Give your event a name.",
  currency: "Use a 3-letter currency code such as INR.",
};

interface Props {
  initialValues: EventFormValues;
  extraction: ExtractedEvent | null;
  onBack: () => void;
  onSubmit: (event: EventDetails) => Promise<string | null>;
}

export function EventDetailsForm({ initialValues, extraction, onBack, onSubmit }: Props) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof EventFormValues, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formId = useId();

  const set = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const parsed = toEventDetails(values);
    if (!parsed.success) {
      const next: Partial<Record<keyof EventFormValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof EventFormValues;
        next[key] ??= FIELD_MESSAGES[key] ?? issue.message;
      }
      setErrors(next);
      const first = Object.keys(next)[0];
      if (first) document.getElementById(`${formId}-${first}`)?.focus();
      return;
    }
    if (parsed.data.date < new Date().toISOString().slice(0, 10)) {
      setErrors({ date: "The event date must be today or later." });
      document.getElementById(`${formId}-date`)?.focus();
      return;
    }
    setErrors({});
    setBusy(true);
    const error = await onSubmit(parsed.data);
    setBusy(false);
    if (error) setSubmitError(error);
  }

  const field = (key: keyof EventFormValues, labelText: string, props: { type?: string; placeholder?: string; inputMode?: "numeric" } = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${formId}-${key}`}>{labelText}</Label>
      <Input
        id={`${formId}-${key}`}
        type={props.type ?? "text"}
        inputMode={props.inputMode}
        placeholder={props.placeholder}
        value={values[key] as string}
        onChange={(e) => set(key, e.target.value as never)}
        aria-invalid={errors[key] ? true : undefined}
        aria-describedby={errors[key] ? `${formId}-${key}-error` : undefined}
      />
      {errors[key] && <p id={`${formId}-${key}-error`} className="text-sm text-destructive">{errors[key]}</p>}
    </div>
  );

  const listField = (key: keyof EventFormValues, labelText: string, hint: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${formId}-${key}`}>{labelText}</Label>
      <Textarea id={`${formId}-${key}`} rows={2} value={values[key] as string} onChange={(e) => set(key, e.target.value as never)} aria-describedby={`${formId}-${key}-hint`} maxLength={1500} />
      <p id={`${formId}-${key}-hint`} className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  return (
    <section aria-labelledby={`${formId}-heading`} className="panel p-5 sm:p-7">
      <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Back
      </button>
      <h2 id={`${formId}-heading`} className="text-2xl font-semibold">2. Review the details</h2>
      <p className="mt-1 text-sm text-muted-foreground">Edit anything that isn't right. Only date, guests and budget are required.</p>

      {extraction && (extraction.followUpQuestions.length > 0 || extraction.assumptions.length > 0) && (
        <div className="mt-5 rounded-lg border border-highlight/50 bg-accent/40 p-4 text-sm">
          {extraction.followUpQuestions.length > 0 && (
            <>
              <p className="flex items-center gap-1.5 font-semibold"><HelpCircle className="size-4" aria-hidden="true" /> A few questions to sharpen the plan</p>
              <ul className="mt-1.5 list-disc pl-5 space-y-0.5">{extraction.followUpQuestions.map((q) => <li key={q}>{q}</li>)}</ul>
            </>
          )}
          {extraction.assumptions.length > 0 && (
            <>
              <p className="mt-3 font-semibold">Assumptions made while reading your description</p>
              <ul className="mt-1.5 list-disc pl-5 space-y-0.5">{extraction.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
            </>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-6">
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="eyebrow mb-3">Essentials</legend>
          {field("name", "Event name", { placeholder: "Neighbourhood Diwali Mela" })}
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-category`}>Event type</Label>
            <select
              id={`${formId}-category`}
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
              value={values.category}
              onChange={(e) => set("category", e.target.value)}
            >
              {EVENT_CATEGORIES.map((c) => <option key={c} value={c}>{c === "community" ? "Community event" : c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            {field("date", "Event date", { type: "date" })}
            <div className="flex items-center gap-2 pt-1">
              <Checkbox id={`${formId}-approx`} checked={values.dateIsApproximate} onCheckedChange={(c) => set("dateIsApproximate", c === true)} />
              <Label htmlFor={`${formId}-approx`} className="font-normal text-sm">This date is approximate</Label>
            </div>
          </div>
          {field("location", "Location", { placeholder: "City or venue area" })}
          {field("guestCount", "Expected guests", { type: "number", inputMode: "numeric" })}
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            {field("budget", "Total budget", { type: "number", inputMode: "numeric" })}
            {field("currency", "Currency")}
          </div>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="eyebrow mb-3">Preferences (optional, one per line)</legend>
          <div className="sm:col-span-2">{field("theme", "Atmosphere or theme", { placeholder: "Warm, festive, family-friendly" })}</div>
          {listField("priorities", "Top priorities", "What matters most, e.g. photography, food quality")}
          {listField("mustHaves", "Must-have arrangements", "Things the event can't happen without")}
          {listField("accessibilityNeeds", "Accessibility needs", "e.g. step-free access, seating for elders")}
          {listField("dietaryCulturalNeeds", "Dietary or cultural needs", "e.g. vegetarian, no alcohol, rituals")}
          <div className="sm:col-span-2">{listField("constraints", "Other constraints", "e.g. must end by 10pm, outdoor only")}</div>
        </fieldset>

        {submitError && (
          <Alert variant="destructive" role="alert"><AlertDescription>{submitError}</AlertDescription></Alert>
        )}
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Wand2 aria-hidden="true" />}
          {busy ? "Building your plan… this can take a minute" : "Generate my plan"}
        </Button>
      </form>
    </section>
  );
}
