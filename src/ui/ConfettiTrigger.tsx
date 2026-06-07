import { useRef, type ReactNode } from "react";
import { confettiBurst } from "@/lib/easter-eggs";

export function ConfettiButton({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => {
        confettiBurst(ref.current ?? undefined);
        onClick?.();
      }}
      className={className}
    >
      {children}
    </button>
  );
}
