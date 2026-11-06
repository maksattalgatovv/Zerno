"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormField } from "@/components/shared/form-field";
import { errorText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import type { Token } from "@/lib/api/types";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/providers/i18n-provider";

const schema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.email(),
    password: z.string().min(8).max(128),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"] });
type Values = z.infer<typeof schema>;

export default function RegisterPage() {
  const { t, lang } = useT();
  const { signIn } = useAuth();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async ({ name, email, password }: Values) => {
    setFormError(null);
    try {
      const { access_token } = await api<Token>("/auth/register", {
        method: "POST", body: { name, email, password, language: lang },
      });
      await signIn(access_token);
      router.push("/dashboard");
    } catch (error) {
      setFormError(errorText(error, t("state.errorBody")));
    }
  };

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t("auth.registerTitle")}</h1>
      <p className="mt-1 text-muted-foreground">{t("auth.registerBody")}</p>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        <FormField id="name" label={t("auth.name")} error={errors.name && t("validation.name")}>
          <Input id="name" autoComplete="name" aria-invalid={!!errors.name} {...register("name")} />
        </FormField>
        <FormField id="email" label={t("auth.email")} error={errors.email && t("validation.email")}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register("email")} />
        </FormField>
        <FormField id="password" label={t("auth.password")} error={errors.password && t("validation.password")} hint={t("auth.passwordHint")}>
          <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register("password")} />
        </FormField>
        <FormField id="confirm" label={t("auth.confirm")} error={errors.confirm && t("validation.match")}>
          <Input id="confirm" type="password" autoComplete="new-password" aria-invalid={!!errors.confirm} {...register("confirm")} />
        </FormField>
        {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
        <Button type="submit" className="w-full" disabled={isSubmitting}>{t("auth.createAccount")}</Button>
      </form>
      <p className="mt-6 text-center text-muted-foreground">
        {t("auth.haveAccount")} <Link href="/login" className="font-medium text-brand-2 hover:underline">{t("auth.signIn")}</Link>
      </p>
    </>
  );
}
