"use client";

import {
  ActivitySquare, AlertTriangle, Bot, CheckCircle2, Cloud, CloudRain, CloudSun, Droplets, Leaf, Plane, Ruler, Sprout, Sun,
  Wind, X,
} from "lucide-react";
import Link from "next/link";

import { FarmGate } from "@/components/shared/farm-gate";
import {
  DemoBadge, EmptyState, ErrorState, HealthBadge, InfoTip, LoadingState, PageHeader, Panel, StatCard,
} from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { useDashboard } from "@/lib/api/hooks";
import type { Dashboard, Farm } from "@/lib/api/types";
import { useFormat } from "@/lib/hooks/use-format";
import type { TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/providers/i18n-provider";

const WEATHER_ICONS: Record<string, typeof Sun> = {
  sunny: Sun, partly_cloudy: CloudSun, cloudy: Cloud, light_rain: CloudRain,
};

const HEALTH_BAR: Record<string, string> = {
  healthy: "bg-brand-2", attention: "bg-warn", critical: "bg-danger", unknown: "bg-muted-foreground/40",
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
    <div className="mb-6 flex items-start justify-between gap-4 rounded-lg bg-brand p-5 text-white">
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

function WeatherPanel({ weather }: { weather: Dashboard["weather"] }) {
  const { t } = useT();
  const format = useFormat();
  const Icon = WEATHER_ICONS[weather.condition] ?? Cloud;
  return (
    <Panel title={t("dash.weather")} actions={<DemoBadge tip={t("dash.weatherDemo")} />}>
      <div className="flex items-center gap-4">
        <Icon className="size-11 text-brand-2" />
        <div>
          <p className="text-3xl font-semibold tracking-tight">{format.temp(weather.temperature_c)}</p>
          <p className="text-muted-foreground">{t(`weather.${weather.condition}` as TKey)}</p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 border-t pt-4 text-sm">
        <div><dt className="flex items-center gap-1 text-muted-foreground"><Wind className="size-3.5" />{t("dash.wind")}</dt><dd className="font-medium">{format.wind(weather.wind_kmh)}</dd></div>
        <div><dt className="flex items-center gap-1 text-muted-foreground"><Droplets className="size-3.5" />{t("dash.humidity")}</dt><dd className="font-medium">{weather.humidity_pct}%</dd></div>
        <div><dt className="flex items-center gap-1 text-muted-foreground"><CloudRain className="size-3.5" />{t("dash.rain")}</dt><dd className="font-medium">{weather.rain_next_3d_mm} {t("unit.mm")}</dd></div>
      </dl>
    </Panel>
  );
}

function HealthPanel({ data }: { data: Dashboard }) {
  const { t } = useT();
  const format = useFormat();
  const total = data.stats.total_area || 1;
  const slices = data.health.filter((slice) => slice.area > 0);
  return (
    <Panel title={t("dash.health")} hint={t("dash.healthHint")}>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-sm" role="img" aria-label={t("dash.health")}>
        {slices.map((slice) => (
          <div key={slice.status} className={HEALTH_BAR[slice.status]} style={{ width: `${(slice.area / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-4 space-y-2.5">
        {slices.map((slice) => (
          <li key={slice.status} className="flex items-center justify-between gap-3">
            <HealthBadge status={slice.status} />
            <span className="text-sm text-muted-foreground">
              {format.area(slice.area)} · {t("dash.fieldCount", { count: slice.fields })}
            </span>
          </li>
        ))}
      </ul>
      {slices.length === 0 && <p className="text-muted-foreground">{t("dash.noHealth")}</p>}
    </Panel>
  );
}

function LatestMission({ mission }: { mission: Dashboard["latest_mission"] }) {
  const { t } = useT();
  const format = useFormat();
  return (
    <Panel title={t("dash.latestMission")} actions={mission?.is_simulated ? <DemoBadge label={t("common.simulated")} tip={t("drone.simTip")} /> : undefined}>
      {mission ? (
        <>
          <p className="font-medium">{mission.field_name}</p>
          <p className="text-sm text-muted-foreground">{t(`mission.${mission.status}` as TKey)} · {format.dateTime(mission.completed_at ?? mission.created_at)}</p>
          <dl className="mt-4 grid grid-cols-3 gap-2 border-t pt-4 text-sm">
            <div><dt className="text-muted-foreground">{t("drone.distance")}</dt><dd className="font-medium">{format.number(mission.distance_m / 1000, 1)} {t("unit.km")}</dd></div>
            <div><dt className="text-muted-foreground">{t("drone.altitude")}</dt><dd className="font-medium">{mission.altitude_m} {t("unit.m")}</dd></div>
            <div><dt className="text-muted-foreground">{t("drone.photos")}</dt><dd className="font-medium">{mission.photos_taken}</dd></div>
          </dl>
          <Button asChild variant="outline" className="mt-4 w-full"><Link href={`/drone?mission=${mission.id}`}>{t("dash.openMission")}</Link></Button>
        </>
      ) : (
        <div>
          <p className="text-muted-foreground">{t("dash.noMission")}</p>
          <Button asChild variant="outline" className="mt-4 w-full"><Link href="/drone">{t("drone.plan")}</Link></Button>
        </div>
      )}
    </Panel>
  );
}

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
              <Link href={alert.link} className="-mx-2 flex items-start gap-3 rounded px-2 py-3 hover:bg-muted">
                <AlertTriangle className={cn("mt-0.5 size-5 shrink-0", alert.severity === "critical" ? "text-danger" : "text-warn")} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{alert.title}</span>
                  <span className="block text-sm text-muted-foreground">{alert.message} · {format.ago(alert.created_at)}</span>
                </span>
                <span className={cn("rounded px-2 py-0.5 text-sm font-medium", alert.severity === "critical" ? "bg-danger-tint text-danger-ink" : "bg-warn-tint text-warn-ink")}>
                  {t(`severity.${alert.severity}` as TKey)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

const ACTIVITY_ICONS = { mission: Plane, analysis: Leaf, decision: CheckCircle2, field: Sprout };

function Activity({ data }: { data: Dashboard }) {
  const { t } = useT();
  const format = useFormat();
  return (
    <Panel title={t("dash.activity")}>
      <ul className="space-y-1">
        {data.activity.map((item) => {
          const Icon = ACTIVITY_ICONS[item.kind];
          return (
            <li key={item.id}>
              <Link href={item.link} className="-mx-2 flex items-start gap-3 rounded px-2 py-2 hover:bg-muted">
                <Icon className="mt-0.5 size-4 shrink-0 text-brand-2" />
                <span className="min-w-0 flex-1 text-sm">{item.text}</span>
                <span className="shrink-0 text-sm text-muted-foreground">{format.ago(item.at)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function Content({ farm }: { farm: Farm }) {
  const { t } = useT();
  const format = useFormat();
  const query = useDashboard(farm.id);
  if (query.isLoading) return <LoadingState rows={6} />;
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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("dash.totalArea")} value={format.area(data.stats.total_area)} icon={Ruler} />
        <StatCard label={t("dash.fields")} value={data.stats.field_count} icon={Sprout} />
        <StatCard label={t("dash.avgNdvi")} value={format.ndvi(data.stats.avg_ndvi)} icon={ActivitySquare} hint={t("common.ndviHint")} />
        <StatCard label={t("dash.openIssues")} value={data.stats.open_anomalies} icon={AlertTriangle} tone={data.stats.open_anomalies ? "warn" : undefined} hint={t("dash.alertsHint")} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <WeatherPanel weather={data.weather} />
        <HealthPanel data={data} />
        <LatestMission mission={data.latest_mission} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Alerts data={data} />
        <Activity data={data} />
      </div>
      <Link href="/assistant" className="mt-4 flex items-center gap-3 rounded-lg border bg-card p-4 hover:bg-muted">
        <Bot className="size-5 text-brand-2" />
        <span className="flex-1">{t("dash.askAssistant")}</span>
        <InfoTip text={t("dash.assistantHint")} />
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
      <PageHeader title={t("dash.greeting", { name: user?.name.split(" ")[0] ?? "" })} description={t("dash.subtitle")} />
      <FarmGate>{(farm) => <Content farm={farm} />}</FarmGate>
    </>
  );
}
