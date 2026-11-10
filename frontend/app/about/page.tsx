"use client";

import {
  ArrowRight, Bot, Droplets, FileText, Languages, Leaf, Map, Plane, ScanSearch, ShieldCheck, Sprout, TimerReset,
} from "lucide-react";
import Link from "next/link";

import { SurveyVisual } from "@/components/landing/survey-visual";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import type { TKey } from "@/lib/i18n";
import { useT } from "@/providers/i18n-provider";

const FEATURES: { icon: typeof Map; title: TKey; body: TKey }[] = [
  { icon: Map, title: "landing.f1Title", body: "landing.f1Body" },
  { icon: Plane, title: "landing.f2Title", body: "landing.f2Body" },
  { icon: Leaf, title: "landing.f3Title", body: "landing.f3Body" },
  { icon: Bot, title: "landing.f4Title", body: "landing.f4Body" },
  { icon: FileText, title: "landing.f5Title", body: "landing.f5Body" },
  { icon: Languages, title: "landing.f6Title", body: "landing.f6Body" },
];

const STEPS: { title: TKey; body: TKey }[] = [
  { title: "landing.s1Title", body: "landing.s1Body" },
  { title: "landing.s2Title", body: "landing.s2Body" },
  { title: "landing.s3Title", body: "landing.s3Body" },
  { title: "landing.s4Title", body: "landing.s4Body" },
];

const BENEFITS: { icon: typeof Map; title: TKey; body: TKey }[] = [
  { icon: TimerReset, title: "landing.b1Title", body: "landing.b1Body" },
  { icon: Droplets, title: "landing.b2Title", body: "landing.b2Body" },
  { icon: Sprout, title: "landing.b3Title", body: "landing.b3Body" },
  { icon: ShieldCheck, title: "landing.b4Title", body: "landing.b4Body" },
];

export default function LandingPage() {
  const { t } = useT();
  return (
    <div className="bg-background">
      <div className="bg-brand text-white">
        <header className="mx-auto flex h-20 max-w-[1240px] items-center justify-between px-4 md:px-8">
          <Link href="/about"><Logo light /></Link>
          <nav className="hidden items-center gap-7 text-[15px] text-white/80 md:flex">
            <a href="#features" className="hover:text-white">{t("landing.navFeatures")}</a>
            <a href="#how" className="hover:text-white">{t("landing.navHow")}</a>
            <a href="#technology" className="hover:text-white">{t("landing.navTech")}</a>
            <a href="#benefits" className="hover:text-white">{t("landing.navBenefits")}</a>
          </nav>
          <div className="flex items-center gap-1">
            <LanguageSwitcher dark />
            <Button asChild variant="ghost" size="sm" className="text-white hover:bg-white/10 hover:text-white">
              <Link href="/login">{t("auth.signIn")}</Link>
            </Button>
          </div>
        </header>

        <section className="mx-auto grid max-w-[1240px] items-center gap-10 px-4 pt-10 pb-16 md:px-8 lg:grid-cols-[1fr_1.15fr] lg:pt-16 lg:pb-24">
          <div>
            <p className="font-medium text-lime">{t("brand.tagline")}</p>
            <h1 className="mt-4 text-[44px] leading-[1.05] font-semibold tracking-tight md:text-6xl">{t("landing.heroTitle")}</h1>
            <p className="mt-6 max-w-xl text-lg text-white/80">{t("landing.heroBody")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-lime text-brand hover:bg-lime/85">
                <Link href="/login?demo=1">{t("landing.ctaPrimary")} <ArrowRight className="size-5" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
                <a href="#technology">{t("landing.ctaSecondary")}</a>
              </Button>
            </div>
          </div>
          <SurveyVisual />
        </section>
      </div>

      <section id="features" className="mx-auto max-w-[1240px] scroll-mt-8 px-4 py-20 md:px-8">
        <h2 className="max-w-2xl text-3xl font-semibold tracking-tight md:text-4xl">{t("landing.featuresTitle")}</h2>
        <div className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="border-t border-border pt-5">
              <Icon className="size-6 text-brand-2" />
              <h3 className="mt-3 text-lg font-semibold">{t(title)}</h3>
              <p className="mt-1.5 text-muted-foreground">{t(body)}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="scroll-mt-8 bg-card py-20">
        <div className="mx-auto max-w-[1240px] px-4 md:px-8">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{t("landing.howTitle")}</h2>
          <ol className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ title, body }, index) => (
              <li key={title}>
                <span className="flex size-10 items-center justify-center rounded-full bg-brand font-semibold text-lime">{index + 1}</span>
                <h3 className="mt-4 text-lg font-semibold">{t(title)}</h3>
                <p className="mt-1.5 text-muted-foreground">{t(body)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="technology" className="mx-auto grid max-w-[1240px] scroll-mt-8 items-start gap-12 px-4 py-20 md:px-8 lg:grid-cols-2">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{t("landing.aiTitle")}</h2>
          <p className="mt-4 text-lg text-muted-foreground">{t("landing.aiBody")}</p>
          <ul className="mt-6 space-y-3">
            {(["landing.ai1", "landing.ai2", "landing.ai3", "landing.ai4"] as TKey[]).map((key) => (
              <li key={key} className="flex gap-3">
                <ScanSearch className="mt-0.5 size-5 shrink-0 text-brand-2" />
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm text-muted-foreground">{t("landing.ndviCaption")}</p>
          <p className="mt-2 font-mono text-xl font-medium text-brand md:text-2xl">NDVI = (NIR − RED) / (NIR + RED)</p>
          <div className="mt-6 space-y-3">
            {[
              { range: "0.60 – 1.00", label: t("health.healthy"), width: "78%", color: "bg-brand-2" },
              { range: "0.40 – 0.60", label: t("health.attention"), width: "48%", color: "bg-warn" },
              { range: "< 0.40", label: t("health.critical"), width: "24%", color: "bg-danger" },
            ].map((row) => (
              <div key={row.range}>
                <div className="flex justify-between text-sm"><span className="font-medium">{row.label}</span><span className="text-muted-foreground">{row.range}</span></div>
                <div className="mt-1 h-2 rounded-sm bg-muted"><div className={`h-2 rounded-sm ${row.color}`} style={{ width: row.width }} /></div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted-foreground">{t("landing.ndviNote")}</p>
        </div>
      </section>

      <section id="benefits" className="scroll-mt-8 bg-brand py-20 text-white">
        <div className="mx-auto max-w-[1240px] px-4 md:px-8">
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight md:text-4xl">{t("landing.benefitsTitle")}</h2>
          <div className="mt-12 grid gap-8 md:grid-cols-2">
            {BENEFITS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-4">
                <Icon className="mt-0.5 size-6 shrink-0 text-lime" />
                <div>
                  <h3 className="text-lg font-semibold">{t(title)}</h3>
                  <p className="mt-1 text-white/75">{t(body)}</p>
                </div>
              </div>
            ))}
          </div>
          <Button asChild size="lg" className="mt-12 bg-lime text-brand hover:bg-lime/85">
            <Link href="/login?demo=1">{t("landing.ctaPrimary")} <ArrowRight className="size-5" /></Link>
          </Button>
        </div>
      </section>

      <footer className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-4 py-8 text-muted-foreground md:px-8">
        <Logo />
        <p className="text-sm">{t("landing.footer")}</p>
      </footer>
    </div>
  );
}
