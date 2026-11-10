"use client";

import { Siren } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useEmergencies } from "@/lib/api/hooks";
import { useFarm } from "@/providers/farm-provider";
import { useT } from "@/providers/i18n-provider";

/** An open emergency stays visible on every screen until a person closes it. */
export function EmergencyBanner() {
  const { t } = useT();
  const pathname = usePathname();
  const { farm } = useFarm();
  const { data } = useEmergencies(farm?.id);
  const active = data?.find((item) => item.status === "active");
  if (!active || pathname === "/emergency") return null;
  return (
    <Link href="/emergency" className="mb-4 flex items-center gap-3 rounded-lg bg-[#B93636] p-4 font-medium text-white">
      <Siren className="size-5 shrink-0" />
      <span>{t("emergency.banner", { title: active.title })}</span>
    </Link>
  );
}
