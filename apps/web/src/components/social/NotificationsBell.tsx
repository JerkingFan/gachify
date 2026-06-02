import { Bell, Rss } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { useAuthStore } from "@/store/authStore";
import type { Notification } from "@/types";

export function NotificationsBell() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = () => {
    void api.getNotifications().then((r) => {
      setItems(r.items);
      setUnread(r.unread);
    });
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!isAuthenticated) return null;

  const markRead = () => {
    void api.markNotificationsRead().then(() => {
      setUnread(0);
      setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open && unread > 0) markRead();
        }}
        className="btn-icon relative touch-target"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-spotify-green px-1 text-[10px] font-bold text-black">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-md border border-white/10 bg-spotify-elevated shadow-xl">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="font-semibold">Notifications</span>
            <Link to="/following" className="text-xs text-spotify-green hover:underline" onClick={() => setOpen(false)}>
              Subscriptions feed
            </Link>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {items.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-spotify-muted">
                Follow creators to get release alerts
              </li>
            )}
            {items.map((n) => (
              <li key={n.id}>
                {n.track_id ? (
                  <Link
                    to={`/track/${n.track_id}`}
                    onClick={() => setOpen(false)}
                    className={`block px-4 py-3 text-sm hover:bg-white/10 ${n.read_at ? "opacity-70" : ""}`}
                  >
                    <p className="flex items-start gap-2">
                      {!n.read_at && <Rss className="mt-0.5 h-3.5 w-3.5 shrink-0 text-spotify-green" />}
                      <span>{n.body}</span>
                    </p>
                  </Link>
                ) : (
                  <p className="px-4 py-3 text-sm text-spotify-muted">{n.body}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
