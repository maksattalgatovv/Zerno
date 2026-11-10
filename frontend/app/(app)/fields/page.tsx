"use client";

import { Map, MapPin, MoreVertical, Pencil, Plus, Search, Sprout, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { FieldDialog } from "@/components/fields/field-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FarmGate } from "@/components/shared/farm-gate";
import { EmptyState, ErrorState, HealthBadge, InfoTip, LoadingState, PageHeader, errorText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDeleteField, useFields } from "@/lib/api/hooks";
import { CROP_TYPES, type Farm, type Field } from "@/lib/api/types";
import { useFormat } from "@/lib/hooks/use-format";
import type { TKey } from "@/lib/i18n";
import { useT } from "@/providers/i18n-provider";

const HEALTH_FILTERS = ["healthy", "attention", "critical", "unknown"] as const;

function FieldCard({ field, onEdit, onDelete }: { field: Field; onEdit: () => void; onDelete: () => void }) {
  const { t } = useT();
  const format = useFormat();
  return (
    <article className="relative rounded-lg border bg-card p-5 transition-colors hover:border-brand-2/50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">
            <Link href={`/fields/${field.id}`} className="after:absolute after:inset-0">{field.name}</Link>
          </h2>
          <p className="text-muted-foreground">{field.crop_label} · {format.area(field.area)}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="relative z-10" aria-label={t("common.actions")}><MoreVertical className="size-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}><Pencil className="size-4" /> {t("common.edit")}</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={onDelete}><Trash2 className="size-4" /> {t("common.delete")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <HealthBadge status={field.health_status} />
        <span className="text-sm text-muted-foreground">NDVI <span className="font-semibold text-foreground">{format.ndvi(field.ndvi_mean)}</span></span>
      </div>
      <dl className="mt-4 space-y-1 border-t pt-3 text-sm">
        <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{t("fields.lastCheck")}</dt><dd>{format.date(field.last_monitored_at)}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{t("fields.planted")}</dt><dd>{format.date(field.planting_date)}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{t("fields.openIssues")}</dt><dd>{field.open_anomalies}</dd></div>
      </dl>
    </article>
  );
}

function Content({ farm }: { farm: Farm }) {
  const { t } = useT();
  const query = useFields(farm.id);
  const remove = useDeleteField();
  const [search, setSearch] = useState("");
  const [crop, setCrop] = useState("all");
  const [health, setHealth] = useState("all");
  const [dialog, setDialog] = useState<{ open: boolean; field?: Field }>({ open: false });
  const [deleting, setDeleting] = useState<Field | null>(null);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (query.data ?? []).filter((field) =>
      (!term || field.name.toLowerCase().includes(term) || field.crop_label.toLowerCase().includes(term)) &&
      (crop === "all" || field.crop_type === crop) &&
      (health === "all" || field.health_status === health));
  }, [query.data, search, crop, health]);

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.success(t("fields.deleted"));
    } catch (error) {
      toast.error(errorText(error, t("state.errorBody")));
    }
    setDeleting(null);
  };

  return (
    <>
      <PageHeader title={t("nav.fields")} description={t("fields.subtitle")}
        actions={<>
          <Button asChild variant="outline"><Link href="/map"><Map className="size-4" /> {t("nav.map")}</Link></Button>
          <Button onClick={() => setDialog({ open: true })}><Plus className="size-4" /> {t("fields.add")}</Button>
        </>} />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1 sm:max-w-sm">
          <Search className="absolute top-3 left-3 size-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("fields.search")} aria-label={t("fields.search")} className="bg-card pl-9" />
        </div>
        <Select value={crop} onValueChange={setCrop}>
          <SelectTrigger className="w-44 bg-card" aria-label={t("fields.crop")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("fields.allCrops")}</SelectItem>
            {CROP_TYPES.map((item) => <SelectItem key={item} value={item}>{t(`crop.${item}` as TKey)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={health} onValueChange={setHealth}>
          <SelectTrigger className="w-52 bg-card" aria-label={t("fields.health")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("fields.allHealth")}</SelectItem>
            {HEALTH_FILTERS.map((item) => <SelectItem key={item} value={item}>{t(`health.${item}` as TKey)}</SelectItem>)}
          </SelectContent>
        </Select>
        <InfoTip text={t("common.ndviHint")} />
      </div>

      {query.isLoading ? <LoadingState /> : query.isError ? <ErrorState error={query.error} onRetry={query.refetch} /> :
        (query.data ?? []).length === 0 ? (
          <EmptyState icon={Sprout} title={t("fields.emptyTitle")} body={t("fields.emptyBody")}
            action={<Button onClick={() => setDialog({ open: true })}><Plus className="size-4" /> {t("fields.add")}</Button>} />
        ) : visible.length === 0 ? (
          <EmptyState icon={MapPin} title={t("fields.noMatch")} action={
            <Button variant="outline" onClick={() => { setSearch(""); setCrop("all"); setHealth("all"); }}>{t("fields.clearFilters")}</Button>
          } />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((field) => (
              <FieldCard key={field.id} field={field} onEdit={() => setDialog({ open: true, field })} onDelete={() => setDeleting(field)} />
            ))}
          </div>
        )}

      <FieldDialog open={dialog.open} field={dialog.field} farm={farm} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
      <ConfirmDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}
        title={t("fields.deleteTitle", { name: deleting?.name ?? "" })} body={t("fields.deleteBody")}
        confirmLabel={t("common.delete")} onConfirm={confirmDelete} />
    </>
  );
}

export default function FieldsPage() {
  return <FarmGate>{(farm) => <Content farm={farm} />}</FarmGate>;
}
