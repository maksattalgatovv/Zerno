"use client";

import { BarChart3 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import {
  CountBars, FieldComparisonChart, HealthDonut, NdviHeatmap, NdviTrendChart,
} from "@/components/analytics/charts";
import { FarmGate } from "@/components/shared/farm-gate";
import { DemoBadge, EmptyState, ErrorState, LoadingState, PageHeader, Panel } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnalytics, useFields, useNdviGrid } from "@/lib/api/hooks";
import type { Farm } from "@/lib/api/types";
import { useFormat } from "@/lib/hooks/use-format";
import type { TKey } from "@/lib/i18n";
import { useT } from "@/providers/i18n-provider";

function NdviMapPanel({ farm }: { farm: Farm }) {
  const { t } = useT();
  const format = useFormat();
  const fields = useFields(farm.id);
  const [selected, setSelected] = useState<string>();
  const fieldId = selected ?? fields.data?.[fields.data.length - 1]?.id;
  const grid = useNdviGrid(fieldId);

  return (
    <Panel title={t("analytics.ndviMap")} hint={t("analytics.ndviMapHint")} actions={<DemoBadge label={t("analytics.sampleData")} tip={t("analytics.sampleTip")} />}>
      <Select value={fieldId} onValueChange={setSelected}>
        <SelectTrigger className="mb-4 w-full sm:w-64" aria-label={t("drone.field")}><SelectValue /></SelectTrigger>
        <SelectContent>{fields.data?.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
      </Select>
      {grid.isLoading || !grid.data ? <Skeleton className="aspect-[4/3]" /> : (
        <>
          <NdviHeatmap grid={grid.data} />
          <dl className="mt-4 grid grid-cols-3 gap-2 border-t pt-3">
            <div><dt className="text-sm text-muted-foreground">{t("analytics.average")}</dt><dd className="font-semibold">{format.ndvi(grid.data.mean)}</dd></div>
            <div><dt className="text-sm text-muted-foreground">{t("analytics.lowest")}</dt><dd className="font-semibold">{format.ndvi(grid.data.minimum)}</dd></div>
            <div><dt className="text-sm text-muted-foreground">{t("analytics.highest")}</dt><dd className="font-semibold">{format.ndvi(grid.data.maximum)}</dd></div>
          </dl>
        </>
      )}
    </Panel>
  );
}

function Content({ farm }: { farm: Farm }) {
  const { t } = useT();
  const format = useFormat();
  const query = useAnalytics(farm.id);
  if (query.isLoading) return <LoadingState rows={6} />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const data = query.data;

  if (data.trend.length === 0) {
    return <EmptyState icon={BarChart3} title={t("analytics.emptyTitle")} body={t("analytics.emptyBody")}
      action={<Button asChild><Link href="/drone">{t("drone.plan")}</Link></Button>} />;
  }

  const totalArea = data.health.reduce((sum, slice) => sum + slice.area, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title={t("analytics.trend")} hint={t("common.ndviHint")} className="lg:col-span-2"
        actions={<DemoBadge label={t("analytics.sampleData")} tip={t("analytics.sampleTip")} />}>
        <NdviTrendChart series={data.series} data={data.trend} />
      </Panel>
      <NdviMapPanel farm={farm} />
      <Panel title={t("analytics.comparison")} hint={t("analytics.comparisonHint")}>
        <FieldComparisonChart data={data.fields} labels={{ healthy: t("health.healthy"), attention: t("health.attention"), critical: t("health.critical") }} />
      </Panel>
      <details className="rounded-lg border bg-card p-5 lg:col-span-2">
        <summary className="cursor-pointer font-medium">{t("common.more")}</summary>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
        <Panel title={t("analytics.distribution")} hint={t("analytics.distributionHint")}>
          <HealthDonut data={data.health} total={format.area(totalArea)} />
        </Panel>
        <Panel title={t("analytics.anomalies")} hint={t("dash.alertsHint")}>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <div><p className="text-sm text-muted-foreground">{t("analytics.open")}</p><p className="text-2xl font-semibold">{data.anomalies_open}</p></div>
            <div><p className="text-sm text-muted-foreground">{t("analytics.resolved")}</p><p className="text-2xl font-semibold">{data.anomalies_resolved}</p></div>
          </div>
          <CountBars data={data.anomalies_by_type} />
        </Panel>
          </div>
          <Panel title={t("analytics.history")}>
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-card text-sm text-muted-foreground">
              <tr className="border-b"><th className="py-2 font-medium">{t("drone.date")}</th><th className="font-medium">{t("drone.field")}</th><th className="font-medium">NDVI</th><th className="font-medium">{t("analytics.source")}</th></tr>
            </thead>
            <tbody>
              {data.history.map((event) => (
                <tr key={event.id} className="border-b last:border-0">
                  <td className="py-2">{format.date(event.date)}</td>
                  <td>{event.field_name}</td>
                  <td>{format.ndvi(event.ndvi)}</td>
                  <td className="text-sm text-muted-foreground">{t(`analytics.source.${event.source}` as TKey)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
        </div>
      </details>
    </div>
  );
}

export default function AnalyticsPage() {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t("nav.analytics")} description={t("analytics.subtitle")} />
      <FarmGate>{(farm) => <Content farm={farm} />}</FarmGate>
    </>
  );
}
