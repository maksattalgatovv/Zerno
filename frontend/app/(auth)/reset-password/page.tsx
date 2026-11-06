"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormField } from "@/components/shared/form-field";
import { errorText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { useT } from "@/providers/i18n-provider";

const schema = z.object({ password: z.string().min(8).max(128) });
type Values = z.infer<typeof schema>;

function ResetForm() {
  const { t } = useT();
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async ({ password }: Values) => {
    setFormError(null);
    try {
      await api("/auth/reset-password", { method: "POST", body: { token, password } });
      toast.success(t("auth.resetDone"));
      router.push("/login");
    } catch (error) {
      setFormError(errorText(error, t("state.errorBody")));
    }
  };

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t("auth.setNewPassword")}</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        <FormField id="password" label={t("settings.newPassword")} error={errors.password && t("validation.password")} hint={t("auth.passwordHint")}>
          <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
        </FormField>
        {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
        <Button type="submit" className="w-full" disabled={isSubmitting}>{t("common.save")}</Button>
      </form>
      <p className="mt-6 text-center"><Link href="/login" className="font-medium text-brand-2 hover:underline">{t("auth.backToLogin")}</Link></p>
    </>
  );
}

export default function ResetPasswordPage() {
  return <Suspense><ResetForm /></Suspense>;
}
