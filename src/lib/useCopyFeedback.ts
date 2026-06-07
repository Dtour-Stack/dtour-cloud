import { useCallback, useRef, useState } from "react";

export function useCopyFeedback(duration = 1200) {
  const [showFeedback, setShowFeedback] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const copy = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text).catch(() => {});
      setShowFeedback(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setShowFeedback(false), duration);
    },
    [duration],
  );

  return { copy, showFeedback };
}
