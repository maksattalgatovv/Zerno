"use client";

import { FileDown, ScanSearch } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { DemoBadge, errorText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadFile } from "@/lib/api/client";
import { useCreateReport, useField, useMission, useRunAnalysis } from "@/lib/api/hooks";
import { useFormat } from "@/lib/hooks/use-format";
import type { TKey } from "@/lib/i18n";
import { useT } from "@/providers/i18n-provider";

export function MissionDialog({ id, farmId, onClose }: { id: string | null; farmId: string; onClose: () => void }) {
  const { t } = useT();
  const format = useFormat();
  const router = useRouter();
  const { data: mission, isLoading } = useMission(id);
  const field = useField(mission?.field_id ?? "");
  const analyze = useRunAnalysis();
  const report = useCreateReport();
  const [checking, setChecking] = useState<string | null>(null);

  const checkPhoto = async (imageId: string) => {
    if (!field.data) return;
    setChecking(imageId);
    try {
      const analysis = await analyze.mutateAsync({ image_id: imageId, crop_type: field.data.crop_type, field_id: field.data.id });
      router.push(`/ai-doctor?analysis=${analysis.id}`);
    } catch (error) {
      toast.error(errorText(error, t("state.errorBody")));
      setChecking(null);
    }
  };

  const download = async () => {
    if (!mission) return;
    try {
      const created = await report.mutateAsync({ type: "drone_mission", farm_id: farmId, mission_id: mission.id });
      await downloadFile(`/reports/${created.id}/download`, `zerno-${created.id.slice(0, 8)}.pdf`);
      toast.success(t("reports.ready"));
    } catch (error) {
      toast.error(errorText(error, t("state.errorBody")));
    }
  };

  const used = mission?.battery_start != null && mission.battery != null ? mission.battery_start - mission.battery : null;

  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mission ? mission.field_name : t("common.loading")}</DialogTitle>
          <DialogDescription>
            {mission && `${t(`mission.${mission.status}` as TKey)} · ${format.dateTime(mission.started_at ?? mission.created_at)} · ${mission.drone_model}`}
          </DialogDescription>
        </DialogHeader>
        {isLoading && <Skeleton className="h-48" />}
        {mission && (
          <div className="max-h-[65vh] space-y-4 overflow-y-auto">
            {mission.is_simulated && <DemoBadge label={t("common.simulated")} tip={t("drone.simTip")} />}
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                [t("drone.distance"), `${format.number(mission.distance_m / 1000, 1)} ${t("unit.km")}`],
                [t("drone.altitude"), `${mission.altitude_m} ${t("unit.m")}`],
                [t("drone.batteryUsed"), used === null ? "–" : `${format.number(used)}%`],
                [t("drone.coverage"), `${format.number(mission.progress * 100)}%`],
              ].map(([label, value]) => (
                <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="font-semibold">{value}</dd></div>
              ))}
            </dl>
            {mission.return_reason && (
              <p className="rounded bg-warn-tint px-3 py-2 text-warn-ink">{t(`drone.reason.${mission.return_reason}` as TKey)}</p>
            )}
            <div>
              <h3 className="mb-2 font-medium">{t("drone.samplePhotos")}</h3>
              {mission.images.length === 0 ? <p className="text-muted-foreground">{t("drone.noPhotos")}</p> : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {mission.images.map((image) => (
                    <div key={image.id}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image.url} alt={t("drone.samplePhoto")} className="aspect-[3/2] w-full rounded object-cover" />
                      <Button variant="outline" size="sm" className="mt-1.5 w-full" disabled={!!checking || !field.data} onClick={() => checkPhoto(image.id)}>
                        <ScanSearch className="size-3.5" /> {t(checking === image.id ? "common.loading" : "drone.checkPhoto")}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Button variant="outline" onClick={download} disabled={report.isPending}><FileDown className="size-4" /> {t("reports.download")}</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
