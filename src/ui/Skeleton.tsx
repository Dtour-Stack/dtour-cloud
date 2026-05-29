import { cn } from "./cn";

/** Loading placeholder. Pulses unless the user prefers reduced motion. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block rounded-md bg-white/[0.06] motion-safe:animate-pulse",
        className,
      )}
      aria-hidden="true"
    />
  );
}
