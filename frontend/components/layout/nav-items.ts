import {
  BarChart3, Bot, FileText, LayoutDashboard, Leaf, Map, PawPrint, Plane, Settings, Sprout, type LucideIcon,
} from "lucide-react";

import type { TKey } from "@/lib/i18n";

export type NavItem = { href: string; label: TKey; short: TKey; icon: LucideIcon };

/** The four everyday jobs. Always one tap away. */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/dashboard", label: "nav.dashboard", short: "tab.home", icon: LayoutDashboard },
  { href: "/fields", label: "nav.fields", short: "tab.fields", icon: Sprout },
  { href: "/drone", label: "nav.drone", short: "tab.drone", icon: Plane },
  { href: "/ai-doctor", label: "nav.doctor", short: "tab.photo", icon: Leaf },
];

/** Everything else, grouped so the first look at the app stays calm. */
export const MORE_NAV: NavItem[] = [
  { href: "/livestock", label: "nav.livestock", short: "nav.livestock", icon: PawPrint },
  { href: "/map", label: "nav.map", short: "nav.map", icon: Map },
  { href: "/assistant", label: "nav.assistant", short: "nav.assistant", icon: Bot },
  { href: "/analytics", label: "nav.analytics", short: "nav.analytics", icon: BarChart3 },
  { href: "/reports", label: "nav.reports", short: "nav.reports", icon: FileText },
  { href: "/settings", label: "nav.settings", short: "nav.settings", icon: Settings },
];

export const SOS_HREF = "/emergency";

export const isActivePath = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);
