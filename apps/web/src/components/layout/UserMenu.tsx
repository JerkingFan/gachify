import { LogIn, LogOut } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

export function UserMenu() {
  const { user, isAuthenticated, logout } = useAuthStore();

  if (!isAuthenticated || !user) {
    return (
      <Link
        to="/login"
        className="flex items-center gap-2 rounded-full bg-spotify-highlight px-3 py-1.5 text-sm font-semibold text-white hover:bg-spotify-hover"
      >
        <LogIn className="h-4 w-4" />
        Log in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex h-8 w-8 items-center justify-center rounded-full bg-spotify-green text-sm font-bold text-black"
        title={user.email ?? user.handle}
      >
        {user.display_name?.[0]?.toUpperCase() ?? "♂"}
      </div>
      <div className="hidden max-w-[120px] truncate text-sm lg:block">
        <p className="font-semibold text-white">{user.display_name}</p>
        <p className="text-xs text-spotify-muted">@{user.handle}</p>
      </div>
      <button
        type="button"
        onClick={() => void logout()}
        className="btn-icon"
        title="Log out"
        aria-label="Log out"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
