"use client";

import L from "leaflet";
import { useEffect, type ReactNode } from "react";
import {
  CircleMarker, MapContainer, Marker, Polygon, Polyline, TileLayer, Tooltip, useMap,
} from "react-leaflet";

import type { Field, Health, MapData, Mission } from "@/lib/api/types";
import { cn } from "@/lib/utils";

type LatLng = [number, number];

export const HEALTH_COLORS: Record<Health, string> = {
  healthy: "#2E8058", attention: "#E8A23A", critical: "#D95757", unknown: "#778078",
};

const TILES = {
  street: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors",
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
  },
};

/** Leaflet measures itself once, but layout can settle later, especially on phones. */
function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  const key = JSON.stringify(points);
  useEffect(() => {
    const fit = () => {
      map.invalidateSize();
      if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom: 16 });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(map.getContainer());
    return () => observer.disconnect();
    // The serialised key is what should trigger a refit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

function BaseMap({ points, base = "satellite", className, children }: {
  points: LatLng[]; base?: keyof typeof TILES; className?: string; children: ReactNode;
}) {
  const first = points[0] ?? [51.7, 71.1];
  return (
    <div className={cn("isolate overflow-hidden rounded-lg border bg-muted", className)}>
      <MapContainer center={first} zoom={14} className="h-full w-full bg-muted" scrollWheelZoom>
        <TileLayer key={base} {...TILES[base]} maxZoom={19} />
        <FitBounds points={points} />
        {children}
      </MapContainer>
    </div>
  );
}

export type Selection = { kind: "field" | "zone" | "anomaly"; id: string } | null;

export function FarmMap({ data, selection, onSelect, showZones, base, labels }: {
  data: MapData;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  showZones: boolean;
  base: keyof typeof TILES;
  labels: { boundary: string };
}) {
  const points = data.boundary.length ? data.boundary as LatLng[] : [data.center as LatLng];
  const isSelected = (kind: string, id: string) => selection?.kind === kind && selection.id === id;

  return (
    <BaseMap points={points} base={base} className="h-[60vh] min-h-[420px] lg:h-[640px]">
      {data.boundary.length > 0 && (
        <Polygon positions={data.boundary as LatLng[]} interactive={false}
          pathOptions={{ color: "#fff", weight: 1.5, dashArray: "6 6", fill: false }}>
          <Tooltip sticky>{labels.boundary}</Tooltip>
        </Polygon>
      )}
      {data.fields.map((field) => (
        <Polygon key={field.id} positions={field.coordinates as LatLng[]}
          eventHandlers={{ click: () => onSelect({ kind: "field", id: field.id }) }}
          pathOptions={{
            color: isSelected("field", field.id) ? "#fff" : HEALTH_COLORS[field.health_status],
            weight: isSelected("field", field.id) ? 3 : 2,
            fillColor: HEALTH_COLORS[field.health_status],
            fillOpacity: showZones ? 0.08 : 0.38,
          }}>
          <Tooltip sticky>{field.name}</Tooltip>
        </Polygon>
      ))}
      {showZones && data.zones.map((zone) => (
        <Polygon key={zone.id} positions={zone.polygon as LatLng[]}
          eventHandlers={{ click: () => onSelect({ kind: "zone", id: zone.id }) }}
          pathOptions={{
            color: isSelected("zone", zone.id) ? "#fff" : "#ffffff99",
            weight: isSelected("zone", zone.id) ? 2.5 : 1,
            fillColor: HEALTH_COLORS[zone.health_status],
            fillOpacity: 0.48,
          }}>
          <Tooltip sticky>{zone.name}</Tooltip>
        </Polygon>
      ))}
      {data.anomalies.map((anomaly) => (
        <CircleMarker key={anomaly.id} center={[anomaly.latitude, anomaly.longitude]}
          radius={isSelected("anomaly", anomaly.id) ? 11 : 8}
          eventHandlers={{ click: () => onSelect({ kind: "anomaly", id: anomaly.id }) }}
          pathOptions={{
            color: "#fff", weight: 2.5, fillOpacity: 1,
            fillColor: anomaly.severity === "critical" ? "#D95757" : "#E8A23A",
          }}>
          <Tooltip>{anomaly.title}</Tooltip>
        </CircleMarker>
      ))}
    </BaseMap>
  );
}

export function FieldMiniMap({ field, zones }: { field: Field; zones: { id: string; polygon: [number, number][]; health_status: Health; name: string }[] }) {
  return (
    <BaseMap points={field.coordinates as LatLng[]} className="h-72">
      <Polygon positions={field.coordinates as LatLng[]}
        pathOptions={{ color: HEALTH_COLORS[field.health_status], weight: 2, fillOpacity: zones.length ? 0 : 0.35 }} />
      {zones.map((zone) => (
        <Polygon key={zone.id} positions={zone.polygon}
          pathOptions={{ color: "#ffffff99", weight: 1, fillColor: HEALTH_COLORS[zone.health_status], fillOpacity: 0.45 }}>
          <Tooltip sticky>{zone.name}</Tooltip>
        </Polygon>
      ))}
    </BaseMap>
  );
}

const icon = (html: string, size: number) =>
  L.divIcon({ html, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });

const HOME_ICON = icon(
  `<div style="width:22px;height:22px;border-radius:50%;background:#fff;border:3px solid #174C38;display:flex;align-items:center;justify-content:center;font:700 11px sans-serif;color:#174C38">H</div>`, 22);
const DRONE_ICON = icon(
  `<div style="width:26px;height:26px;border-radius:50%;background:#174C38;border:3px solid #A8D96C;box-shadow:0 0 0 4px rgba(168,217,108,.35)"></div>`, 26);

export function RouteMap({ field, mission, home }: { field?: Field; mission?: Mission | null; home?: LatLng }) {
  const route = (mission?.route ?? []) as LatLng[];
  const homePoint = (mission?.home as LatLng | undefined) ?? home;
  const points = field ? (field.coordinates as LatLng[]) : route;
  const allPoints = homePoint ? [...points, homePoint] : points;

  return (
    <BaseMap points={allPoints} className="h-[380px] lg:h-[460px]">
      {field && (
        <Polygon positions={field.coordinates as LatLng[]}
          pathOptions={{ color: "#A8D96C", weight: 2, fillColor: "#A8D96C", fillOpacity: 0.12 }} />
      )}
      {route.length > 0 && (
        <Polyline positions={homePoint ? [homePoint, ...route, homePoint] : route}
          pathOptions={{ color: "#fff", weight: 1.5, opacity: 0.8, dashArray: "5 6" }} />
      )}
      {mission && mission.track.length > 1 && (
        <Polyline positions={mission.track as LatLng[]} pathOptions={{ color: "#A8D96C", weight: 3 }} />
      )}
      {homePoint && <Marker position={homePoint} icon={HOME_ICON} />}
      {mission?.position && <Marker position={mission.position as LatLng} icon={DRONE_ICON} />}
    </BaseMap>
  );
}
