"use client";

import { Warehouse } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { EmptyState, ErrorState, LoadingState } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import type { Farm } from "@/lib/api/types";
import { useFarm } from "@/providers/farm-provider";
import { useT } from "@/providers/i18n-provider";

/** Handles loading, error and no-farm states for every farm-scoped page. */
export function FarmGate({ children }: { children: (farm: Farm) => ReactNode }) {
  const { farm, loading, error, retry } = useFarm();
  const { t } = useT();
  if (loading) return <LoadingState />;
  if (error) return <ErrorState onRetry={retry} />;
  if (!farm) {
    return (
      <EmptyState icon={Warehouse} title={t("farm.emptyTitle")} body={t("farm.emptyBody")}
        action={<Button asChild><Link href="/settings?tab=farms">{t("farm.create")}</Link></Button>} />
    );
  }
  return <>{children(farm)}</>;
}
