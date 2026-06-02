import { ChevronDown, LogOut, Settings, Sparkles, UserCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useAuthStore } from "@/store/authStore";

export function UserMenu() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!isAuthenticated || !user) {
    return (
      <Link
        to="/login"
        className="flex items-center gap-2 rounded-full bg-spotify-highlight px-3 py-1.5 text-sm font-semibold text-white hover:bg-spotify-hover"
      >
        Log in
      </Link>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-white/10"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <UserAvatar user={user} size="sm" />
        <span className="hidden max-w-[100px] truncate text-sm font-semibold lg:inline">
          {user.display_name}
        </span>
        <ChevronDown className="hidden h-4 w-4 text-spotify-muted lg:block" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-56 rounded-md border border-white/10 bg-spotify-elevated py-1 shadow-xl"
        >
          <div className="border-b border-white/10 px-4 py-3">
            <p className="truncate font-semibold">{user.display_name}</p>
            <p className="truncate text-xs text-spotify-muted">@{user.handle}</p>
          </div>
          <Link
            to={`/profile/${user.id}`}
            role="menuitem"
            className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-white/10"
            onClick={() => setOpen(false)}
          >
            <UserCircle className="h-4 w-4" />
            My profile
          </Link>
          <Link
            to="/settings"
            role="menuitem"
            className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-white/10"
            onClick={() => setOpen(false)}
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
          <Link
            to="/creator"
            role="menuitem"
            className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-white/10"
            onClick={() => setOpen(false)}
          >
            <Sparkles className="h-4 w-4 text-spotify-green" />
            Creator Hub
          </Link>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-white/10"
            onClick={() => {
              setOpen(false);
              void logout();
            }}
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
