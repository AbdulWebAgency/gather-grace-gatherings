import { AlertTriangle, CheckCircle2, Circle, CircleDashed, Clock, FileText, Lock, PauseCircle, Phone } from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const TONES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  info: "bg-secondary text-secondary-foreground border-secondary",
  success: "bg-success/12 text-success border-success/30",
  warning: "bg-warning/15 text-warning-foreground border-warning/40",
  danger: "bg-destructive/10 text-destructive border-destructive/30",
};

const STATUS_META: Record<string, { label: string; tone: Tone; icon: ComponentType<{ className?: string }> }> = {
  not_started: { label: "Not started", tone: "neutral", icon: Circle },
  in_progress: { label: "In progress", tone: "info", icon: CircleDashed },
  completed: { label: "Completed", tone: "success", icon: CheckCircle2 },
  blocked: { label: "Blocked", tone: "danger", icon: PauseCircle },
  estimate: { label: "Estimate", tone: "neutral", icon: CircleDashed },
  quoted: { label: "Quoted", tone: "info", icon: FileText },
  confirmed: { label: "Confirmed", tone: "success", icon: Lock },
  not_contacted: { label: "Not contacted", tone: "neutral", icon: Circle },
  contacted: { label: "Contacted", tone: "info", icon: Phone },
  quote_received: { label: "Quote received", tone: "info", icon: FileText },
  booked: { label: "Booked", tone: "success", icon: CheckCircle2 },
  overdue: { label: "Overdue", tone: "danger", icon: AlertTriangle },
  urgent: { label: "Due soon", tone: "warning", icon: Clock },
  upcoming: { label: "Upcoming", tone: "neutral", icon: Clock },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const meta = STATUS_META[status] ?? { label: status, tone: "neutral" as Tone, icon: Circle };
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap", TONES[meta.tone], className)}>
      <Icon className="size-3.5" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

export const statusLabel = (status: string) => STATUS_META[status]?.label ?? status;
