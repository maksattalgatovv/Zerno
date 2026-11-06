import { cn } from "@/lib/utils";

/** A grain of wheat cut by a survey line: the crop seen through the drone's camera. */
export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-[0.14em]", light ? "text-white" : "text-brand", className)}>
      <svg viewBox="0 0 28 28" className="size-7" aria-hidden>
        <rect width="28" height="28" rx="6" fill={light ? "#A8D96C" : "#174C38"} />
        <path d="M14 5c4.2 3 6 6 6 9.4C20 19 17.3 23 14 23s-6-4-6-8.6C8 11 9.8 8 14 5Z" fill={light ? "#174C38" : "#A8D96C"} />
        <path d="M14 8v15M8.5 13.5h11" stroke={light ? "#A8D96C" : "#174C38"} strokeWidth="1.6" />
      </svg>
      ZERNO
    </span>
  );
}
