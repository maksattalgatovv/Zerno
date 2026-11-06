"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Logo } from "@/components/layout/logo";
import { useT } from "@/providers/i18n-provider";

export default function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useT();
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <aside className="hidden flex-col justify-between bg-brand p-10 text-white lg:flex">
        <Link href="/"><Logo light /></Link>
        <div>
          <p className="max-w-md text-3xl leading-tight font-semibold tracking-tight">{t("auth.sideTitle")}</p>
          <p className="mt-3 max-w-md text-white/75">{t("auth.sideBody")}</p>
        </div>
        <p className="text-sm text-white/60">{t("brand.tagline")}</p>
      </aside>
      <main className="flex flex-col p-4 md:p-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="lg:invisible"><Logo /></Link>
          <LanguageSwitcher />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-8">{children}</div>
      </main>
    </div>
  );
}
