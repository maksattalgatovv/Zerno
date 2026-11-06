"use client";

import { Download, FileText, Plane, Sprout, Trash2, Leaf, Activity } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FarmGate } from "@/components/shared/farm-gate";
import { DemoBadge, EmptyState, ErrorState, LoadingState, PageHeader, Panel, errorText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadFile } from "@/lib/api/client";
import { useAnalyses, useCreateReport, useDeleteReport, useFields, useMissions, useReports } from "@/lib/api/hooks";
import type { Farm, Report, ReportIn } from "@/lib/api/types";
import { useFormat } from "@/lib/hooks/use-format";
import { useT } from "@/providers/i18n-provider";

type Option = { id: string; label: string };

function Generator({ icon: Icon, title, body, options, placeholder, onGenerate, busy }: {
  icon: typeof FileText; title: string; body: string; options?: Option[]; placeholder?: string;
  onGenerate: (target?: string) => void; busy: boolean;
}) {
  const { t } = useT();
  const [target, setTarget] = useState<string>();
  const needsTarget = !!options;
  return (
    <div className="flex flex-col rounded-lg border bg-card p-5">
      <Icon className="size-6 text-brand-2" />
      <h2 className="mt-3 font-semibold">{title}</h2>
      <p className="mt-1 flex-1 text-sm text-muted-foreground">{body}</p>
      {options && (
        <Select value={target} onValueChange={setTarget}>
          <SelectTrigger className="mt-3 w-full" aria-label={placeholder}><SelectValue placeholder={placeholder} /></SelectTrigger>
          <SelectContent>{options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
      )}
      <Button className="mt-3" disabled={busy || (needsTarget && !target)} onClick={() => onGenerate(target)}>
        <FileText className="size-4" /> {t("reports.generate")}
      </Button>
    </div>
  );
}

function Content({ farm }: { farm: Farm }) {
  const { t } = useT();
  const format = useFormat();
  const reports = useReports(farm.id);
  const fields = useFields(farm.id);
  const missions = useMissions(farm.id);
  const analyses = useAnalyses();
  const create = useCreateReport();
  const remove = useDeleteReport();
  const [deleting, setDeleting] = useState<Report | null>(null);

  const download = (report: Report) =>
    downloadFile(`/reports/${report.id}/download`, `zerno-${report.id.slice(0, 8)}.pdf`)
      .catch((error) => toast.error(errorText(error, t("state.errorBody"))));

  const generate = async (body: Omit<ReportIn, "farm_id">) => {
    try {
      const report = await create.mutateAsync({ ...body, farm_id: farm.id });
      await download(report);
      toast.success(t("reports.ready"));
    } catch (error) {
      toast.error(errorText(error, t("state.errorBody")));
    }
  };

  const missionOptions = (missions.data ?? [])
    .filter((m) => m.status === "completed" || m.status === "aborted")
    .map((m) => ({ id: m.id, label: `${m.field_name} · ${format.date(m.started_at)}` }));
  const analysisOptions = (analyses.data ?? []).map((a) => ({
    id: a.id, label: `${a.issue_label} · ${format.date(a.created_at)}`,
  }));

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Generator icon={Activity} title={t("reports.health")} body={t("reports.healthBody")} busy={create.isPending}
          onGenerate={() => generate({ type: "crop_health" })} />
        <Generator icon={Sprout} title={t("reports.field")} body={t("reports.fieldBody")} busy={create.isPending}
          options={fields.data?.map((f) => ({ id: f.id, label: f.name })) ?? []} placeholder={t("reports.chooseField")}
          onGenerate={(id) => generate({ type: "field_monitoring", field_id: id })} />
        <Generator icon={Plane} title={t("reports.mission")} body={t("reports.missionBody")} busy={create.isPending}
          options={missionOptions} placeholder={t("reports.chooseMission")}
          onGenerate={(id) => generate({ type: "drone_mission", mission_id: id })} />
        <Generator icon={Leaf} title={t("reports.ai")} body={t("reports.aiBody")} busy={create.isPending}
          options={analysisOptions} placeholder={t("reports.chooseAnalysis")}
          onGenerate={(id) => generate({ type: "ai_analysis", analysis_id: id })} />
      </div>

      <Panel title={t("reports.generated")} className="mt-4" actions={<DemoBadge label={t("reports.demoNote")} />}>
        {reports.isLoading ? <LoadingState rows={1} /> : reports.isError ? <ErrorState error={reports.error} onRetry={reports.refetch} /> :
          !reports.data?.length ? <EmptyState icon={FileText} title={t("reports.emptyTitle")} body={t("reports.emptyBody")} /> : (
            <ul className="divide-y">
              {reports.data.map((report) => (
                <li key={report.id} className="flex flex-wrap items-center gap-3 py-3">
                  <FileText className="size-5 text-brand-2" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{report.title}</span>
                    <span className="block text-sm text-muted-foreground">
                      {format.dateTime(report.created_at)} · {report.language.toUpperCase()} · {format.number(report.size_bytes / 1024)} {t("unit.kb")}
                    </span>
                  </span>
                  <Button variant="outline" size="sm" onClick={() => download(report)}><Download className="size-3.5" /> {t("reports.download")}</Button>
                  <Button variant="ghost" size="icon-sm" aria-label={t("common.delete")} onClick={() => setDeleting(report)}><Trash2 className="size-4" /></Button>
                </li>
              ))}
            </ul>
          )}
      </Panel>

      <ConfirmDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}
        title={t("reports.deleteTitle")} body={deleting?.title ?? ""} confirmLabel={t("common.delete")}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id, {
            onSuccess: () => toast.success(t("reports.deleted")),
            onError: (error) => toast.error(errorText(error, t("state.errorBody"))),
          });
          setDeleting(null);
        }} />
    </>
  );
}

export default function ReportsPage() {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t("nav.reports")} description={t("reports.subtitle")} />
      <FarmGate>{(farm) => <Content farm={farm} />}</FarmGate>
    </>
  );
}
