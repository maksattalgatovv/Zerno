"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormField } from "@/components/shared/form-field";
import { errorText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useSaveFarm } from "@/lib/api/hooks";
import type { Farm } from "@/lib/api/types";
import { useT } from "@/providers/i18n-provider";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  region: z.string().trim().min(2).max(120),
  location: z.string().trim().max(200),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});
type Input_ = z.input<typeof schema>;
type Values = z.output<typeof schema>;

export function FarmDialog({ open, onOpenChange, farm }: { open: boolean; onOpenChange: (open: boolean) => void; farm?: Farm }) {
  const { t } = useT();
  const save = useSaveFarm();
  const { register, reset, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<Input_, unknown, Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (open) {
      reset({
        name: farm?.name ?? "", region: farm?.region ?? "", location: farm?.location ?? "",
        latitude: farm?.latitude ?? 51.7, longitude: farm?.longitude ?? 71.1,
      });
    }
  }, [open, farm, reset]);

  const onSubmit = async (values: Values) => {
    try {
      await save.mutateAsync({ id: farm?.id, body: { ...values, main_crop: "wheat" } });
      toast.success(t("settings.saved"));
      onOpenChange(false);
    } catch (error) {
      toast.error(errorText(error, t("state.errorBody")));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t(farm ? "farm.edit" : "farm.create")}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField id="farm-name" label={t("farm.name")} error={errors.name && t("validation.name")}>
            <Input id="farm-name" aria-invalid={!!errors.name} {...register("name")} />
          </FormField>
          <FormField id="farm-region" label={t("fields.region")} error={errors.region && t("validation.required")}>
            <Input id="farm-region" aria-invalid={!!errors.region} {...register("region")} />
          </FormField>
          <FormField id="farm-location" label={t("farm.location")}>
            <Input id="farm-location" {...register("location")} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="farm-lat" label={t("fields.latitude")} error={errors.latitude && t("validation.latitude")}>
              <Input id="farm-lat" type="number" step="any" {...register("latitude")} />
            </FormField>
            <FormField id="farm-lng" label={t("fields.longitude")} error={errors.longitude && t("validation.longitude")}>
              <Input id="farm-lng" type="number" step="any" {...register("longitude")} />
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={isSubmitting}>{t("common.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
