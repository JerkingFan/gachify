import { Compass, Home, Library, Search, TrendingUp, UserCircle, Users } from "lucide-react";
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
  auth?: boolean;
  guestOnly?: boolean;
};

function buildItems(isAuthenticated: boolean): NavItem[] {
  const core: NavItem[] = [
    { to: "/", icon: Home, label: "Home", end: true },
    { to: "/charts", icon: TrendingUp, labelKey: "nav.charts" },
    { to: "/party", icon: Users, labelKey: "nav.party" },
    { to: "/discover", icon: Compass, labelKey: "nav.discover" },
  ];
  if (isAuthenticated) {
    return [
      ...core,
      { to: "/library", icon: Library, labelKey: "nav.library_short" },
      { to: "/me", icon: UserCircle, labelKey: "nav.profile", auth: true },
    ];
  }
  return [
    ...core,
    { to: "/search", icon: Search, labelKey: "nav.search", guestOnly: true },
  ];
}

export function MobileBottomNav() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const locale = getLocale();
  const items = buildItems(isAuthenticated);

  return (
    <nav
      className="fixed bottom-[72px] left-0 right-0 z-30 border-t border-white/10 bg-spotify-black/95 backdrop-blur-md md:hidden"
      aria-label="Main navigation"
    >
      <ul className="flex items-stretch justify-around px-0.5 py-1">
        {items.map(({ to, icon: Icon, label, labelKey, end, auth, guestOnly }) => {
          if (auth && !isAuthenticated) return null;
          if (guestOnly && isAuthenticated) return null;
          const text = labelKey ? t(labelKey, locale) : (label ?? to);
          return (
            <li key={to} className="min-w-0 flex-1">
              <NavLink
                to={to}
                end={end}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[9px] font-semibold leading-tight transition sm:text-[10px] ${
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
