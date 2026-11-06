"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { SidebarContent } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/providers/auth-provider";
import { FarmProvider } from "@/providers/farm-provider";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (!user) {
    return <div className="p-8"><Skeleton className="h-64 rounded-lg" /></div>;
  }

  return (
    <FarmProvider>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 lg:block"><SidebarContent /></aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="mx-auto w-full max-w-[1320px] flex-1 p-4 md:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </FarmProvider>
  );
}
