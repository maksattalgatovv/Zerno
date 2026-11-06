"use client";

import { CheckCircle2, Layers, MapPinned } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";

import { FarmMap, type Selection } from "@/components/map";
import { FarmGate } from "@/components/shared/farm-gate";
import { DemoBadge, EmptyState, ErrorState, HealthBadge, LoadingState, PageHeader, Panel, errorText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useMapData, useResolveAnomaly } from "@/lib/api/hooks";
import type { Farm, MapData } from "@/lib/api/types";
import { useFormat } from "@/lib/hooks/use-format";
import type { TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useT } from "@/providers/i18n-provider";

function Legend() {
  const { t } = useT();
  const items: [string, TKey][] = [
    ["bg-brand-2", "health.healthy"], ["bg-warn", "health.attention"], ["bg-danger", "health.critical"], ["bg-[#778078]", "health.unknown"],
  ];
  return (
    <Panel title={t("map.legend")}>
      <ul className="space-y-2">
        {items.map(([color, key]) => (
          <li key={key} className="flex items-center gap-2"><span className={cn("size-4 rounded-sm", color)} />{t(key)}</li>
        ))}
        <li className="flex items-center gap-2"><span className="size-4 rounded-full border-2 border-white bg-danger ring-1 ring-border" />{t("map.anomaly")}</li>
        <li className="flex items-center gap-2"><span className="h-0 w-4 border-t-2 border-dashed border-muted-foreground" />{t("map.boundary")}</li>
      </ul>
    </Panel>
  );
}

function Details({ data, selection, onClear }: { data: MapData; selection: Selection; onClear: () => void }) {
  const { t } = useT();
  const format = useFormat();
  const resolve = useResolveAnomaly();

  const field = selection?.kind === "field" ? data.fields.find((f) => f.id === selection.id) : undefined;
  const zone = selection?.kind === "zone" ? data.zones.find((z) => z.id === selection.id) : undefined;
  const anomaly = selection?.kind === "anomaly" ? data.anomalies.find((a) => a.id === selection.id) : undefined;

  if (field) {
    return (
      <Panel title={field.name}>
        <HealthBadge status={field.health_status} />
        <dl className="mt-3 space-y-1.5">
          <div className="flex justify-between"><dt className="text-muted-foreground">{t("fields.crop")}</dt><dd>{field.crop_label}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">{t("fields.area")}</dt><dd>{format.area(field.area)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">NDVI</dt><dd>{format.ndvi(field.ndvi_mean)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">{t("fields.openIssues")}</dt><dd>{field.open_anomalies}</dd></div>
        </dl>
        <Button asChild variant="outline" className="mt-4 w-full"><Link href={`/fields/${field.id}`}>{t("map.openField")}</Link></Button>
      </Panel>
    );
  }
  if (zone) {
    return (
      <Panel title={zone.name}>
        <HealthBadge status={zone.health_status} />
        <p className="mt-3 text-muted-foreground">{data.fields.find((f) => f.id === zone.field_id)?.name}</p>
        <p className="mt-2">NDVI <span className="font-semibold">{format.ndvi(zone.ndvi)}</span></p>
        <p className="mt-2 text-muted-foreground">{zone.note}</p>
      </Panel>
    );
  }
  if (anomaly) {
    const onResolve = async () => {
      try {
        await resolve.mutateAsync(anomaly.id);
        toast.success(t("map.resolvedToast"));
        onClear();
      } catch (error) {
        toast.error(errorText(error, t("state.errorBody")));
      }
    };
    return (
      <Panel title={anomaly.title} actions={anomaly.is_simulated ? <DemoBadge /> : undefined}>
        <span className={cn("rounded px-2 py-1 text-sm font-medium", anomaly.severity === "critical" ? "bg-danger-tint text-danger-ink" : "bg-warn-tint text-warn-ink")}>
          {t(`severity.${anomaly.severity}` as TKey)}
        </span>
        <p className="mt-3">{anomaly.description}</p>
        <dl className="mt-3 space-y-1.5 border-t pt-3 text-sm">
          <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{t("report.field")}</dt><dd className="text-right">{anomaly.field_name}</dd></div>
          {anomaly.zone_name && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{t("map.zone")}</dt><dd className="text-right">{anomaly.zone_name}</dd></div>}
          <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{t("map.affected")}</dt><dd>{format.area(anomaly.area_ha)}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{t("map.found")}</dt><dd>{format.date(anomaly.detected_at)}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{t("fields.gps")}</dt><dd>{anomaly.latitude.toFixed(5)}, {anomaly.longitude.toFixed(5)}</dd></div>
        </dl>
        <Button className="mt-4 w-full" onClick={onResolve} disabled={resolve.isPending}><CheckCircle2 className="size-4" /> {t("map.resolve")}</Button>
      </Panel>
    );
  }
  return (
    <Panel title={t("map.selectTitle")}>
      <p className="text-muted-foreground">{t("map.selectBody")}</p>
    </Panel>
  );
}

function Content({ farm }: { farm: Farm }) {
  const { t } = useT();
  const params = useSearchParams();
  const query = useMapData(farm.id);
  const [picked, setSelection] = useState<Selection>(null);
  const [showZones, setShowZones] = useState(true);
  const [satellite, setSatellite] = useState(true);
  const linked = params.get("anomaly");
  const selection: Selection = picked ?? (linked ? { kind: "anomaly", id: linked } : null);

  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const data = query.data;

  if (data.fields.length === 0) {
    return <EmptyState icon={MapPinned} title={t("fields.emptyTitle")} body={t("fields.emptyBody")}
      action={<Button asChild><Link href="/fields">{t("fields.add")}</Link></Button>} />;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2"><Switch id="zones" checked={showZones} onCheckedChange={setShowZones} /><Label htmlFor="zones"><Layers className="size-4" /> {t("map.showZones")}</Label></div>
          <div className="flex items-center gap-2"><Switch id="satellite" checked={satellite} onCheckedChange={setSatellite} /><Label htmlFor="satellite">{t("map.satellite")}</Label></div>
          {data.is_demo && <DemoBadge label={t("map.demoShort")} tip={t("map.demoCoords")} />}
        </div>
        <FarmMap data={data} selection={selection} onSelect={setSelection} showZones={showZones}
          base={satellite ? "satellite" : "street"} labels={{ boundary: t("map.boundary") }} />
      </div>
      <div className="space-y-4">
        <Details data={data} selection={selection} onClear={() => setSelection(null)} />
        <Legend />
      </div>
    </div>
  );
}

function MapPage() {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t("nav.map")} description={t("map.subtitle")} />
      <FarmGate>{(farm) => <Content farm={farm} />}</FarmGate>
    </>
  );
}

export default function Page() {
  return <Suspense><MapPage /></Suspense>;
}
