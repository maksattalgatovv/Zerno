"use client";

import { Globe } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LANGUAGES, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/providers/i18n-provider";

export function useChangeLanguage() {
  const { setLang } = useT();
  const { user, update } = useAuth();
  return (next: Lang) => {
    setLang(next);
    if (user) void update({ language: next });
  };
}

export function LanguageSwitcher({ dark }: { dark?: boolean }) {
  const { lang, t } = useT();
  const change = useChangeLanguage();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t("settings.language")}
          className={cn(dark && "text-white hover:bg-white/10 hover:text-white aria-expanded:bg-white/10 aria-expanded:text-white")}>
          <Globe className="size-4" />
          {lang.toUpperCase()}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LANGUAGES.map((item) => (
          <DropdownMenuItem key={item.code} onSelect={() => change(item.code)}>{item.label}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
