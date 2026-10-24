import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { commitChange } from "@/domain/planChange";
import { toIsoDate } from "@/domain/timeline";
import type { EventDetails, EventPlan } from "@/domain/types";
import { generatePlanDraft, proposePlanChange } from "@/lib/planning.functions";
import { clearPlan, loadPlan, savePlan } from "./planStorage";
import { createPlan, previewPendingChange, requestPlanChange, type PendingChange } from "./planWorkflow";

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function usePlanWorkspace() {
  const [plan, setPlan] = useState<EventPlan | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [isProposing, setIsProposing] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const propose = useServerFn(proposePlanChange);
  const draft = useServerFn(generatePlanDraft);

  useEffect(() => {
    const { plan: loaded, discarded } = loadPlan();
    setPlan(loaded);
    if (discarded) setStorageNotice("A previously saved plan was unreadable and has been cleared.");
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !plan) return;
    if (!savePlan(plan)) setStorageNotice("Your browser blocked local saving. Changes will be lost when you close this tab.");
  }, [plan, hydrated]);

  const announce = useCallback((message: string) => {
    setAnnouncement("");
    requestAnimationFrame(() => setAnnouncement(message));
  }, []);

  const generate = useCallback(
    async (event: EventDetails) => {
      const result = await createPlan(event, (input) => draft({ data: input }), todayIso());
      if (result.status === "ok") {
        setPlan(result.value);
        announce("Your plan is ready.");
        return null;
      }
      return result.message;
    },
    [draft, announce],
  );

  const askAssistant = useCallback(
    async (request: string) => {
      if (!plan) return;
      setIsProposing(true);
      setAssistantError(null);
      const result = await requestPlanChange(plan, request, (input) => propose({ data: input }), todayIso());
      setIsProposing(false);
      if (result.status === "error") {
        setAssistantError(result.message);
        announce(`Assistant error: ${result.message}`);
        return;
      }
      setPending(result.value);
      announce(
        result.value.validation.operations.length
          ? `Proposal ready with ${result.value.validation.operations.length} change(s) to review.`
          : "The assistant answered your question.",
      );
    },
    [plan, propose, announce],
  );

  const preview = useMemo(
    () => (plan && pending ? previewPendingChange(plan, pending, todayIso()) : null),
    [plan, pending],
  );

  const toggleOperation = useCallback((key: string) => {
    setPending((p) =>
      p ? { ...p, selected: p.selected.includes(key) ? p.selected.filter((k) => k !== key) : [...p.selected, key] } : p,
    );
  }, []);

  const acceptPending = useCallback(() => {
    if (!pending || !preview || pending.selected.length === 0) return;
    setPlan(commitChange(preview, pending.request, pending.proposal.summary, new Date().toISOString()));
    setPending(null);
    announce(`Plan updated: ${preview.report.changes.length} change(s) applied.`);
  }, [pending, preview, announce]);

  const discardPending = useCallback(() => {
    setPending(null);
    announce("Proposal discarded. Your plan is unchanged.");
  }, [announce]);

  const updatePlan = useCallback((updater: (p: EventPlan) => EventPlan, message?: string) => {
    setPlan((p) => (p ? updater(p) : p));
    if (message) announce(message);
  }, [announce]);

  const reset = useCallback(() => {
    clearPlan();
    setPlan(null);
    setPending(null);
  }, []);

  return {
    plan,
    hydrated,
    storageNotice,
    pending,
    preview,
    assistantError,
    isProposing,
    announcement,
    generate,
    askAssistant,
    toggleOperation,
    acceptPending,
    discardPending,
    updatePlan,
    reset,
  };
}

export type PlanWorkspace = ReturnType<typeof usePlanWorkspace>;
