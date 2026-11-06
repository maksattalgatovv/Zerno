"use client";

import { ArrowLeft, ChevronRight, FileDown, MapPin, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { NdviTrendChart } from "@/components/analytics/charts";
import { FieldDialog } from "@/components/fields/field-dialog";
import { FieldMiniMap } from "@/components/map";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FarmGate } from "@/components/shared/farm-gate";
import { DemoBadge, ErrorState, HealthBadge, LoadingState, PageHeader, Panel, errorText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { downloadFile } from "@/lib/api/client";
import { useCreateReport, useDeleteField, useField } from "@/lib/api/hooks";
import type { Farm } from "@/lib/api/types";
import { useFormat } from "@/lib/hooks/use-format";
import type { TKey } from "@/lib/i18n";
import { useT } from "@/providers/i18n-provider";

function Content({ farm, id }: { farm: Farm; id: string }) {
  const { t } = useT();
  const format = useFormat();
  const router = useRouter();
  const query = useField(id);
  const remove = useDeleteField();
  const report = useCreateReport();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const field = query.data;

  const confirmDelete = async () => {
    try {
      await remove.mutateAsync(field.id);
      toast.success(t("fields.deleted"));
      router.push("/fields");
    } catch (error) {
      toast.error(errorText(error, t("state.errorBody")));
    }
  };

  const downloadReport = async () => {
    try {
      const created = await report.mutateAsync({ type: "field_monitoring", farm_id: farm.id, field_id: field.id });
      await downloadFile(`/reports/${created.id}/download`, `zerno-${created.id.slice(0, 8)}.pdf`);
      toast.success(t("reports.ready"));
    } catch (error) {
      toast.error(errorText(error, t("state.errorBody")));
    }
  };

  const facts: [string, string][] = [
    [t("fields.region"), field.region || "–"],
    [t("fields.area"), format.area(field.area)],
    [t("fields.crop"), field.crop_label],
    [t("fields.planted"), format.date(field.planting_date)],
    [t("fields.lastCheck"), format.date(field.last_monitored_at)],
    [t("fields.gps"), `${field.center_lat.toFixed(5)}, ${field.center_lng.toFixed(5)}`],
    ["NDVI", format.ndvi(field.ndvi_mean)],
  ];

  return (
    <>
      <Link href="/fields" className="mb-3 inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {t("nav.fields")}
      </Link>
      <PageHeader title={field.name} actions={
        <>
          <HealthBadge status={field.health_status} />
          <Button variant="outline" onClick={downloadReport} disabled={report.isPending}><FileDown className="size-4" /> {t("reports.download")}</Button>
          <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="size-4" /> {t("common.edit")}</Button>
          <Button variant="destructive" onClick={() => setDeleting(true)}><Trash2 className="size-4" /> {t("common.delete")}</Button>
        </>
      } />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Panel title={t("fields.details")}>
          <dl className="divide-y">
            {facts.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 py-2.5">
                <dt className="text-muted-foreground">{label}</dt><dd className="text-right font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <div>
          <FieldMiniMap field={field} zones={field.zones} />
          <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="size-4" /> {t("map.demoCoords")}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title={t("fields.history")} hint={t("common.ndviHint")} actions={<DemoBadge />}>
          {field.history.length ? (
            <NdviTrendChart series={[{ id: field.id, name: field.name }]}
              data={field.history.map((p) => ({ date: p.recorded_on, values: { [field.id]: p.mean }, average: p.mean }))} />
          ) : <p className="text-muted-foreground">{t("fields.noHistory")}</p>}
        </Panel>
        <Panel title={t("fields.zones")} hint={t("fields.zonesHint")}>
          {field.zones.length ? (
            <ul className="divide-y">
              {field.zones.map((zone) => (
                <li key={zone.id} className="py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{zone.name}</span>
                    <span className="flex items-center gap-3"><span className="text-sm">NDVI {format.ndvi(zone.ndvi)}</span><HealthBadge status={zone.health_status} /></span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{zone.note}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-muted-foreground">{t("fields.noZones")}</p>}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title={t("fields.problems")}>
          {field.anomalies.length === 0 && <p className="text-muted-foreground">{t("fields.noProblems")}</p>}
          <ul className="space-y-3">
            {field.anomalies.map((a) => (
              <li key={a.id}>
                <Link href={a.status === "open" ? `/map?anomaly=${a.id}` : "#"} className="block rounded hover:bg-muted">
                  <p className="font-medium">{a.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {t(`severity.${a.severity}` as TKey)} · {format.date(a.detected_at)}{a.status === "resolved" ? ` · ${t("map.resolved")}` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title={t("fields.missions")}>
          {field.missions.length === 0 && <p className="text-muted-foreground">{t("dash.noMission")}</p>}
          <ul className="space-y-1">
            {field.missions.map((mission) => (
              <li key={mission.id}>
                <Link href={`/drone?mission=${mission.id}`} className="-mx-2 flex items-center justify-between rounded px-2 py-1.5 hover:bg-muted">
                  <span><span className="block">{format.date(mission.created_at)}</span><span className="block text-sm text-muted-foreground">{t(`mission.${mission.status}` as TKey)}</span></span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title={t("fields.photoChecks")}>
          {field.analyses.length === 0 && <p className="text-muted-foreground">{t("doctor.emptyHistory")}</p>}
          <ul className="space-y-1">
            {field.analyses.map((analysis) => (
              <li key={analysis.id}>
                <Link href={`/ai-doctor?analysis=${analysis.id}`} className="-mx-2 flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-muted">
                  <span className="min-w-0"><span className="block truncate">{analysis.issue_label}</span><span className="block text-sm text-muted-foreground">{format.date(analysis.created_at)}</span></span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <FieldDialog open={editing} onOpenChange={setEditing} farm={farm} field={field} />
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title={t("fields.deleteTitle", { name: field.name })}
        body={t("fields.deleteBody")} confirmLabel={t("common.delete")} onConfirm={confirmDelete} />
    </>
  );
}

export default function FieldDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <FarmGate>{(farm) => <Content farm={farm} id={id} />}</FarmGate>;
}
