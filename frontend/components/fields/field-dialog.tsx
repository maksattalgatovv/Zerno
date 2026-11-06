"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormField } from "@/components/shared/form-field";
import { errorText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSaveField } from "@/lib/api/hooks";
import { CROP_TYPES, type Farm, type Field } from "@/lib/api/types";
import { convertArea, haToAcres } from "@/lib/format";
import { useFormat } from "@/lib/hooks/use-format";
import type { TKey } from "@/lib/i18n";
import { useT } from "@/providers/i18n-provider";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  region: z.string().trim().max(120),
  area: z.coerce.number().positive().max(250000),
  crop_type: z.enum(CROP_TYPES),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  planting_date: z.string(),
});
type Input_ = z.input<typeof schema>;
type Values = z.output<typeof schema>;

export function FieldDialog({ open, onOpenChange, farm, field }: {
  open: boolean; onOpenChange: (open: boolean) => void; farm: Farm; field?: Field;
}) {
  const { t } = useT();
  const format = useFormat();
  const save = useSaveField(farm.id);
  const { register, control, reset, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<Input_, unknown, Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!open) return;
    reset({
      name: field?.name ?? "",
      region: field?.region ?? farm.region,
      area: field ? Math.round(convertArea(field.area, format.units) * 100) / 100 : ("" as unknown as number),
      crop_type: field?.crop_type ?? "wheat",
      latitude: field?.center_lat ?? farm.latitude,
      longitude: field?.center_lng ?? farm.longitude,
      planting_date: field?.planting_date ?? "",
    });
  }, [open, field, farm, reset, format.units]);

  const onSubmit = async (values: Values) => {
    const area = format.units === "imperial" ? values.area / haToAcres(1) : values.area;
    try {
      await save.mutateAsync({
        id: field?.id,
        body: { ...values, area: Math.round(area * 100) / 100, planting_date: values.planting_date || null },
      });
      toast.success(t(field ? "fields.saved" : "fields.created"));
      onOpenChange(false);
    } catch (error) {
      toast.error(errorText(error, t("state.errorBody")));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(field ? "fields.edit" : "fields.add")}</DialogTitle>
          <DialogDescription>{t("fields.formHint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField id="name" label={t("fields.name")} error={errors.name && t("validation.name")}>
            <Input id="name" aria-invalid={!!errors.name} {...register("name")} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="area" label={`${t("fields.area")} (${t(format.units === "metric" ? "unit.ha" : "unit.ac")})`}
              error={errors.area && t("validation.area")}>
              <Input id="area" type="number" step="0.1" min="0" aria-invalid={!!errors.area} {...register("area")} />
            </FormField>
            <FormField id="crop" label={t("fields.crop")}>
              <Controller control={control} name="crop_type" render={({ field: f }) => (
                <Select value={f.value} onValueChange={f.onChange}>
                  <SelectTrigger id="crop" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CROP_TYPES.map((crop) => <SelectItem key={crop} value={crop}>{t(`crop.${crop}` as TKey)}</SelectItem>)}
                  </SelectContent>
                </Select>
              )} />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="region" label={t("fields.region")}>
              <Input id="region" {...register("region")} />
            </FormField>
            <FormField id="planting" label={t("fields.planted")}>
              <Input id="planting" type="date" {...register("planting_date")} />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="lat" label={t("fields.latitude")} error={errors.latitude && t("validation.latitude")}>
              <Input id="lat" type="number" step="any" aria-invalid={!!errors.latitude} {...register("latitude")} />
            </FormField>
            <FormField id="lng" label={t("fields.longitude")} error={errors.longitude && t("validation.longitude")}>
              <Input id="lng" type="number" step="any" aria-invalid={!!errors.longitude} {...register("longitude")} />
            </FormField>
          </div>
          <p className="text-sm text-muted-foreground">{t("fields.shapeNote")}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={isSubmitting}>{t("common.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
