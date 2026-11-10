import { cn } from "@/lib/utils";

const GRAIN = "M0 0C2.6-1.7 3-5 0-8C-3-5-2.6-1.7 0 0Z";
const GRAINS = [
  [14, 11.6, 0],
  [13, 16, -40],
  [15, 16, 40],
  [13, 21, -40],
  [15, 21, 40],
];

/** An ear of wheat ("zerno" means grain). Simple enough to read as a phone icon. */
export function Logo({ className, light }: { className?: string; light?: boolean }) {
  const grain = light ? "#174C38" : "#A8D96C";
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-[0.14em]", light ? "text-white" : "text-brand", className)}>
      <svg viewBox="0 0 28 28" className="size-7" aria-hidden>
        <rect width="28" height="28" rx="6" fill={light ? "#A8D96C" : "#174C38"} />
        <g fill={grain}>
          {GRAINS.map(([x, y, angle]) => <path key={`${x}-${y}`} d={GRAIN} transform={`translate(${x} ${y}) rotate(${angle})`} />)}
          <rect x="13.2" y="19.5" width="1.6" height="5.7" rx=".8" />
        </g>
      </svg>
      ZERNO
    </span>
  );
}
