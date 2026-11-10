"use client";

import { Home, ListRestart, Minus, MoreVertical, PawPrint, Pencil, Plane, Plus, Trash2, UserRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { EventDialog, GroupDialog, type EventMode } from "@/components/livestock/livestock-dialogs";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FarmGate } from "@/components/shared/farm-gate";
import { DemoBadge, EmptyState, ErrorState, LoadingState, PageHeader, Panel, errorText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDeleteLivestockGroup, useLivestock } from "@/lib/api/hooks";
import type { Farm, Livestock, LivestockGroup } from "@/lib/api/types";
import { useFormat } from "@/lib/hooks/use-format";
import type { TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useT } from "@/providers/i18n-provider";

const droneHref = (fieldId?: string | null) => `/drone?purpose=livestock${fieldId ? `&field=${fieldId}` : ""}`;

function Summary({ data }: { data: Livestock }) {
  const { t } = useT();
  const format = useFormat();
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <div className="col-span-2 rounded-lg bg-brand p-5 text-white sm:col-span-1">
        <p className="text-sm text-white/80">{t("livestock.total")}</p>
        <p className="mt-1 text-[32px] leading-tight font-semibold tracking-tight">{format.number(data.total)}</p>
      </div>
      {data.by_species.map((item) => (
        <div key={item.species} className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t(`species.${item.species}` as TKey)}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{format.number(item.head_count)}</p>
          <p className="text-xs text-muted-foreground">{t("livestock.groupCount", { n: item.groups })}</p>
        </div>
      ))}
    </div>
  );
}

function DroneStatus({ group }: { group: LivestockGroup }) {
  const { t } = useT();
  const format = useFormat();
  const last = group.last_drone_count;
  if (!group.field_id) {
    return <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Home className="size-4" />{t("livestock.indoorHint")}</p>;
  }
  return (
    <div className="space-y-1 text-sm">
      <p className="flex items-center gap-1.5 text-muted-foreground"><PawPrint className="size-4" />{group.field_name}</p>
      {last ? (
        <Link href={`/drone?mission=${last.mission_id}`} className="flex items-center gap-1.5 text-brand-2 hover:underline">
          <Plane className="size-4" />
          {t("livestock.lastDrone", { n: format.number(last.counted), when: format.ago(last.at) })}
          {last.confidence != null && <span className="text-muted-foreground">· {format.number(last.confidence * 100)}%</span>}
        </Link>
      ) : (
        <p className="flex items-center gap-1.5 text-muted-foreground"><Plane className="size-4" />{t("livestock.neverDrone")}</p>
      )}
    </div>
  );
}

function GroupCard({ group, onEvent, onEdit, onDelete }: {
  group: LivestockGroup; onEvent: (mode: EventMode) => void; onEdit: () => void; onDelete: () => void;
}) {
  const { t } = useT();
  const format = useFormat();
  return (
    <article className="flex flex-col rounded-lg border bg-card p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{t(`species.${group.species}` as TKey)}</p>
          <h2 className="truncate text-lg font-semibold">{group.name}</h2>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t("common.actions")}><MoreVertical className="size-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onEvent("add")}><Plus className="size-4" /> {t("livestock.add")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onEvent("remove")} disabled={group.head_count === 0}><Minus className="size-4" /> {t("livestock.remove")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onEvent("recount")}><ListRestart className="size-4" /> {t("livestock.recount")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={onEdit}><Pencil className="size-4" /> {t("common.edit")}</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={onDelete}><Trash2 className="size-4" /> {t("common.delete")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="mt-3 text-[32px] leading-none font-semibold tracking-tight">
        {format.number(group.head_count)}
        <span className="ml-1.5 text-base font-normal text-muted-foreground">{t("livestock.unit")}</span>
      </p>
      <div className="mt-3"><DroneStatus group={group} /></div>
      {group.notes && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{group.notes}</p>}
      <div className="mt-auto pt-4">
        {group.field_id ? (
          <Button asChild className="w-full"><Link href={droneHref(group.field_id)}><Plane className="size-4" /> {t("livestock.droneCount")}</Link></Button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => onEvent("remove")} disabled={group.head_count === 0}>
              <Minus className="size-4" /> {t("livestock.remove")}
            </Button>
            <Button variant="outline" onClick={() => onEvent("add")}><Plus className="size-4" /> {t("livestock.add")}</Button>
          </div>
        )}
      </div>
    </article>
  );
}

