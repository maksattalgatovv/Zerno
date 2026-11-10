"use client";

import { Siren } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/layout/logo";
import { MORE_NAV, PRIMARY_NAV, SOS_HREF, isActivePath, type NavItem } from "@/components/layout/nav-items";
import { cn } from "@/lib/utils";
import { useT } from "@/providers/i18n-provider";

function SidebarLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const { t } = useT();
  const active = isActivePath(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2.5 text-[15px] transition-colors",
        active ? "bg-sidebar-accent font-medium text-white" : "hover:bg-sidebar-accent/60 hover:text-white",
      )}>
      <Icon className={cn("size-[18px]", active && "text-lime")} />
      {t(item.label)}
    </Link>
  );
}

export function SidebarContent() {
  const { t } = useT();
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <Link href="/dashboard" className="flex h-16 items-center px-5"><Logo light /></Link>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2" aria-label={t("nav.main")}>
        {PRIMARY_NAV.map((item) => <SidebarLink key={item.href} item={item} />)}
        <p className="px-3 pt-5 pb-1.5 text-sm text-sidebar-foreground/60">{t("nav.more")}</p>
        {MORE_NAV.map((item) => <SidebarLink key={item.href} item={item} />)}
      </nav>
      <Link href={SOS_HREF} className="m-3 flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#B93636] font-semibold text-white hover:bg-[#A02E2E]">
        <Siren className="size-5" /> {t("nav.emergency")}
      </Link>
    </div>
  );
}
