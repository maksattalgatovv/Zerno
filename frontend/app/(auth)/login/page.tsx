"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Sprout } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormField } from "@/components/shared/form-field";
import { errorText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api/client";
import type { Token } from "@/lib/api/types";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/providers/i18n-provider";

/** Only same-site paths, so a crafted link can't send the visitor elsewhere after sign-in. */
const safeNext = (value: string | null) => (value?.startsWith("/") && !value.startsWith("//") ? value : "/dashboard");

const schema = z.object({ email: z.email(), password: z.string().min(1) });
type Values = z.infer<typeof schema>;

function LoginForm() {
  const { t } = useT();
  const { signIn } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const autoStarted = useRef(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: Values) => {
    setFormError(null);
    try {
      const { access_token } = await api<Token>("/auth/login", { method: "POST", body: values });
      await signIn(access_token);
      router.push(safeNext(params.get("next")));
    } catch (error) {
      setFormError(errorText(error, t("state.errorBody")));
    }
  };

  const demo = useCallback(async () => {
    setFormError(null);
    setDemoBusy(true);
    try {
      const { access_token } = await api<Token>("/auth/demo", { method: "POST" });
      await signIn(access_token);
      router.replace(safeNext(params.get("next")));
    } catch (error) {
      setFormError(errorText(error, t("state.errorBody")));
      setDemoBusy(false);
    }
  }, [router, signIn, t, params]);

  useEffect(() => {
    if (params.get("demo") && !autoStarted.current) {
      autoStarted.current = true;
      void demo();
    }
  }, [params, demo]);

  // Opening the demo automatically: show progress, not a sign-in form nobody needs to fill in.
  if (params.get("demo") && !formError) {
    return (
      <div className="flex flex-col items-center gap-3 text-center" role="status">
        <Sprout className="size-8 animate-pulse text-brand-2" />
        <p className="text-lg font-medium">{t("auth.openingDemo")}</p>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t("auth.loginTitle")}</h1>
      <p className="mt-1 text-muted-foreground">{t("auth.loginBody")}</p>

      <Button variant="secondary" className="mt-6 w-full" onClick={demo} disabled={demoBusy}>
        <Sprout className="size-4" /> {demoBusy ? t("common.loading") : t("auth.demo")}
      </Button>
      <p className="mt-2 text-sm text-muted-foreground">{t("auth.demoHint")}</p>

      <div className="my-5 flex items-center gap-3 text-sm text-muted-foreground">
        <Separator className="flex-1" /> {t("auth.or")} <Separator className="flex-1" />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField id="email" label={t("auth.email")} error={errors.email && t("validation.email")}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register("email")} />
        </FormField>
        <FormField id="password" label={t("auth.password")} error={errors.password && t("validation.required")}>
          <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...register("password")} />
        </FormField>
        <div className="text-right">
          <Link href="/forgot-password" className="text-sm text-brand-2 hover:underline">{t("auth.forgot")}</Link>
        </div>
        {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
        <Button type="submit" className="w-full" disabled={isSubmitting}>{t("auth.signIn")}</Button>
      </form>

      <p className="mt-6 text-center text-muted-foreground">
        {t("auth.noAccount")} <Link href="/register" className="font-medium text-brand-2 hover:underline">{t("auth.register")}</Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
