import { Home, Library, LogIn, Plus, Search, Sparkles, Upload, X } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useLibraryStore } from "@/store/libraryStore";
import { useUIStore } from "@/store/uiStore";

const mainNav = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/search", icon: Search, label: "Search" },
  { to: "/upload", icon: Upload, label: "Upload", auth: true },
];

interface SidebarProps {
  mobile?: boolean;
}

export function Sidebar({ mobile }: SidebarProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const playlists = useLibraryStore((s) => s.playlists);
  const createPlaylist = useLibraryStore((s) => s.createPlaylist);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);

  const handleCreatePlaylist = () => {
    if (!isAuthenticated) return;
    const title = window.prompt("Playlist name");
    if (!title?.trim()) return;
    void createPlaylist(title.trim()).catch((e) => {
      window.alert(e instanceof Error ? e.message : "Could not create playlist");
    });
  };

  const asideClass = mobile
    ? "flex h-full w-[min(280px,85vw)] shrink-0 flex-col gap-2 bg-black p-2"
    : "hidden h-full w-[280px] shrink-0 flex-col gap-2 bg-black p-2 md:flex";

  return (
    <aside className={asideClass}>
      {mobile && (
        <div className="flex justify-end px-1 pt-1">
          <button
            type="button"
            className="btn-icon touch-target"
            aria-label="Close menu"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
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
                onClick={() => mobile && setSidebarOpen(false)}
                className={({ isActive }) =>
                  `nav-link touch-target ${isActive ? "nav-link-active" : ""}`
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
            onClick={() => mobile && setSidebarOpen(false)}
            className={({ isActive }) =>
              `nav-link flex-1 touch-target ${isActive ? "nav-link-active" : ""}`
            }
          >
            <Library className="h-6 w-6" />
            Your Library
          </NavLink>
          {isAuthenticated && (
            <button
              type="button"
              className="btn-icon touch-target"
              aria-label="Create playlist"
              data-testid="sidebar-create-playlist"
              onClick={handleCreatePlaylist}
            >
              <Plus className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-1">
          {!isAuthenticated ? (
            <Link
              to="/login"
              onClick={() => mobile && setSidebarOpen(false)}
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
                  onClick={() => mobile && setSidebarOpen(false)}
                  className={({ isActive }) =>
                    `block truncate rounded-md px-3 py-2 text-sm text-spotify-muted transition hover:text-white touch-target ${
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
                onClick={() => mobile && setSidebarOpen(false)}
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
