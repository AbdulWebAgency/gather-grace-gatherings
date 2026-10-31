import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Onboarding } from "@/components/onboarding/Onboarding";
import { Workspace } from "@/components/workspace/Workspace";
import { usePlanWorkspace } from "@/state/usePlanWorkspace";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EventPilot — Event Planning & Management" },
      {
        name: "description",
        content:
          "Plan weddings, birthdays, and community events with EventPilot. Create AI-assisted plans with budgets, timelines, and vendor tracking you can revise in plain language.",
      },
      { property: "og:title", content: "EventPilot" },
      {
        property: "og:description",
        content:
          "Plan events confidently with AI-assisted budgets, timelines, and vendor checklists.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const ws = usePlanWorkspace();
  if (!ws.hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Loading your plan…</span>
      </div>
    );
  }
  if (!ws.plan) {
    return (
      <>
        <Onboarding ws={ws} />
        <div aria-live="polite" role="status" className="sr-only">
          {ws.announcement}
        </div>
      </>
    );
  }
  return <Workspace ws={ws} plan={ws.plan} />;
}
