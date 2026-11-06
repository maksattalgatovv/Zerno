"use client";

import {
  BarChart3, Bot, FileText, LayoutDashboard, Leaf, Map, Plane, Settings, Sprout,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/layout/logo";
import type { TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useT } from "@/providers/i18n-provider";

const ITEMS: { href: string; label: TKey; icon: typeof Leaf }[] = [
  { href: "/dashboard", label: "nav.dashboard", icon: LayoutDashboard },
  { href: "/fields", label: "nav.fields", icon: Sprout },
  { href: "/map", label: "nav.map", icon: Map },
  { href: "/drone", label: "nav.drone", icon: Plane },
  { href: "/ai-doctor", label: "nav.doctor", icon: Leaf },
  { href: "/analytics", label: "nav.analytics", icon: BarChart3 },
  { href: "/assistant", label: "nav.assistant", icon: Bot },
  { href: "/reports", label: "nav.reports", icon: FileText },
  { href: "/settings", label: "nav.settings", icon: Settings },
];

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useT();
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <Link href="/dashboard" className="flex h-16 items-center px-5" onClick={onNavigate}>
        <Logo light />
      </Link>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2" aria-label={t("nav.main")}>
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link key={href} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-[15px] transition-colors",
                active ? "bg-sidebar-accent font-medium text-white" : "hover:bg-sidebar-accent/60 hover:text-white",
              )}>
              <Icon className={cn("size-[18px]", active && "text-lime")} />
              {t(label)}
            </Link>
          );
        })}
      </nav>
      <p className="px-5 py-4 text-sm text-sidebar-foreground/70">{t("brand.tagline")}</p>
    </div>
  );
}
