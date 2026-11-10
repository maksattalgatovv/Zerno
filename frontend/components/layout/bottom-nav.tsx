"use client";

import { Menu, Siren } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { MORE_NAV, PRIMARY_NAV, SOS_HREF, isActivePath } from "@/components/layout/nav-items";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useT } from "@/providers/i18n-provider";

const TAB = "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs";

/** Phone navigation: reachable with one thumb, with labels so icons never need guessing. */
export function BottomNav() {
  const pathname = usePathname();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const moreActive = MORE_NAV.some((item) => isActivePath(pathname, item.href));

  return (
    <nav aria-label={t("nav.main")}
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
      {PRIMARY_NAV.map((item) => {
        const active = isActivePath(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
            className={cn(TAB, active ? "font-semibold text-brand" : "text-muted-foreground")}>
            <Icon className="size-[22px]" />
            {t(item.short)}
          </Link>
        );
      })}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button type="button" className={cn(TAB, moreActive ? "font-semibold text-brand" : "text-muted-foreground")}>
            <Menu className="size-[22px]" />
            {t("nav.more")}
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-xl pb-[env(safe-area-inset-bottom)]">
          <SheetTitle className="px-5 pt-5 text-lg">{t("nav.more")}</SheetTitle>
          <ul className="px-3 pb-4">
            {MORE_NAV.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link href={item.href} onClick={() => setOpen(false)}
                    className="flex min-h-12 items-center gap-3 rounded-md px-2 text-base hover:bg-muted">
                    <Icon className="size-5 text-brand-2" />
                    {t(item.label)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>
      <Link href={SOS_HREF} className={cn(TAB, "bg-[#B93636] font-semibold text-white")}>
        <Siren className="size-[22px]" />
        SOS
      </Link>
    </nav>
  );
}
