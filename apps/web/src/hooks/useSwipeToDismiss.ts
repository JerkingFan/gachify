import { useRef } from "react";

/** Fire onClose when user swipes down past threshold (mobile sheets). */
export function useSwipeToDismiss(onClose: () => void, threshold = 72) {
  const startY = useRef(0);
  const startX = useRef(0);

  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      startY.current = t.clientY;
      startX.current = t.clientX;
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const t = e.changedTouches[0];
      const dy = t.clientY - startY.current;
      const dx = Math.abs(t.clientX - startX.current);
      if (dy > threshold && dy > dx * 1.2) {
        onClose();
      }
    },
  };
}
