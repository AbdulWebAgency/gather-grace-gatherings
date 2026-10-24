import { useEffect, useRef, useState } from "react";
import { CalendarDays, HardDrive, MapPin, RotateCcw, Users } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatMoney } from "@/domain/budget";
import type { EventPlan } from "@/domain/types";
import type { PlanWorkspace } from "@/state/usePlanWorkspace";
import { OverviewPanel } from "./OverviewPanel";
import { BudgetPanel } from "./BudgetPanel";
import { TimelinePanel } from "./TimelinePanel";
import { VendorPanel } from "./VendorPanel";
import { HistoryPanel } from "./HistoryPanel";
import { AssistantPanel } from "./AssistantPanel";
import { ChangeReview } from "./ChangeReview";

const CATEGORY_LABEL = { wedding: "Wedding", birthday: "Birthday", community: "Community event" } as const;

export function Workspace({ ws, plan }: { ws: PlanWorkspace; plan: EventPlan }) {
  const [tab, setTab] = useState("overview");
  const reviewRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (ws.pending) reviewRef.current?.focus();
  }, [ws.pending]);

  const { event } = plan;
  return (
    <div className="min-h-screen">
      <header className="border-b bg-card/70">
        <div className="mx-auto max-w-7xl px-4 py-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">{CATEGORY_LABEL[event.category]} · Revision {plan.revision}</p>
            <h1 className="mt-1 text-3xl font-semibold">{event.name}</h1>
            <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              <li className="flex items-center gap-1.5"><CalendarDays className="size-4" aria-hidden="true" />
                {format(parseISO(event.date), "EEE d MMM yyyy")}{event.dateIsApproximate && " (approx.)"}</li>
              {event.location && <li className="flex items-center gap-1.5"><MapPin className="size-4" aria-hidden="true" />{event.location}</li>}
              <li className="flex items-center gap-1.5"><Users className="size-4" aria-hidden="true" />{event.guestCount} guests</li>
              <li>Budget {formatMoney(event.budget, event.currency)}</li>
            </ul>
          </div>
          <div className="flex flex-col items-end gap-2">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><HardDrive className="size-3.5" aria-hidden="true" />Saved in this browser only — not synced to an account</p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm"><RotateCcw aria-hidden="true" />Start a new event</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this plan and start over?</AlertDialogTitle>
                  <AlertDialogDescription>The current plan, quotes and history will be removed from this browser. This cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep plan</AlertDialogCancel>
                  <AlertDialogAction onClick={ws.reset}>Delete and start over</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
        {ws.storageNotice && <p role="status" className="mx-auto max-w-7xl px-4 pb-3 text-sm text-warning-foreground">{ws.storageNotice}</p>}
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <main className="min-w-0 space-y-6">
          {ws.pending && ws.preview && (
            <ChangeReview
              headingRef={reviewRef}
              plan={plan}
              pending={ws.pending}
              preview={ws.preview}
              onToggle={ws.toggleOperation}
              onAccept={ws.acceptPending}
              onDiscard={ws.discardPending}
            />
          )}
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex w-full flex-wrap h-auto justify-start">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="budget">Budget</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="vendors">Vendors</TabsTrigger>
              <TabsTrigger value="history">Changes</TabsTrigger>
            </TabsList>
            <TabsContent value="overview"><OverviewPanel plan={plan} onNavigate={setTab} /></TabsContent>
            <TabsContent value="budget"><BudgetPanel plan={plan} onUpdate={ws.updatePlan} /></TabsContent>
            <TabsContent value="timeline"><TimelinePanel plan={plan} onUpdate={ws.updatePlan} /></TabsContent>
            <TabsContent value="vendors"><VendorPanel plan={plan} onUpdate={ws.updatePlan} /></TabsContent>
            <TabsContent value="history"><HistoryPanel plan={plan} /></TabsContent>
          </Tabs>
        </main>
        <aside className="lg:sticky lg:top-4 lg:self-start" aria-label="Planning assistant">
          <AssistantPanel ws={ws} />
        </aside>
      </div>

      <div aria-live="polite" role="status" className="sr-only">{ws.announcement}</div>
    </div>
  );
}
