import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { commitChange } from "@/domain/planChange";
import { toIsoDate } from "@/domain/timeline";
import type { EventDetails, EventPlan } from "@/domain/types";
import { generatePlanDraft, proposePlanChange } from "@/lib/planning.functions";
import {
  clearPlan,
  loadPlan,
  restoreRecoveryPlan,
  savePlan,
  type RecoveryState,
} from "./planStorage";
import {
  appliedChangeSummary,
  createPlan,
  createRequestSequence,
  pendingChangeIsStale,
  previewPendingChange,
  requestPlanChange,
  validatePlanUpdate,
  type PendingChange,
} from "./planWorkflow";

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function usePlanWorkspace() {
  const [plan, setPlan] = useState<EventPlan | null>(null);
  const planRef = useRef<EventPlan | null>(null);
  const applyPlanState = useCallback((next: EventPlan | null) => {
    planRef.current = next;
    setPlan(next);
  }, []);
  const [hydrated, setHydrated] = useState(false);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<RecoveryState>({ status: "missing" });
  const [recoveryDismissed, setRecoveryDismissed] = useState(false);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [isProposing, setIsProposing] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const assistantRequestSequence = useRef(createRequestSequence());
  const assistantRequestInFlight = useRef(false);

  const propose = useServerFn(proposePlanChange);
  const draft = useServerFn(generatePlanDraft);

  useEffect(() => {
    const result = loadPlan();
    const { plan: loaded, discarded } = result;
    setRecovery(result.recovery);
    planRef.current = loaded;
    setPlan(loaded);
    if (discarded)
      setStorageNotice(
        result.recoveryAvailable
          ? "A saved plan could not be read. A copy was retained in browser storage for recovery."
          : "A saved plan could not be read. The original data remains in browser storage because a recovery copy could not be made.",
      );
    else if (result.unavailable)
      setStorageNotice(
        "Browser storage is unavailable. This plan will not persist after you close the tab.",
      );
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !plan) return;
    if (!savePlan(plan))
      setStorageNotice(
        "Your browser blocked local saving. Changes will be lost when you close this tab.",
      );
    else
      setStorageNotice((current) =>
        current?.startsWith("Your browser blocked local saving") ? null : current,
      );
  }, [plan, hydrated]);

  const announce = useCallback((message: string) => {
    setAnnouncement("");
    requestAnimationFrame(() => setAnnouncement(message));
  }, []);

  const invalidateAssistantRequest = useCallback(() => {
    assistantRequestSequence.current.invalidate();
    assistantRequestInFlight.current = false;
    setIsProposing(false);
  }, []);

  const generate = useCallback(
    async (event: EventDetails) => {
      const result = await createPlan(event, (input) => draft({ data: input }), todayIso());
      if (result.status === "ok") {
        invalidateAssistantRequest();
        applyPlanState(result.value);
        announce("Your plan is ready.");
        return null;
      }
      return result.message;
    },
    [draft, announce, invalidateAssistantRequest, applyPlanState],
  );

  const askAssistant = useCallback(
    async (request: string) => {
      if (!plan || assistantRequestInFlight.current) return;
      const requestVersion = assistantRequestSequence.current.begin();
      assistantRequestInFlight.current = true;
      setIsProposing(true);
      setAssistantError(null);
      let result: Awaited<ReturnType<typeof requestPlanChange>>;
      try {
        result = await requestPlanChange(
          plan,
          request,
          (input) => propose({ data: input }),
          todayIso(),
        );
      } catch {
        result = {
          status: "error",
          message: "Could not complete the planning request. Your plan has not been changed.",
        };
      } finally {
        if (assistantRequestSequence.current.isCurrent(requestVersion)) {
          assistantRequestInFlight.current = false;
          setIsProposing(false);
        }
      }
      if (!assistantRequestSequence.current.isCurrent(requestVersion)) return;
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
      p
        ? {
            ...p,
            selected: p.selected.includes(key)
              ? p.selected.filter((k) => k !== key)
              : [...p.selected, key],
          }
        : p,
    );
  }, []);

  const acceptPending = useCallback(() => {
    if (
      !pending ||
      !preview ||
      pending.selected.length === 0 ||
      !plan ||
      pendingChangeIsStale(plan, pending)
    )
      return;
    const appliedSummary = appliedChangeSummary(preview);
    const committed = validatePlanUpdate(plan, () =>
      commitChange(preview, pending.request, appliedSummary, new Date().toISOString()),
    );
    if (committed.status === "error") {
      announce(committed.message);
      return;
    }
    invalidateAssistantRequest();
    applyPlanState(committed.value);
    setPending(null);
    const rejectedCount = pending.validation.rejected.length;
    announce(
      `Plan updated: ${preview.report.changes.length} accepted change(s) applied.${rejectedCount ? ` ${rejectedCount} rejected change(s) were not applied.` : ""}`,
    );
  }, [pending, preview, plan, announce, invalidateAssistantRequest, applyPlanState]);

  const dismissRecovery = useCallback(() => setRecoveryDismissed(true), []);

  const restoreRecovery = useCallback(() => {
    const result = restoreRecoveryPlan(planRef.current);
    if (!result.ok) {
      const messages = {
        missing: "The saved recovery copy is no longer available.",
        invalid: "The recovery copy could not be validated. Your active plan was left unchanged.",
        unavailable: "Browser storage is unavailable. Your active plan was left unchanged.",
        save_failed: "The recovered plan could not be saved. Your active plan was left unchanged.",
        preserve_failed:
          "The current saved data could not be safely preserved. Your active plan was left unchanged.",
      } as const;
      setStorageNotice(messages[result.reason]);
      setRecovery(loadPlan().recovery);
      announce(messages[result.reason]);
      return false;
    }
    invalidateAssistantRequest();
    applyPlanState(result.plan);
    setRecovery(
      result.recoveryCopyRetained
        ? { status: "available", plan: result.plan }
        : { status: "missing" },
    );
    setRecoveryDismissed(result.recoveryCopyRetained);
    setStorageNotice(
      result.recoveryCopyRetained
        ? "Plan restored, but the redundant recovery copy could not be removed."
        : null,
    );
    announce(
      "The saved plan was restored. The previously active data was preserved in browser storage.",
    );
    return true;
  }, [announce, invalidateAssistantRequest, applyPlanState]);
  const discardPending = useCallback(() => {
    setPending(null);
    announce("Proposal discarded. Your plan is unchanged.");
  }, [announce]);

  const updatePlan = useCallback(
    (updater: (p: EventPlan) => EventPlan, message?: string) => {
      const current = planRef.current;
      if (!current) return;
      const result = validatePlanUpdate(current, updater);
      if (result.status === "error") {
        announce(result.message);
        return;
      }
      invalidateAssistantRequest();
      applyPlanState(result.value);
      if (message) announce(message);
    },
    [announce, invalidateAssistantRequest, applyPlanState],
  );

  const reset = useCallback(() => {
    if (!clearPlan()) {
      const message =
        "Your plan could not be deleted because browser storage is unavailable. The current plan was kept.";
      setStorageNotice(message);
      announce(message);
      return;
    }
    invalidateAssistantRequest();
    applyPlanState(null);
    setPending(null);
    setRecoveryDismissed(false);
  }, [invalidateAssistantRequest, applyPlanState, announce]);

  return {
    plan,
    hydrated,
    storageNotice,
    recovery,
    recoveryDismissed,
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
    dismissRecovery,
    restoreRecovery,
    updatePlan,
    reset,
  };
}

export type PlanWorkspace = ReturnType<typeof usePlanWorkspace>;
