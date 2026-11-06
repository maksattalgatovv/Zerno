"use client";

import { Check, CircleDot, ImagePlus, Leaf, LoaderCircle, RotateCcw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState, type DragEvent } from "react";

import { AnalysisReport } from "@/components/doctor/analysis-report";
import { EmptyState, ErrorState, LoadingState, PageHeader, Panel, errorText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api/client";
import { useAnalyses, useFields, useRunAnalysis } from "@/lib/api/hooks";
import { CROP_TYPES, type Analysis, type CropType, type Image } from "@/lib/api/types";
import { useFormat } from "@/lib/hooks/use-format";
import type { TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useFarm } from "@/providers/farm-provider";
import { useT } from "@/providers/i18n-provider";

const MAX_MB = 10;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const NO_FIELD = "none";
type Stage = "idle" | "uploading" | "analyzing" | "done";

function Steps({ stage }: { stage: Stage }) {
  const { t } = useT();
  const steps: { id: Stage; label: TKey }[] = [
    { id: "uploading", label: "doctor.stepUpload" },
    { id: "analyzing", label: "doctor.stepAnalyze" },
    { id: "done", label: "doctor.stepReport" },
  ];
  const current = steps.findIndex((step) => step.id === stage);
  return (
    <ol className="space-y-2" aria-live="polite">
      {steps.map((step, index) => {
        const finished = index < current || stage === "done";
        const active = index === current && stage !== "done";
        return (
          <li key={step.id} className={cn("flex items-center gap-2", !finished && !active && "text-muted-foreground")}>
            {finished ? <Check className="size-4 text-brand-2" /> : active ? <LoaderCircle className="size-4 animate-spin text-brand-2" /> : <CircleDot className="size-4" />}
            {t(step.label)}
          </li>
        );
      })}
    </ol>
  );
}

function Uploader({ onDone }: { onDone: (analysis: Analysis) => void }) {
  const { t } = useT();
  const { farm } = useFarm();
  const fields = useFields(farm?.id);
  const run = useRunAnalysis();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropType>("wheat");
  const [fieldId, setFieldId] = useState(NO_FIELD);
  const [stage, setStage] = useState<Stage>("idle");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const choose = useCallback((next: File | undefined) => {
    if (!next) return;
    setError(null);
    if (!ACCEPTED.includes(next.type)) return setError(t("doctor.badType"));
    if (next.size > MAX_MB * 1024 * 1024) return setError(t("doctor.tooBig", { limit: MAX_MB }));
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setStage("idle");
  }, [t]);

  const onField = (id: string) => {
    setFieldId(id);
    const field = fields.data?.find((item) => item.id === id);
    if (field) setCrop(field.crop_type);
  };

  const start = async () => {
    if (!file) return;
    setError(null);
    const selectedField = fieldId === NO_FIELD ? null : fieldId;
    try {
      setStage("uploading");
      const form = new FormData();
      form.append("file", file);
      if (selectedField) form.append("field_id", selectedField);
      const image = await api<Image>("/images", { method: "POST", form });
      setStage("analyzing");
      const analysis = await run.mutateAsync({ image_id: image.id, crop_type: crop, field_id: selectedField });
      setStage("done");
      onDone(analysis);
    } catch (failure) {
      setStage("idle");
      setError(errorText(failure, t("state.errorBody")));
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files[0]);
  };

  const busy = stage === "uploading" || stage === "analyzing";

  return (
    <Panel title={t("doctor.uploadTitle")}>
      <input ref={input} type="file" accept={ACCEPTED.join(",")} className="sr-only" aria-label={t("doctor.uploadTitle")}
        onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
      <button type="button" onClick={() => input.current?.click()} disabled={busy}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
        className={cn("flex w-full flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed p-2 text-center transition-colors",
          dragging ? "border-brand-2 bg-good-tint" : "border-input hover:border-brand-2", !preview && "min-h-56")}>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={t("doctor.photoAlt")} className="max-h-72 rounded object-contain" />
        ) : (
          <>
            <ImagePlus className="size-9 text-brand-2" />
            <span className="mt-2 font-medium">{t("doctor.dropTitle")}</span>
            <span className="text-sm text-muted-foreground">{t("doctor.dropHint", { limit: MAX_MB })}</span>
          </>
        )}
      </button>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="doctor-crop">{t("fields.crop")}</Label>
          <Select value={crop} onValueChange={(value) => setCrop(value as CropType)}>
            <SelectTrigger id="doctor-crop" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{CROP_TYPES.map((item) => <SelectItem key={item} value={item}>{t(`crop.${item}` as TKey)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="doctor-field">{t("drone.field")}</Label>
          <Select value={fieldId} onValueChange={onField}>
            <SelectTrigger id="doctor-field" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_FIELD}>{t("doctor.noField")}</SelectItem>
              {fields.data?.map((field) => <SelectItem key={field.id} value={field.id}>{field.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      <Button className="mt-4 w-full" disabled={!file || busy} onClick={start}>
        <Leaf className="size-4" /> {t("doctor.start")}
      </Button>
      {stage !== "idle" && <div className="mt-4 border-t pt-4"><Steps stage={stage} /></div>}
    </Panel>
  );
}

function History({ items, selected, onSelect }: { items: Analysis[]; selected?: string; onSelect: (id: string) => void }) {
  const { t } = useT();
  const format = useFormat();
  return (
    <Panel title={t("doctor.history")}>
      {items.length === 0 ? <p className="text-muted-foreground">{t("doctor.emptyHistory")}</p> : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => onSelect(item.id)}
                className={cn("-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded px-2 py-2 text-left hover:bg-muted", item.id === selected && "bg-muted")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.image.url} alt="" className="size-11 shrink-0 rounded object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.issue_label}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {format.date(item.created_at)} · {item.action ? t(item.action.decision === "approved" ? "doctor.approved" : "doctor.rejected") : t("doctor.pending")}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function DoctorPage() {
  const { t } = useT();
  const router = useRouter();
  const params = useSearchParams();
  const query = useAnalyses();
  const selectedId = params.get("analysis");
  const selected = query.data?.find((item) => item.id === selectedId);
  const select = (id: string) => router.replace(`/ai-doctor?analysis=${id}`, { scroll: false });

  return (
    <>
      <PageHeader title={t("nav.doctor")} description={t("doctor.subtitle")}
        actions={selected ? <Button variant="outline" onClick={() => router.replace("/ai-doctor")}><RotateCcw className="size-4" /> {t("doctor.newCheck")}</Button> : undefined} />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div>
          {query.isLoading ? <LoadingState rows={1} /> : query.isError ? <ErrorState error={query.error} onRetry={query.refetch} /> :
            selected ? <AnalysisReport analysis={selected} /> : <Uploader onDone={(analysis) => select(analysis.id)} />}
        </div>
        <div>
          {query.data ? <History items={query.data} selected={selectedId ?? undefined} onSelect={select} /> :
            !query.isLoading && <EmptyState icon={Leaf} title={t("doctor.emptyHistory")} />}
        </div>
      </div>
    </>
  );
}

export default function Page() {
  return <Suspense><DoctorPage /></Suspense>;
}
