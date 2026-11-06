"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  BatteryCharging, BatteryFull, BatteryLow, CheckCircle2, Home, Plane, RadioTower, Route, Satellite, ShieldAlert, XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { MissionDialog } from "@/components/drone/mission-dialog";
import { RouteMap } from "@/components/map";
import { FarmGate } from "@/components/shared/farm-gate";
import { DemoBadge, EmptyState, ErrorState, InfoTip, LoadingState, PageHeader, Panel, errorText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  isActive, useCancelMission, useChargeDrone, useDrones, useFields, useMission, useMissions, usePlanMission,
  useReturnHome, useStartMission,
} from "@/lib/api/hooks";
import type { Drone, Farm, MissionDetail } from "@/lib/api/types";
import { useFormat } from "@/lib/hooks/use-format";
import type { TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useT } from "@/providers/i18n-provider";

function DroneCard({ drone, selected, onSelect }: { drone: Drone; selected: boolean; onSelect: () => void }) {
  const { t } = useT();
  const format = useFormat();
  const charge = useChargeDrone();
  const Battery = drone.status === "charging" ? BatteryCharging : drone.battery_level < 40 ? BatteryLow : BatteryFull;
  return (
    <div className={cn("rounded-lg border bg-card p-4", selected && "border-brand-2 ring-1 ring-brand-2")}>
      <button type="button" onClick={onSelect} className="w-full text-left">
        <span className="flex items-center justify-between gap-2">
          <span className="font-semibold">{drone.model}</span>
          <span className="rounded bg-muted px-2 py-0.5 text-sm">{t(`drone.status.${drone.status}` as TKey)}</span>
        </span>
        <span className="mt-3 flex items-center gap-2">
          <Battery className={cn("size-5", drone.battery_level < 40 ? "text-warn" : "text-brand-2")} />
          <Progress value={drone.battery_level} className="h-2 flex-1" aria-label={t("drone.battery")} />
          <span className="w-11 text-right text-sm font-medium">{format.number(drone.battery_level)}%</span>
        </span>
        <span className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <span className="flex items-center gap-1.5"><Satellite className="size-4 text-brand-2" />{t("drone.gps")}: {t(`drone.gpsState.${drone.gps_status}` as TKey)}</span>
          <span className="flex items-center gap-1.5"><RadioTower className="size-4 text-brand-2" />{t(`drone.conn.${drone.connection_status}` as TKey)}</span>
        </span>
        <span className="mt-2 block text-sm text-muted-foreground">{t("drone.lastMission")}: {format.date(drone.last_mission_at)}</span>
      </button>
      {drone.status === "idle" && drone.battery_level < 100 && (
        <Button variant="outline" size="sm" className="mt-3 w-full" disabled={charge.isPending} onClick={() => charge.mutate(drone.id)}>
          <BatteryCharging className="size-4" /> {t("drone.charge")}
        </Button>
      )}
    </div>
  );
}

function ActiveMission({ mission }: { mission: MissionDetail }) {
  const { t } = useT();
  const format = useFormat();
  const returnHome = useReturnHome();
  const requested = returnHome.isSuccess || mission.status === "returning";

  return (
    <Panel title={t("drone.activeTitle", { field: mission.field_name })} actions={<DemoBadge label={t("common.simulated")} tip={t("drone.simTip")} />}>
      <div className="flex items-baseline justify-between">
        <span className="font-medium">{t(`drone.phase.${mission.phase ?? "takeoff"}` as TKey)}</span>
        <span className="text-2xl font-semibold">{format.number(mission.progress * 100)}%</span>
      </div>
      <Progress value={mission.progress * 100} className="mt-2 h-2.5" aria-label={t("drone.coverage")} />
      <dl className="mt-4 grid grid-cols-3 gap-2">
        <div><dt className="text-sm text-muted-foreground">{t("drone.battery")}</dt><dd className="font-semibold">{format.number(mission.battery ?? 0)}%</dd></div>
        <div><dt className="text-sm text-muted-foreground">{t("drone.altitude")}</dt><dd className="font-semibold">{mission.altitude_m} {t("unit.m")}</dd></div>
        <div><dt className="text-sm text-muted-foreground">{t("drone.photos")}</dt><dd className="font-semibold">{mission.photos_taken}</dd></div>
      </dl>
      {mission.return_reason === "low_battery" && <p className="mt-3 rounded bg-warn-tint px-3 py-2 text-warn-ink">{t("drone.reason.low_battery")}</p>}
      <Button variant="outline" className="mt-4 w-full" disabled={requested || returnHome.isPending}
        onClick={() => returnHome.mutate(mission.id, { onError: (e) => toast.error(errorText(e, t("state.errorBody"))) })}>
        <Home className="size-4" /> {requested ? t("drone.returning") : t("drone.returnHome")}
      </Button>
    </Panel>
  );
}

