import { format, parseISO } from "date-fns";
import { formatMoney } from "@/domain/budget";
import type { EventPlan } from "@/domain/types";
import type { RecoveryState } from "@/state/planStorage";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Props {
  recovery: RecoveryState;
  dismissed: boolean;
  currentPlan: EventPlan | null;
  onDismiss: () => void;
  onRestore: () => void;
}

export function PlanRecoveryPanel({
  recovery,
  dismissed,
  currentPlan,
  onDismiss,
  onRestore,
}: Props) {
  if (dismissed || recovery.status === "missing") return null;

  if (recovery.status === "invalid") {
    return (
      <Alert role="status" className="mx-auto mt-4 max-w-7xl border-warning/50">
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>
            The saved recovery copy could not be validated. Your active plan has not been changed.
          </span>
          <Button type="button" variant="outline" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (recovery.status === "unavailable") {
    return (
      <Alert role="status" className="mx-auto mt-4 max-w-7xl border-warning/50">
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>Browser storage could not be read, so saved recovery data is unavailable.</span>
          <Button type="button" variant="outline" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const recovered = recovery.plan;
  return (
    <section
      aria-labelledby="recovery-heading"
      className="mx-auto mt-4 max-w-7xl rounded-xl border border-primary/40 bg-card p-4 shadow-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="recovery-heading" className="font-semibold">
            A saved plan may be recoverable
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This copy was kept after saved plan data failed validation. It has been validated before
            display; reviewing it will not change your active plan.
          </p>
          <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <Detail label="Event" value={recovered.event.name} />
            <Detail
              label="Date"
              value={`${format(parseISO(recovered.event.date), "d MMM yyyy")}${recovered.event.dateIsApproximate ? " (approximate)" : ""}`}
            />
            <Detail label="Guests" value={String(recovered.event.guestCount)} />
            <Detail
              label="Budget"
              value={formatMoney(recovered.event.budget, recovered.event.currency)}
            />
            <Detail
              label="Plan contents"
              value={`${recovered.budgetItems.length} budget items, ${recovered.tasks.length} tasks, ${recovered.vendors.length} vendor records`}
            />
          </dl>
          {currentPlan && (
            <p className="mt-3 text-sm text-warning-foreground">
              Restoring will replace “{currentPlan.event.name}” as the active plan. Its saved data
              will be retained as a backup when storage allows.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button">Review and restore</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Restore “{recovered.event.name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  {currentPlan
                    ? `This will replace “${currentPlan.event.name}” as the active plan. The current saved data will be preserved in a separate browser backup before restoration.`
                    : "This will make the validated saved plan active. Any incompatible saved data will be preserved in a separate browser backup before restoration."}
                  {" You can cancel without changing either plan."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onRestore}>Restore saved plan</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button type="button" variant="outline" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="font-medium">{label}:</dt>
      <dd className="text-muted-foreground">{value}</dd>
    </div>
  );
}
