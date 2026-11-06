"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

// Leaflet touches `window`, so maps only load in the browser.
const loading = () => <Skeleton className="h-[420px] rounded-lg" />;

export const FarmMap = dynamic(() => import("./maps").then((m) => m.FarmMap), { ssr: false, loading });
export const FieldMiniMap = dynamic(() => import("./maps").then((m) => m.FieldMiniMap), { ssr: false, loading });
export const RouteMap = dynamic(() => import("./maps").then((m) => m.RouteMap), { ssr: false, loading });
export type { Selection } from "./maps";
