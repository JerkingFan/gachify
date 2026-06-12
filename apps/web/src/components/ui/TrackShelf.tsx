import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Desktop grid columns (tailwind class fragment, e.g. "md:grid-cols-4 lg:grid-cols-5") */
  desktopCols?: string;
};

/** Horizontal snap scroll on phones; grid on md+. */
export function TrackShelf({
  children,
  desktopCols = "md:grid-cols-4 lg:grid-cols-5",
}: Props) {
  return (
    <div
      className={[
        "track-shelf flex gap-4 overflow-x-auto overscroll-x-contain pb-2",
        "-mx-6 px-6",
        "snap-x snap-mandatory",
        "md:mx-0 md:grid md:gap-4 md:overflow-visible md:px-0 md:snap-none",
        desktopCols,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function TrackShelfItem({ children }: { children: ReactNode }) {
  return (
    <div className="w-[42vw] max-w-[168px] shrink-0 snap-start md:w-auto md:max-w-none">
      {children}
    </div>
  );
}
