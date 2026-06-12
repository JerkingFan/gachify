import { ChevronLeft, ChevronRight, Keyboard, Menu, Search } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useUIStore } from "@/store/uiStore";
import { NotificationsBell } from "@/components/social/NotificationsBell";
import { UserMenu } from "./UserMenu";

interface TopBarProps {
  title?: string;
  gradient?: boolean;
}

export function TopBar({ title, gradient }: TopBarProps) {
  const navigate = useNavigate();
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  return (
    <header
      className={`sticky top-0 z-20 flex h-14 items-center gap-3 px-4 md:h-16 md:gap-4 md:px-6 ${
        gradient
          ? "bg-gradient-to-b from-black/60 to-transparent"
          : "bg-spotify-base/80 backdrop-blur-md"
      }`}
    >
      <button
        type="button"
        onClick={toggleSidebar}
        className="btn-icon touch-target md:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="hidden gap-2 md:flex">
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
        <h1 className="min-w-0 flex-1 truncate text-base font-bold text-white md:text-lg">
          {title}
        </h1>
      )}

      <div className="ml-auto flex items-center gap-2 md:gap-3">
        <Link
          to="/search"
          className="btn-icon touch-target md:hidden"
          aria-label="Search"
        >
          <Search className="h-5 w-5" />
        </Link>
        <button
          type="button"
          onClick={() => useUIStore.getState().setShortcutsHelpOpen(true)}
          className="btn-icon touch-target hidden sm:flex"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
        >
          <Keyboard className="h-5 w-5" />
        </button>
        <NotificationsBell />
        <UserMenu />
      </div>
    </header>
  );
}