function PlannedMission({ mission, onDone }: { mission: MissionDetail; onDone: () => void }) {
  const { t } = useT();
  const format = useFormat();
  const start = useStartMission();
  const cancel = useCancelMission();
  const [confirmed, setConfirmed] = useState(false);
  const allPassed = mission.preflight.every((check) => check.passed);

  const onStart = () => start.mutate(mission.id, {
    onError: (error) => toast.error(errorText(error, t("state.errorBody"))),
  });

  return (
    <Panel title={t("drone.routeReady")} hint={t("drone.routeHint")}>
      <dl className="grid grid-cols-3 gap-2 border-b pb-4">
        <div><dt className="text-sm text-muted-foreground">{t("drone.distance")}</dt><dd className="font-semibold">{format.number(mission.distance_m / 1000, 1)} {t("unit.km")}</dd></div>
        <div><dt className="text-sm text-muted-foreground">{t("drone.flightTime")}</dt><dd className="font-semibold">{format.number(mission.duration_min)} {t("unit.min")}</dd></div>
        <div><dt className="text-sm text-muted-foreground">{t("drone.batteryUse")}</dt><dd className="font-semibold">{mission.battery_needed}%</dd></div>
      </dl>
      <h3 className="mt-4 font-medium">{t("drone.preflight")}</h3>
      <ul className="mt-2 space-y-1.5">
        {mission.preflight.map((check) => (
          <li key={check.code} className="flex items-start gap-2 text-sm">
            {check.passed ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-2" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-danger" />}
            <span>{check.label}</span>
          </li>
        ))}
      </ul>
      {!allPassed && <p className="mt-3 text-sm text-danger-ink">{t("drone.preflightFailed")}</p>}
      <div className="mt-4 flex items-start gap-3 rounded bg-muted p-3">
        <Switch id="operator" checked={confirmed} onCheckedChange={setConfirmed} className="mt-0.5" />
        <Label htmlFor="operator" className="block leading-snug font-normal">{t("drone.operatorConfirm")}</Label>
      </div>
      <div className="mt-4 flex gap-2">
        <Button className="flex-1" disabled={!confirmed || !allPassed || start.isPending} onClick={onStart}>
          <Plane className="size-4" /> {t("drone.start")}
        </Button>
        <Button variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate(mission.id, { onSuccess: onDone })}>{t("common.cancel")}</Button>
      </div>
    </Panel>
  );
}

