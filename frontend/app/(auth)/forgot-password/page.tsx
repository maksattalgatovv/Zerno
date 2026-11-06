"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormField } from "@/components/shared/form-field";
import { DemoBadge, errorText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import type { ForgotPasswordResult } from "@/lib/api/types";
import { useT } from "@/providers/i18n-provider";

const schema = z.object({ email: z.email() });
type Values = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const { t } = useT();
  const [result, setResult] = useState<ForgotPasswordResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: Values) => {
    setFormError(null);
    try {
      setResult(await api<ForgotPasswordResult>("/auth/forgot-password", { method: "POST", body: values }));
    } catch (error) {
      setFormError(errorText(error, t("state.errorBody")));
    }
  };

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t("auth.forgotTitle")}</h1>
      <p className="mt-1 text-muted-foreground">{t("auth.forgotBody")}</p>
      {result ? (
        <div className="mt-6 rounded-lg border bg-card p-4">
          <p>{t("auth.forgotSent")}</p>
          {result.dev_reset_token && (
            <div className="mt-3 border-t pt-3">
              <DemoBadge label={t("auth.noEmailService")} />
              <p className="mt-2 text-sm text-muted-foreground">{t("auth.devResetNote")}</p>
              <Button asChild className="mt-3 w-full">
                <Link href={`/reset-password?token=${encodeURIComponent(result.dev_reset_token)}`}>{t("auth.setNewPassword")}</Link>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
          <FormField id="email" label={t("auth.email")} error={errors.email && t("validation.email")}>
            <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register("email")} />
          </FormField>
          {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
          <Button type="submit" className="w-full" disabled={isSubmitting}>{t("auth.sendLink")}</Button>
        </form>
      )}
      <p className="mt-6 text-center"><Link href="/login" className="font-medium text-brand-2 hover:underline">{t("auth.backToLogin")}</Link></p>
    </>
  );
}
