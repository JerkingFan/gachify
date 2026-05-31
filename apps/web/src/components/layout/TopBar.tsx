import { ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { UserMenu } from "./UserMenu";

interface TopBarProps {
  title?: string;
  gradient?: boolean;
}

export function TopBar({ title, gradient }: TopBarProps) {
  const navigate = useNavigate();

  return (
    <header
      className={`sticky top-0 z-20 flex h-16 items-center gap-4 px-6 ${
        gradient
          ? "bg-gradient-to-b from-black/60 to-transparent"
          : "bg-spotify-base/80 backdrop-blur-md"
      }`}
    >
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white/70 hover:text-white disabled:opacity-40"
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => navigate(1)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white/70 hover:text-white"
          aria-label="Forward"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {title && (
        <h1 className="truncate text-lg font-bold text-white">{title}</h1>
      )}

      <div className="ml-auto flex items-center gap-3">
        <button
          type="button"
          className="rounded-full bg-spotify-highlight px-4 py-1 text-sm font-semibold hover:scale-105"
        >
          Upgrade
        </button>
        <UserMenu />
      </div>
    </header>
  );
}
