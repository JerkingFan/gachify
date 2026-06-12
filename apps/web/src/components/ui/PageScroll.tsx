import type { ReactNode } from "react";

/** Scrollable page body inside AppShell main (body overflow is hidden). */
export function PageScroll({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] ${className}`}
    >
      {children}
    </div>
  );
}
