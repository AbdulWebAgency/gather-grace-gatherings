import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Onboarding } from "@/components/onboarding/Onboarding";
import { Workspace } from "@/components/workspace/Workspace";
import { usePlanWorkspace } from "@/state/usePlanWorkspace";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Event Planning Assistant — budgets, timelines & vendors" },
      { name: "description", content: "Plan weddings, birthdays and community events: AI-assisted plans with validated budgets, deadlines and vendor tracking you can revise in plain language." },
      { property: "og:title", content: "Event Planning Assistant" },
      { property: "og:description", content: "AI-assisted event plans with validated budgets, timelines and vendor checklists." },
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
        <Onboarding onGenerate={ws.generate} />
        <div aria-live="polite" role="status" className="sr-only">{ws.announcement}</div>
      </>
    );
  }
  return <Workspace ws={ws} plan={ws.plan} />;
}
