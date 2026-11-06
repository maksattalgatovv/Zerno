"use client";

import { AlertTriangle, CircleHelp, FlaskConical, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api/client";
import type { Health } from "@/lib/api/types";
import type { TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useT } from "@/providers/i18n-provider";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[15px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, hint, actions, className, children }: {
  title?: string; hint?: string; actions?: ReactNode; className?: string; children: ReactNode;
}) {
  return (
    <section className={cn("rounded-lg border bg-card p-5", className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-1.5 text-base font-semibold">
            {title}
            {hint && <InfoTip text={hint} />}
          </h2>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={text} className="text-muted-foreground hover:text-foreground">
          <CircleHelp className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 font-normal">{text}</TooltipContent>
    </Tooltip>
  );
}

export function StatCard({ label, value, hint, icon: Icon, tone }: {
  label: string; value: ReactNode; hint?: string; icon: LucideIcon; tone?: "warn" | "danger";
}) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          {label}
          {hint && <InfoTip text={hint} />}
        </span>
        <Icon className={cn("size-5", tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-brand-2")} />
      </div>
      <div className="mt-2 text-[28px] font-semibold tracking-tight">{value}</div>
    </div>
  );
}

const HEALTH_STYLES: Record<Health, string> = {
  healthy: "bg-good-tint text-brand",
  attention: "bg-warn-tint text-warn-ink",
  critical: "bg-danger-tint text-danger-ink",
  unknown: "bg-muted text-muted-foreground",
};

const HEALTH_DOTS: Record<Health, string> = {
  healthy: "bg-brand-2",
  attention: "bg-warn",
  critical: "bg-danger",
  unknown: "bg-muted-foreground",
};

export function HealthBadge({ status, className }: { status: Health; className?: string }) {
  const { t } = useT();
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm font-medium whitespace-nowrap", HEALTH_STYLES[status], className)}>
      <span className={cn("size-2 rounded-full", HEALTH_DOTS[status])} aria-hidden />
      {t(`health.${status}` as TKey)}
    </span>
  );
}

/** Marks anything that didn't come from a real sensor, drone or trained model. */
export function DemoBadge({ label, tip, className }: { label?: string; tip?: string; className?: string }) {
  const { t } = useT();
  const badge = (
    <span className={cn("inline-flex items-center gap-1 rounded border border-warn/40 bg-warn-tint px-1.5 py-0.5 text-xs font-medium text-warn-ink whitespace-nowrap", className)}>
      <FlaskConical className="size-3" aria-hidden />
      {label ?? t("common.demo")}
    </span>
  );
  if (!tip) return badge;
  return (
    <Tooltip>
      <TooltipTrigger asChild><span tabIndex={0}>{badge}</span></TooltipTrigger>
      <TooltipContent className="max-w-72">{tip}</TooltipContent>
    </Tooltip>
  );
}

export function LoadingState({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-3" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
    </div>
  );
}

export function errorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.code !== "network" && error.code !== "unknown") return error.message;
  return fallback;
}

export function ErrorState({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  const { t } = useT();
  return (
    <div className="flex flex-col items-center rounded-lg border bg-card px-6 py-12 text-center">
      <AlertTriangle className="size-8 text-danger" />
      <h2 className="mt-3 text-lg font-semibold">{t("state.errorTitle")}</h2>
      <p className="mt-1 max-w-md text-muted-foreground">{errorText(error, t("state.errorBody"))}</p>
      {onRetry && <Button variant="outline" className="mt-4" onClick={onRetry}>{t("common.retry")}</Button>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed bg-card px-6 py-12 text-center">
      <Icon className="size-8 text-brand-2" />
      <h2 className="mt-3 text-lg font-semibold">{title}</h2>
      {body && <p className="mt-1 max-w-md text-muted-foreground">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