function Content({ farm }: { farm: Farm }) {
  const { t } = useT();
  const format = useFormat();
  const client = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();
  const drones = useDrones(farm.id);
  const fields = useFields(farm.id);
  const missions = useMissions(farm.id);
  const plan = usePlanMission();

  const [droneId, setDroneId] = useState<string>();
  const [fieldId, setFieldId] = useState<string>();
  const [altitude, setAltitude] = useState(60);
  const [plannedId, setPlannedId] = useState<string | null>(null);

  const running = useMemo(() => missions.data?.find(isActive), [missions.data]);
  const mission = useMission(running?.id ?? plannedId);
  const current = mission.data;
  const previous = useRef(current);

  useEffect(() => {
    const before = previous.current;
    previous.current = current;
    if (before && current && before.id === current.id && isActive(before) && !isActive(current)) {
      if (current.status === "completed") toast.success(t("drone.doneToast", { field: current.field_name }));
      else toast.warning(t("drone.abortedToast", { field: current.field_name }));
      setPlannedId(null);
      client.invalidateQueries({ queryKey: ["farm"] });
      client.invalidateQueries({ queryKey: ["notifications"] });
      client.invalidateQueries({ queryKey: ["field"] });
    }
  }, [current, client, t]);

  const drone = drones.data?.find((d) => d.id === droneId) ?? drones.data?.[0];
  const selectedFieldId = fieldId ?? fields.data?.[0]?.id;
  const shownFieldId = current && (isActive(current) || current.status === "planned") ? current.field_id : selectedFieldId;
  const field = fields.data?.find((f) => f.id === shownFieldId);
  const flying = !!current && isActive(current);
  const planned = current?.status === "planned" ? current : null;

  if (drones.isLoading || fields.isLoading) return <LoadingState />;
  if (drones.isError || !drones.data) return <ErrorState error={drones.error} onRetry={drones.refetch} />;
  if (!fields.data?.length) {
    return <EmptyState icon={Route} title={t("fields.emptyTitle")} body={t("drone.needField")}
      action={<Button asChild><Link href="/fields">{t("fields.add")}</Link></Button>} />;
  }

  const onPlan = () => {
    if (!drone || !selectedFieldId) return;
    plan.mutate({ drone_id: drone.id, field_id: selectedFieldId, altitude_m: altitude }, {
      onSuccess: (created) => setPlannedId(created.id),
      onError: (error) => toast.error(errorText(error, t("state.errorBody"))),
    });
  };

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn-tint p-3 text-sm text-warn-ink">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <span>{t("drone.simNotice")}</span>
          </div>
          {drones.data.map((item) => (
            <DroneCard key={item.id} drone={item} selected={item.id === drone?.id} onSelect={() => setDroneId(item.id)} />
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <RouteMap field={field} mission={flying || planned ? current : null} home={drone ? [drone.home_lat, drone.home_lng] : undefined} />
          <div className="space-y-4">
            {flying && current ? <ActiveMission mission={current} /> :
              planned ? <PlannedMission mission={planned} onDone={() => setPlannedId(null)} /> : (
                <Panel title={t("drone.plan")} hint={t("drone.planHint")}>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="mission-field">{t("drone.field")}</Label>
                      <Select value={selectedFieldId} onValueChange={setFieldId}>
                        <SelectTrigger id="mission-field" className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {fields.data.map((f) => <SelectItem key={f.id} value={f.id}>{f.name} · {format.area(f.area)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="altitude" className="flex justify-between">
                        <span className="flex items-center gap-1.5">{t("drone.altitude")} <InfoTip text={t("drone.altitudeHint")} /></span>
                        <span className="font-semibold">{altitude} {t("unit.m")}</span>
                      </Label>
                      <input id="altitude" type="range" min={30} max={120} step={10} value={altitude}
                        onChange={(e) => setAltitude(Number(e.target.value))} className="w-full accent-brand-2" />
                    </div>
                    <Button className="w-full" onClick={onPlan} disabled={plan.isPending || !drone}><Route className="size-4" /> {t("drone.planRoute")}</Button>
                  </div>
                </Panel>
              )}
          </div>
        </div>
      </div>

      <Panel title={t("drone.history")} className="mt-4">
        {missions.data?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead className="text-sm text-muted-foreground">
                <tr className="border-b"><th className="py-2 pr-4 font-medium">{t("drone.date")}</th><th className="pr-4 font-medium">{t("drone.field")}</th><th className="pr-4 font-medium">{t("report.drone")}</th><th className="pr-4 font-medium">{t("report.status")}</th><th className="pr-4 font-medium">{t("drone.coverage")}</th><th /></tr>
              </thead>
              <tbody>
                {missions.data.filter((m) => m.status !== "cancelled" && m.status !== "planned").map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="py-2.5 pr-4">{format.dateTime(m.started_at ?? m.created_at)}</td>
                    <td className="pr-4">{m.field_name}</td>
                    <td className="pr-4">{m.drone_model}</td>
                    <td className="pr-4">{t(`mission.${m.status}` as TKey)}</td>
                    <td className="pr-4">{format.number(m.progress * 100)}%</td>
                    <td className="text-right"><Button variant="ghost" size="sm" onClick={() => router.push(`/drone?mission=${m.id}`, { scroll: false })}>{t("common.open")}</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-muted-foreground">{t("dash.noMission")}</p>}
      </Panel>

      <MissionDialog id={params.get("mission")} farmId={farm.id} onClose={() => router.replace("/drone", { scroll: false })} />
    </>
  );
}

function DronePage() {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t("nav.drone")} description={t("drone.subtitle")} />
      <FarmGate>{(farm) => <Content farm={farm} />}</FarmGate>
    </>
  );
}

export default function Page() {
  return <Suspense><DronePage /></Suspense>;
}
