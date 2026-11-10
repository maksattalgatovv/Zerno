"use client";

import { Bell, CheckCheck, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { DemoBadge } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNotifications, useReadNotification } from "@/lib/api/hooks";
import type { Notification } from "@/lib/api/types";
import { useFormat } from "@/lib/hooks/use-format";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useT } from "@/providers/i18n-provider";

const SEVERITY_DOT: Record<Notification["severity"], string> = {
  info: "bg-[#3F6FB5]",
  success: "bg-brand-2",
  warning: "bg-warn",
  critical: "bg-danger",
};

function NotificationCenter() {
  const { t } = useT();
  const format = useFormat();
  const router = useRouter();
  const { data = [] } = useNotifications();
  const read = useReadNotification();
  const unread = data.filter((n) => !n.read).length;

  const open = (item: Notification) => {
    if (!item.read) read.mutate(item.id);
    if (item.link) router.push(item.link);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t("notifications.title")}>
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 flex size-[18px] items-center justify-center rounded-full bg-danger text-[11px] font-semibold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(380px,calc(100vw-2rem))]">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="font-semibold">{t("notifications.title")}</span>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={() => read.mutate(undefined)}>
              <CheckCheck className="size-4" /> {t("notifications.readAll")}
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-96 overflow-y-auto">
          {data.length === 0 && <p className="px-2 py-6 text-center text-muted-foreground">{t("notifications.empty")}</p>}
          {data.map((item) => (
            <DropdownMenuItem key={item.id} onSelect={() => open(item)} className="items-start gap-3 py-2.5">
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", SEVERITY_DOT[item.severity])} />
              <span className="min-w-0">
                <span className={cn("block text-sm", !item.read && "font-semibold")}>{item.title}</span>
                <span className="block text-sm whitespace-normal text-muted-foreground">{item.message}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{format.ago(item.created_at)}</span>
              </span>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Topbar() {
  const { t } = useT();
  const { user, signOut } = useAuth();
  const { farm, farms, selectFarm } = useFarm();

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-2 border-b bg-card px-4 lg:px-6">
      {farm && farms.length === 1 && <span className="min-w-0 truncate font-semibold">{farm.name}</span>}
      {farm && farms.length > 1 && (
        <Select value={farm.id} onValueChange={selectFarm}>
          <SelectTrigger className="w-44 min-w-0 sm:w-60" aria-label={t("topbar.farm")}><SelectValue /></SelectTrigger>
          <SelectContent>
            {farms.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      {user?.is_demo && <DemoBadge label={t("topbar.demoAccount")} tip={t("topbar.demoTip")} className="hidden sm:inline-flex" />}
      {user?.is_demo && (
        <Button variant="link" size="sm" className="hidden px-1 text-brand-2 md:inline-flex" onClick={signOut}>{t("topbar.ownAccount")}</Button>
      )}

      <div className="ml-auto flex items-center gap-1">
        <LanguageSwitcher />
        <NotificationCenter />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t("topbar.profile")}>
              <span className="flex size-8 items-center justify-center rounded-full bg-brand text-sm font-medium text-white">
                {user ? initials(user.name) : ""}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <span className="block font-medium text-foreground">{user?.name}</span>
              <span className="block truncate text-muted-foreground">{user?.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link href="/settings"><Settings className="size-4" /> {t("nav.settings")}</Link></DropdownMenuItem>
            <DropdownMenuItem onSelect={signOut}><LogOut className="size-4" /> {t("topbar.signOut")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
