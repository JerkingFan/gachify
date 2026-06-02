import { Compass, TrendingUp, Users, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { getLocale, t } from "@/lib/i18n";

const links = [
  {
    to: "/charts",
    icon: TrendingUp,
    titleKey: "home.quick.charts.title",
    descKey: "home.quick.charts.desc",
    accent: "from-amber-500/30 to-spotify-highlight",
  },
  {
    to: "/party",
    icon: Users,
    titleKey: "home.quick.party.title",
    descKey: "home.quick.party.desc",
    accent: "from-violet-500/30 to-spotify-highlight",
  },
  {
    to: "/discover",
    icon: Compass,
    titleKey: "home.quick.discover.title",
    descKey: "home.quick.discover.desc",
    accent: "from-spotify-green/25 to-spotify-highlight",
  },
] as const;

export function HomeQuickLinks() {
  const locale = getLocale();

  return (
    <section className="mb-8" aria-label="Quick links">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{t("home.quick.heading", locale)}</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {links.map(({ to, icon: Icon, titleKey, descKey, accent }) => (
          <Link
            key={to}
            to={to}
            className={`group flex items-center gap-3 rounded-xl border border-white/10 bg-gradient-to-br ${accent} p-4 transition hover:border-white/25 hover:bg-spotify-elevated`}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/40">
              <Icon className="h-5 w-5 text-spotify-green" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 text-sm font-bold text-white">
                {t(titleKey, locale)}
                <ChevronRight className="h-4 w-4 opacity-0 transition group-hover:opacity-100" />
              </span>
              <span className="mt-0.5 block text-xs text-spotify-muted">{t(descKey, locale)}</span>
            </span>
          </Link>
        ))}
      </div>
      <p className="mt-3 text-xs text-spotify-muted">{t("home.quick.nowPlayingHint", locale)}</p>
    </section>
  );
}
