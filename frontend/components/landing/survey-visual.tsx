"use client";

import { useT } from "@/providers/i18n-provider";

const COLS = 22;
const ROWS = 10;
const CELL_W = 800 / COLS;
const CELL_H = 460 / ROWS;

/** Fixed pattern of stressed spots, so the picture is identical on server and client. */
const STRESS: Record<string, string> = {
  "3-5": "#E8A23A", "4-5": "#E8A23A", "4-6": "#D95757", "5-6": "#E8A23A", "3-6": "#E8A23A",
  "12-2": "#E8A23A", "13-2": "#E8A23A", "13-3": "#E8A23A", "9-1": "#E8A23A",
};

const SCANNED_ROWS = 7;
const ROUTE = Array.from({ length: SCANNED_ROWS }, (_, row) => {
  const y = CELL_H * row + CELL_H / 2;
  return row % 2 === 0 ? `L 780 ${y} L 780 ${y + CELL_H}` : `L 20 ${y} L 20 ${y + CELL_H}`;
}).join(" ");
const PATH = `M 20 ${CELL_H / 2} ${ROUTE}`;
/** The drone sweeps along the edge between mapped and unmapped ground. */
const EDGE_Y = CELL_H * (SCANNED_ROWS + 0.5);
const SWEEP = `M 40 ${EDGE_Y} L 760 ${EDGE_Y} L 40 ${EDGE_Y}`;

function Drone() {
  const rotor = (cx: number, cy: number) => (
    <g key={`${cx}-${cy}`}>
      <circle cx={cx} cy={cy} r="11" fill="#fff" fillOpacity="0.16" stroke="#fff" strokeOpacity="0.7" />
      <circle cx={cx} cy={cy} r="2.5" fill="#fff" />
    </g>
  );
  return (
    <g>
      <path d="M-15 -15 15 15M15 -15 -15 15" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
      {[[-15, -15], [15, -15], [-15, 15], [15, 15]].map(([x, y]) => rotor(x, y))}
      <rect x="-9" y="-9" width="18" height="18" rx="4" fill="#fff" />
      <circle cx="0" cy="0" r="4" fill="#174C38" />
      <circle cx="0" cy="0" r="1.6" fill="#A8D96C" />
    </g>
  );
}

export function SurveyVisual() {
  const { t } = useT();
  return (
    <figure className="relative overflow-hidden rounded-lg border border-white/15 bg-[#0F3527]">
      <svg viewBox="0 0 800 460" className="block w-full" role="img" aria-label={t("landing.visualAlt")}>
        <defs>
          <pattern id="rows" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(90)">
            <rect width="9" height="9" fill="#3A7D54" />
            <rect width="4" height="9" fill="#2F6E47" />
          </pattern>
          <clipPath id="field">
            <path d="M 0 0 H 800 V 460 H 0 Z" />
          </clipPath>
        </defs>
        <rect width="800" height="460" fill="url(#rows)" />

        {/* The strip behind the drone is shown as the health map it produced. */}
        <g clipPath="url(#field)">
          {Array.from({ length: SCANNED_ROWS }, (_, row) =>
            Array.from({ length: COLS }, (_, col) => {
              const stress = STRESS[`${col}-${row}`];
              const shade = (col * 7 + row * 13) % 3;
              return (
                <rect key={`${col}-${row}`} x={col * CELL_W + 1} y={row * CELL_H + 1}
                  width={CELL_W - 2} height={CELL_H - 2} rx="2"
                  fill={stress ?? ["#A8D96C", "#8FCB62", "#7BBF5E"][shade]} fillOpacity={stress ? 0.95 : 0.82} />
              );
            }),
          )}
        </g>

        <path d={PATH} fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="6 7" />
      </svg>

      <svg viewBox="0 0 800 460" className="pointer-events-none absolute inset-0 w-full" aria-hidden>
        <g className="zerno-drone-path" style={{ offsetPath: `path("${SWEEP}")`, offsetRotate: "0deg" }}>
          <Drone />
        </g>
      </svg>

      <figcaption className="absolute right-3 bottom-3 left-3 flex flex-wrap gap-2 text-sm">
        {[
          [t("landing.hudAltitude"), "60 m"],
          [t("landing.hudBattery"), "78%"],
          [t("landing.hudNdvi"), "0.74"],
        ].map(([label, value]) => (
          <span key={label} className="rounded bg-[#0F3527]/90 px-2.5 py-1.5 text-white">
            <span className="text-white/70">{label}</span> <span className="font-semibold">{value}</span>
          </span>
        ))}
        <span className="ml-auto rounded bg-[#0F3527]/90 px-2.5 py-1.5 text-white/80">{t("landing.hudSim")}</span>
      </figcaption>
    </figure>
  );
}
