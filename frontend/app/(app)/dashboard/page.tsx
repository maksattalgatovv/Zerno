"use client";

import {
  AlertTriangle, Bot, CheckCircle2, ChevronRight, Cloud, CloudRain, CloudSun, Droplets, PawPrint, Plane, Sprout, Sun, Wind, X,
} from "lucide-react";
import Link from "next/link";

import { FarmGate } from "@/components/shared/farm-gate";
import { DemoBadge, EmptyState, ErrorState, HealthBadge, LoadingState, PageHeader, Panel } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { useDashboard, useFields } from "@/lib/api/hooks";
import type { Dashboard, Farm } from "@/lib/api/types";
import { useFormat } from "@/lib/hooks/use-format";
import type { TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/providers/i18n-provider";

const WEATHER_ICONS: Record<string, typeof Sun> = {
  sunny: Sun, partly_cloudy: CloudSun, cloudy: Cloud, light_rain: CloudRain,
};

function Onboarding() {
  const { t } = useT();
  const { user, update } = useAuth();
  if (!user || user.onboarded) return null;
  const steps: { key: TKey; href: string }[] = [
    { key: "onboarding.step1", href: "/map" },
    { key: "onboarding.step2", href: "/drone" },
    { key: "onboarding.step3", href: "/ai-doctor" },
  ];
  return (
    <div className="mb-4 flex items-start justify-between gap-4 rounded-lg bg-brand p-4 text-white">
      <div>
        <h2 className="font-semibold">{t("onboarding.title")}</h2>
        <ol className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
          {steps.map((step, index) => (
            <li key={step.key}>
              <Link href={step.href} className="text-white/85 underline-offset-4 hover:text-white hover:underline">
                <span className="mr-1 font-medium text-lime">{index + 1}.</span>{t(step.key)}
              </Link>
            </li>
          ))}
        </ol>
      </div>
      <Button variant="ghost" size="icon-sm" aria-label={t("common.close")} className="text-white hover:bg-white/10 hover:text-white"
        onClick={() => void update({ onboarded: true })}>
        <X className="size-4" />
      </Button>
    </div>
  );
}

/** The first thing a farmer needs: what to look at today. */
function Alerts({ data }: { data: Dashboard }) {
  const { t } = useT();
  const format = useFormat();
  return (
    <Panel title={t("dash.alerts")} hint={t("dash.alertsHint")}>
      {data.alerts.length === 0 ? (
        <p className="flex items-center gap-2 text-muted-foreground"><CheckCircle2 className="size-5 text-brand-2" />{t("dash.noAlerts")}</p>
      ) : (
        <ul className="divide-y">
          {data.alerts.map((alert) => (
            <li key={alert.id}>
              <Link href={alert.link} className="-mx-2 flex items-center gap-3 rounded px-2 py-3 hover:bg-muted">
                <AlertTriangle className={cn("size-5 shrink-0", alert.severity === "critical" ? "text-danger" : "text-warn")} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{alert.title}</span>
                  <span className="block text-sm text-muted-foreground">{alert.message} · {format.ago(alert.created_at)}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function FieldsPanel({ farm }: { farm: Farm }) {
  const { t } = useT();
  const format = useFormat();
  const { data = [] } = useFields(farm.id);
  return (
    <Panel title={t("dash.fieldsTitle")} actions={<Link href="/fields" className="text-sm text-brand-2 hover:underline">{t("dash.allFields")}</Link>}>
      <ul className="divide-y">
        {data.map((field) => (
          <li key={field.id}>
            <Link href={`/fields/${field.id}`} className="-mx-2 flex flex-wrap items-center justify-between gap-2 rounded px-2 py-3 hover:bg-muted">
              <span className="min-w-0">
                <span className="block font-medium">{field.name}</span>
                <span className="block text-sm text-muted-foreground">{field.crop_label} · {format.area(field.area)}</span>
              </span>
              <HealthBadge status={field.health_status} />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function WeatherPanel({ weather }: { weather: Dashboard["weather"] }) {
  const { t } = useT();
  const format = useFormat();
  const Icon = WEATHER_ICONS[weather.condition] ?? Cloud;
  return (
    <Panel title={t("dash.weather")} actions={<DemoBadge tip={t("dash.weatherDemo")} />}>
      <div className="flex items-center gap-3">
        <Icon className="size-9 text-brand-2" />
        <p><span className="text-2xl font-semibold tracking-tight">{format.temp(weather.temperature_c)}</span> <span className="text-muted-foreground">{t(`weather.${weather.condition}` as TKey)}</span></p>
      </div>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="flex items-center gap-1"><Wind className="size-3.5" />{format.wind(weather.wind_kmh)}</span>
        <span className="flex items-center gap-1"><Droplets className="size-3.5" />{weather.humidity_pct}%</span>
        <span className="flex items-center gap-1"><CloudRain className="size-3.5" />{t("dash.rain")}: {weather.rain_next_3d_mm} {t("unit.mm")}</span>
      </p>
    </Panel>
  );
}

function LatestMission({ mission }: { mission: Dashboard["latest_mission"] }) {
  const { t } = useT();
  const format = useFormat();
  return (
    <Panel title={t("dash.latestMission")} actions={mission?.is_simulated ? <DemoBadge label={t("common.simulated")} tip={t("drone.simTip")} /> : undefined}>
      {mission ? (
        <Link href={`/drone?mission=${mission.id}`} className="-mx-2 flex items-center gap-3 rounded px-2 py-1 hover:bg-muted">
          <Plane className="size-5 shrink-0 text-brand-2" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{mission.field_name}</span>
            <span className="block text-sm text-muted-foreground">{t(`mission.${mission.status}` as TKey)} · {format.dateTime(mission.completed_at ?? mission.created_at)}</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      ) : (
        <>
          <p className="text-muted-foreground">{t("dash.noMission")}</p>
          <Button asChild variant="outline" className="mt-3 w-full"><Link href="/drone">{t("drone.plan")}</Link></Button>
        </>
      )}
    </Panel>
  );
}

function Content({ farm }: { farm: Farm }) {
  const { t } = useT();
  const format = useFormat();
  const query = useDashboard(farm.id);
  if (query.isLoading) return <LoadingState rows={3} />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const data = query.data;

  if (data.stats.field_count === 0) {
    return (
      <EmptyState icon={Sprout} title={t("fields.emptyTitle")} body={t("fields.emptyBody")}
        action={<Button asChild><Link href="/fields">{t("fields.add")}</Link></Button>} />
    );
  }

  return (
    <>
      <p className="mb-4 -mt-3 text-muted-foreground">{format.area(data.stats.total_area)} · {t("dash.fieldCount", { count: data.stats.field_count })}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Alerts data={data} />
        <FieldsPanel farm={farm} />
        <WeatherPanel weather={data.weather} />
        <LatestMission mission={data.latest_mission} />
      </div>
      <Link href="/livestock" className="mt-4 flex items-center gap-3 rounded-lg border bg-card p-4 hover:bg-muted">
        <PawPrint className="size-5 shrink-0 text-brand-2" />
        <span className="flex-1">
          {data.stats.livestock_total > 0 ? (
            <><span className="font-medium">{t("livestock.dashTitle")}:</span> {format.number(data.stats.livestock_total)} {t("livestock.unit")}</>
          ) : t("livestock.dashEmpty")}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
      <Link href="/assistant" className="mt-4 flex items-center gap-3 rounded-lg border bg-card p-4 hover:bg-muted">
        <Bot className="size-5 shrink-0 text-brand-2" />
        <span className="flex-1">{t("dash.askAssistant")}</span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </>
  );
}

export default function DashboardPage() {
  const { t } = useT();
  const { user } = useAuth();
  return (
    <>
      <Onboarding />
      <PageHeader title={t("dash.greeting", { name: user?.name.split(" ")[0] ?? "" })} />
      <FarmGate>{(farm) => <Content farm={farm} />}</FarmGate>
    </>
  );
}
