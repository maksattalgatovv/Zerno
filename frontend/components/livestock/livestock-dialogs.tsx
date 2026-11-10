"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormField } from "@/components/shared/form-field";
import { errorText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useFields, useLivestockEvent, useSaveLivestockGroup } from "@/lib/api/hooks";
import { SPECIES, type LivestockGroup, type ManualEventKind } from "@/lib/api/types";
import { useFormat } from "@/lib/hooks/use-format";
import type { TKey } from "@/lib/i18n";
import { useT } from "@/providers/i18n-provider";

const MAX_HEADS = 1_000_000;
const INDOORS = "none";

const groupSchema = z.object({
  species: z.enum(SPECIES),
  name: z.string().trim().min(1).max(120),
  head_count: z.coerce.number().int().min(0).max(MAX_HEADS),
  notes: z.string().trim().max(2000),
  field_id: z.string(),
});

export function GroupDialog({ open, onOpenChange, farmId, group }: {
  open: boolean; onOpenChange: (open: boolean) => void; farmId: string; group?: LivestockGroup;
}) {
  const { t } = useT();
  const save = useSaveLivestockGroup(farmId);
  const fields = useFields(farmId);
  // Pastures first, then the other fields: animals sometimes graze stubble after harvest.
  const pastures = [...(fields.data ?? [])].sort((a, b) => Number(b.crop_type === "pasture") - Number(a.crop_type === "pasture"));
  const { register, control, reset, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<z.input<typeof groupSchema>, unknown, z.output<typeof groupSchema>>({ resolver: zodResolver(groupSchema) });

  useEffect(() => {
    if (!open) return;
    reset({
      species: group?.species ?? "cattle",
      name: group?.name ?? "",
      head_count: group?.head_count ?? ("" as unknown as number),
      notes: group?.notes ?? "",
      field_id: group ? (group.field_id ?? INDOORS) : (fields.data?.find((f) => f.crop_type === "pasture")?.id ?? INDOORS),
    });
  }, [open, group, reset, fields.data]);

  const onSubmit = async ({ field_id, ...values }: z.output<typeof groupSchema>) => {
    try {
      await save.mutateAsync({ id: group?.id, body: { ...values, field_id: field_id === INDOORS ? null : field_id } });
      toast.success(t(group ? "livestock.saved" : "livestock.created"));
      onOpenChange(false);
    } catch (error) {
      toast.error(errorText(error, t("state.errorBody")));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(group ? "livestock.editGroup" : "livestock.addGroup")}</DialogTitle>
          <DialogDescription>{t("livestock.formHint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="species" label={t("livestock.species")}>
              <Controller control={control} name="species" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="species" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SPECIES.map((s) => <SelectItem key={s} value={s}>{t(`species.${s}` as TKey)}</SelectItem>)}
                  </SelectContent>
                </Select>
              )} />
            </FormField>
            <FormField id="count" label={t("livestock.startCount")} error={errors.head_count && t("validation.required")}
              hint={group ? t("livestock.countLocked") : undefined}>
              <Input id="count" type="number" min="0" step="1" inputMode="numeric" disabled={!!group}
                aria-invalid={!!errors.head_count} {...register("head_count")} />
            </FormField>
          </div>
          <FormField id="pasture" label={t("livestock.pasture")} hint={t("livestock.pastureHint")}>
            <Controller control={control} name="field_id" render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="pasture" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {pastures.map((f) => <SelectItem key={f.id} value={f.id}>{f.name} · {f.crop_label}</SelectItem>)}
                  <SelectItem value={INDOORS}>{t("livestock.noPasture")}</SelectItem>
                </SelectContent>
              </Select>
            )} />
          </FormField>
          <FormField id="group-name" label={t("livestock.name")} error={errors.name && t("validation.required")}>
            <Input id="group-name" aria-invalid={!!errors.name} {...register("name")} />
          </FormField>
          <FormField id="notes" label={t("livestock.notes")}>
            <Textarea id="notes" rows={2} {...register("notes")} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={isSubmitting}>{t("common.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type EventMode = "add" | "remove" | "recount";

const KINDS: Record<EventMode, ManualEventKind[]> = {
  add: ["birth", "purchase"],
  remove: ["sale", "death"],
  recount: ["recount"],
};

/** Mount with a `key` per group and mode, so each opening starts from a clean form. */
export function EventDialog({ group, mode, onClose }: {
  group: LivestockGroup; mode: EventMode; onClose: () => void;
}) {
  const { t } = useT();
  const format = useFormat();
  const record = useLivestockEvent();
  const [kind, setKind] = useState<ManualEventKind>(KINDS[mode][0]);
  const [quantity, setQuantity] = useState(mode === "recount" ? String(group.head_count) : "");
  const [note, setNote] = useState("");

  const current = group.head_count;
  const amount = Number(quantity);
  const valid = quantity !== "" && Number.isInteger(amount) && amount >= (mode === "recount" ? 0 : 1) && amount <= MAX_HEADS;
  const after = mode === "recount" ? amount : mode === "add" ? current + amount : current - amount;
  const tooMany = mode === "remove" && valid && after < 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || tooMany) return;
    try {
      await record.mutateAsync({ id: group.id, body: { kind, quantity: amount, note: note.trim() } });
      toast.success(t("livestock.recorded"));
      onClose();
    } catch (error) {
      toast.error(errorText(error, t("state.errorBody")));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("livestock.eventTitle", { name: group.name })}</DialogTitle>
          <DialogDescription>{t("livestock.eventHint", { n: format.number(current) })}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {mode !== "recount" && (
            <FormField id="reason" label={t("livestock.reason")}>
              <Select value={kind} onValueChange={(value) => setKind(value as ManualEventKind)}>
                <SelectTrigger id="reason" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KINDS[mode].map((k) => <SelectItem key={k} value={k}>{t(`lsEvent.${k}` as TKey)}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
          )}
          <FormField id="quantity" label={t(mode === "recount" ? "livestock.newTotal" : "livestock.quantity")}
            error={tooMany ? t("livestock.tooMany", { n: format.number(current) }) : undefined}
            hint={valid && !tooMany ? t("livestock.after", { n: format.number(after) }) : undefined}>
            <Input id="quantity" type="number" min="0" step="1" inputMode="numeric" autoFocus
              value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-invalid={tooMany} />
          </FormField>
          <FormField id="note" label={t("livestock.note")}>
            <Input id="note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={!valid || tooMany || record.isPending}>{t("common.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