function History({ data }: { data: Livestock }) {
  const { t } = useT();
  const format = useFormat();
  return (
    <Panel title={t("livestock.history")} className="mt-5">
      {data.recent_events.length === 0 ? <p className="text-muted-foreground">{t("livestock.noHistory")}</p> : (
        <ul className="divide-y">
          {data.recent_events.map((event) => {
            const byDrone = event.kind === "drone_count";
            const Icon = byDrone ? Plane : UserRound;
            return (
              <li key={event.id} className="flex items-center justify-between gap-3 py-2.5">
                <Icon className={cn("size-4 shrink-0", byDrone ? "text-brand-2" : "text-muted-foreground")}
                  aria-label={byDrone ? t("drone.countCounted") : t("livestock.manual")} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{t(`lsEvent.${event.kind}` as TKey)} · {event.group_name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {format.dateTime(event.created_at)}
                    {event.confidence != null && ` · ${t("drone.countConfidence")} ${format.number(event.confidence * 100)}%`}
                    {event.note && ` · ${event.note}`}
                    {byDrone && event.mission_id && (
                      <> · <Link href={`/drone?mission=${event.mission_id}`} className="text-brand-2 hover:underline">{t("livestock.openFlight")}</Link></>
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={cn("block font-semibold tabular-nums",
                    event.change > 0 ? "text-brand-2" : event.change < 0 ? "text-danger" : "text-muted-foreground")}>
                    {event.change > 0 ? "+" : event.change < 0 ? "−" : "±"}{format.number(Math.abs(event.change))}
                  </span>
                  <span className="block text-xs text-muted-foreground tabular-nums">= {format.number(event.count_after)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function Content({ farm }: { farm: Farm }) {
  const { t } = useT();
  const query = useLivestock(farm.id);
  const remove = useDeleteLivestockGroup();
  const [dialog, setDialog] = useState<{ open: boolean; group?: LivestockGroup }>({ open: false });
  const [event, setEvent] = useState<{ group: LivestockGroup | null; mode: EventMode }>({ group: null, mode: "add" });
  const [deleting, setDeleting] = useState<LivestockGroup | null>(null);

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.success(t("livestock.deleted"));
    } catch (error) {
      toast.error(errorText(error, t("state.errorBody")));
    }
    setDeleting(null);
  };

  const addButton = <Button variant="outline" onClick={() => setDialog({ open: true })}><Plus className="size-4" /> {t("livestock.addGroup")}</Button>;
  const onPasture = query.data?.groups.some((g) => g.field_id);

  return (
    <>
      <PageHeader title={t("nav.livestock")} description={t("livestock.subtitle")} actions={<>
        {addButton}
        {onPasture && <Button asChild><Link href={droneHref()}><Plane className="size-4" /> {t("livestock.droneCount")}</Link></Button>}
      </>} />

      {query.isLoading ? <LoadingState /> : query.isError || !query.data ? <ErrorState error={query.error} onRetry={query.refetch} /> :
        query.data.groups.length === 0 ? (
          <EmptyState icon={PawPrint} title={t("livestock.emptyTitle")} body={t("livestock.emptyBody")}
            action={<Button onClick={() => setDialog({ open: true })}><Plus className="size-4" /> {t("livestock.addGroup")}</Button>} />
        ) : (
          <>
            {query.data.recent_events.some((e) => e.is_simulated) && (
              <DemoBadge className="mb-3" label={t("common.simulated")} tip={t("drone.countSim")} />
            )}
            <Summary data={query.data} />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {query.data.groups.map((group) => (
                <GroupCard key={group.id} group={group}
                  onEvent={(mode) => setEvent({ group, mode })}
                  onEdit={() => setDialog({ open: true, group })}
                  onDelete={() => setDeleting(group)} />
              ))}
            </div>
            <History data={query.data} />
          </>
        )}

      <GroupDialog open={dialog.open} group={dialog.group} farmId={farm.id}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
      {event.group && (
        <EventDialog key={`${event.group.id}-${event.mode}`} group={event.group} mode={event.mode}
          onClose={() => setEvent((e) => ({ ...e, group: null }))} />
      )}
      <ConfirmDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}
        title={t("livestock.deleteTitle", { name: deleting?.name ?? "" })} body={t("livestock.deleteBody")}
        confirmLabel={t("common.delete")} onConfirm={confirmDelete} />
    </>
  );
}

export default function LivestockPage() {
  return <FarmGate>{(farm) => <Content farm={farm} />}</FarmGate>;
}
