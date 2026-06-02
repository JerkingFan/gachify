import { Compass, Home, Library, Rss, Search, Upload } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";

const items = [
  { to: "/", icon: Home, label: "Home", end: true },
  { to: "/following", icon: Rss, label: "Following", auth: true },
  { to: "/discover", icon: Compass, label: "Discover" },
  { to: "/search", icon: Search, label: "Search" },
  { to: "/library", icon: Library, label: "Library" },
  { to: "/upload", icon: Upload, label: "Upload", auth: true },
];

export function MobileBottomNav() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);

  return (
    <nav
      className="fixed bottom-[72px] left-0 right-0 z-30 border-t border-white/10 bg-spotify-black/95 backdrop-blur-md md:hidden"
      aria-label="Main navigation"
    >
      <ul className="flex items-stretch justify-around px-1 py-1">
        {items.map(({ to, icon: Icon, label, end, auth }) => {
          if (auth && !isAuthenticated) return null;
          return (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={end}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-md px-2 text-[10px] font-semibold transition ${
                    isActive ? "text-white" : "text-spotify-muted"
                  }`
                }
              >
                <Icon className="h-6 w-6" strokeWidth={2} />
                {label}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
