import { Home, Library, LogIn, Plus, Search, Sparkles, Upload } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useLibraryStore } from "@/store/libraryStore";

const mainNav = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/search", icon: Search, label: "Search" },
  { to: "/upload", icon: Upload, label: "Upload", auth: true },
];

export function Sidebar() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const playlists = useLibraryStore((s) => s.playlists);

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col gap-2 bg-black p-2">
      <div className="rounded-lg bg-spotify-base p-2">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-spotify-green text-lg font-bold text-black">
            ♂
          </div>
          <span className="text-xl font-bold tracking-tight">Gachify</span>
        </div>
        <nav className="flex flex-col gap-1 px-1">
          {mainNav.map(({ to, icon: Icon, label, auth }) => {
            if (auth && !isAuthenticated) return null;
            return (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `nav-link ${isActive ? "nav-link-active" : ""}`
                }
              >
                <Icon className="h-6 w-6" strokeWidth={2} />
                {label}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-lg bg-spotify-base p-2">
        <div className="mb-2 flex items-center justify-between px-3 py-2">
          <NavLink
            to="/library"
            className={({ isActive }) =>
              `nav-link flex-1 ${isActive ? "nav-link-active" : ""}`
            }
          >
            <Library className="h-6 w-6" />
            Your Library
          </NavLink>
          {isAuthenticated && (
            <button type="button" className="btn-icon" aria-label="Create playlist">
              <Plus className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-1">
          {!isAuthenticated ? (
            <Link
              to="/login"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-spotify-muted hover:text-white"
            >
              <LogIn className="h-4 w-4" />
              Log in to save playlists
            </Link>
          ) : (
            <>
              <p className="mb-2 px-3 text-xs font-semibold uppercase text-spotify-subtle">
                Playlists
              </p>
              {playlists.map((pl) => (
                <NavLink
                  key={pl.id}
                  to={`/playlist/${pl.id}`}
                  className={({ isActive }) =>
                    `block truncate rounded-md px-3 py-1.5 text-sm text-spotify-muted transition hover:text-white ${
                      isActive ? "text-white" : ""
                    }`
                  }
                >
                  {pl.title}
                </NavLink>
              ))}
            </>
          )}
        </div>
      </div>

      {isAuthenticated && user && (
        <div className="rounded-lg bg-spotify-highlight p-3">
          <p className="truncate text-sm font-semibold text-white">
            {user.display_name}
          </p>
          <p className="truncate text-xs text-spotify-muted">@{user.handle}</p>
          <p className="mt-1 truncate text-xs text-spotify-subtle">
            {user.email}
          </p>
        </div>
      )}

      {!isAuthenticated && (
        <div className="rounded-lg bg-gradient-to-br from-spotify-highlight to-spotify-base p-4">
          <div className="flex items-start gap-2">
            <Sparkles className="h-5 w-5 shrink-0 text-spotify-green" />
            <div>
              <p className="text-sm font-semibold">Premium ♂️</p>
              <p className="mt-1 text-xs text-spotify-muted">
                Log in to sync liked tracks across devices.
              </p>
              <Link
                to="/login"
                className="mt-3 inline-block rounded-full bg-white px-4 py-1.5 text-xs font-bold text-black hover:scale-105"
              >
                Log in
              </Link>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
