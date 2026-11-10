"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Logo } from "@/components/layout/logo";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/providers/i18n-provider";

/**
 * The start page opens the app at once: the visitor's own farm if signed in, otherwise the
 * demo farm, so nobody has to find a demo button first. Sign-in and registration stay at
 * /login and /register, and the product page is at /about.
 */
export default function StartPage() {
  const { t } = useT();
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/dashboard" : "/login?demo=1");
  }, [loading, user, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-brand text-white">
      <Logo light />
      <p className="text-white/80" role="status">{t("common.loading")}</p>
    </div>
  );
}
