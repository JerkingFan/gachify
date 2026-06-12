import { Compass, Home, Library, Search, TrendingUp } from "lucide-react";
import { NavLink } from "react-router-dom";
import { getLocale, t } from "@/lib/i18n";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";

type NavItem = {
  to: string;
  icon: typeof Home;
  labelKey?: string;
  label?: string;
  end?: boolean;
};

function buildItems(isAuthenticated: boolean): NavItem[] {
  const core: NavItem[] = [
    { to: "/", icon: Home, label: "Home", end: true },
    { to: "/charts", icon: TrendingUp, labelKey: "nav.charts" },
    { to: "/discover", icon: Compass, labelKey: "nav.discover" },
    { to: "/search", icon: Search, labelKey: "nav.search" },
  ];
  if (isAuthenticated) {
    return [...core, { to: "/library", icon: Library, labelKey: "nav.library_short" }];
  }
  return core;
}

export function MobileBottomNav() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const locale = getLocale();
  const items = buildItems(isAuthenticated);

  return (
    <nav
      className="fixed bottom-[var(--gachify-mobile-player-h)] left-0 right-0 z-30 border-t border-white/10 bg-spotify-black/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      aria-label="Main navigation"
    >
      <ul className="flex items-stretch justify-around px-0.5 py-1">
        {items.map(({ to, icon: Icon, label, labelKey, end }) => {
          const text = labelKey ? t(labelKey, locale) : (label ?? to);
          return (
            <li key={to} className="min-w-0 flex-1">
              <NavLink
                to={to}
                end={end}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[10px] font-semibold leading-tight transition ${
                    isActive ? "text-white" : "text-spotify-muted"
                  }`
                }
              >
                <Icon className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" strokeWidth={2} />
                <span className="max-w-full truncate px-0.5">{text}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
