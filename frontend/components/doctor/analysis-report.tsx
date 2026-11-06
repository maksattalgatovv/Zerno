"use client";

import { Check, FileDown, Stethoscope, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DemoBadge, InfoTip, Panel, errorText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { downloadFile } from "@/lib/api/client";
import { useCreateReport, useDecide } from "@/lib/api/hooks";
import type { Analysis } from "@/lib/api/types";
import { useFormat } from "@/lib/hooks/use-format";
import { useFarm } from "@/providers/farm-provider";
import { useT } from "@/providers/i18n-provider";

function AnnotatedImage({ analysis }: { analysis: Analysis }) {
  const { t } = useT();
  return (
    <div className="relative overflow-hidden rounded">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={analysis.image.url} alt={t("doctor.photoAlt")} className="block w-full" />
      {analysis.annotations.map((box, index) => (
        <span key={index} className="absolute rounded-sm border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.5)]"
          style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }} />
      ))}
    </div>
  );
}

function Decision({ analysis }: { analysis: Analysis }) {
  const { t } = useT();
  const format = useFormat();
  const decide = useDecide();
  const [comment, setComment] = useState("");

  if (analysis.action) {
    const approved = analysis.action.decision === "approved";
    return (
      <div className="rounded bg-muted p-3">
        <p className="flex items-center gap-2 font-medium">
          {approved ? <Check className="size-4 text-brand-2" /> : <X className="size-4 text-danger" />}
          {t(approved ? "doctor.approved" : "doctor.rejected")}
          <span className="font-normal text-muted-foreground">· {format.dateTime(analysis.action.created_at)}</span>
        </p>
        {analysis.action.comment && <p className="mt-1 text-muted-foreground">{analysis.action.comment}</p>}
      </div>
    );
  }

  const submit = (decision: "approved" | "rejected") =>
    decide.mutate({ id: analysis.id, decision, comment }, {
      onSuccess: () => toast.success(t("doctor.decisionSaved")),
      onError: (error) => toast.error(errorText(error, t("state.errorBody"))),
    });

  return (
    <div>
      <h3 className="font-medium">{t("doctor.decide")}</h3>
      <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000}
        placeholder={t("doctor.commentPlaceholder")} aria-label={t("doctor.commentPlaceholder")} className="mt-2" />
      <div className="mt-2 flex gap-2">
        <Button className="flex-1" disabled={decide.isPending} onClick={() => submit("approved")}><Check className="size-4" /> {t("doctor.approve")}</Button>
        <Button variant="outline" className="flex-1" disabled={decide.isPending} onClick={() => submit("rejected")}><X className="size-4" /> {t("doctor.reject")}</Button>
      </div>
    </div>
  );
}

export function AnalysisReport({ analysis }: { analysis: Analysis }) {
  const { t } = useT();
  const format = useFormat();
  const { farm } = useFarm();
  const report = useCreateReport();

  const download = async () => {
    if (!farm) return;
    try {
      const created = await report.mutateAsync({ type: "ai_analysis", farm_id: farm.id, analysis_id: analysis.id });
      await downloadFile(`/reports/${created.id}/download`, `zerno-${created.id.slice(0, 8)}.pdf`);
      toast.success(t("reports.ready"));
    } catch (error) {
      toast.error(errorText(error, t("state.errorBody")));
    }
  };

  const percent = Math.round(analysis.confidence * 100);

  return (
    <Panel title={t("doctor.reportTitle")} actions={analysis.is_demo ? <DemoBadge label={t("doctor.demoBadge")} /> : undefined}>
      {analysis.disclaimer && <p className="mb-4 rounded bg-warn-tint px-3 py-2 text-sm text-warn-ink">{analysis.disclaimer}</p>}
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <AnnotatedImage analysis={analysis} />
          {analysis.annotations.length > 0 && <p className="mt-1.5 text-sm text-muted-foreground">{t("doctor.boxesNote")}</p>}
        </div>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">{t("doctor.possibleIssue")}</p>
            <p className="text-xl font-semibold">{analysis.issue_label}</p>
            <p className="text-sm text-muted-foreground">{[analysis.crop_label, analysis.field_name].filter(Boolean).join(" · ")}</p>
          </div>
          <div>
            <p className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">{t("doctor.confidence")} <InfoTip text={t("doctor.confidenceHint")} /></span>
              <span className="font-semibold">{percent}%</span>
            </p>
            <div className="mt-1 h-2 rounded-sm bg-muted"><div className="h-2 rounded-sm bg-brand-2" style={{ width: `${percent}%` }} /></div>
          </div>
          <p className={analysis.needs_agronomist ? "flex items-center gap-2 rounded bg-warn-tint px-3 py-2 text-warn-ink" : "flex items-center gap-2 text-muted-foreground"}>
            <Stethoscope className="size-4 shrink-0" />
            {t(analysis.needs_agronomist ? "doctor.agronomistYes" : "doctor.agronomistNo")}
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-5 border-t pt-4 md:grid-cols-2">
        <div>
          <h3 className="font-medium">{t("doctor.symptoms")}</h3>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {analysis.symptoms.map((symptom) => <li key={symptom.code}>{symptom.label}</li>)}
          </ul>
        </div>
        <div>
          <h3 className="font-medium">{t("doctor.nextSteps")}</h3>
          <ol className="mt-2 list-inside list-decimal space-y-1">
            {analysis.recommendations.map((text) => <li key={text}>{text}</li>)}
          </ol>
        </div>
      </div>
      <div className="mt-5 grid items-end gap-4 border-t pt-4 md:grid-cols-[1fr_auto]">
        <Decision analysis={analysis} />
        <Button variant="outline" onClick={download} disabled={report.isPending}><FileDown className="size-4" /> {t("reports.download")}</Button>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{t("doctor.method")}: {analysis.model_name} · {format.dateTime(analysis.created_at)}</p>
    </Panel>
  );
}
