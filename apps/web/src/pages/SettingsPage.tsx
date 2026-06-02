import { Bell, CheckCircle2, Download, Globe, Loader2, Mail, Shield, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "@/api/client";
import { TopBar } from "@/components/layout/TopBar";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { PLAYER_SYNC_STORAGE_KEY } from "@/hooks/usePlayerStateSync";
import { useOfflineDownloads } from "@/hooks/useOfflineDownloads";
import { useWebPush } from "@/hooks/useWebPush";
import { getLocale, setLocale, t, type Locale } from "@/lib/i18n";
import { isIOS, isStandalonePwa } from "@/lib/pwa";
import { useAuthStore } from "@/store/authStore";
import { useLibraryStore } from "@/store/libraryStore";
import type { AccountUser } from "@/types";

export function SettingsPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const [account, setAccount] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(true);

  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bio, setBio] = useState("");
  const [likesPublic, setLikesPublic] = useState(false);
  const [pushPref, setPushPref] = useState<"following" | "off">("following");
  const [pushMsg, setPushMsg] = useState("");
  const [profileMsg, setProfileMsg] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  const [verifyMsg, setVerifyMsg] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);

  const push = useWebPush(pushPref === "following");
  const offline = useOfflineDownloads();
  const likedIds = useLibraryStore((s) => s.likedIds);
  const [offlineMsg, setOfflineMsg] = useState("");
  const [offlineBulkBusy, setOfflineBulkBusy] = useState(false);
  const [locale, setLoc] = useState<Locale>(() => getLocale());
  const [queueSync, setQueueSync] = useState(
    () => localStorage.getItem(PLAYER_SYNC_STORAGE_KEY) !== "off",
  );

  useEffect(() => {
    if (!isAuthenticated) return;
    void api.me().then((a) => {
      setAccount(a);
      setDisplayName(a.display_name);
      setHandle(a.handle);
      setAvatarUrl(a.avatar_url ?? "");
      setBio(a.profile_bio ?? "");
      setLikesPublic(Boolean(a.liked_tracks_public));
      setPushPref(a.push_notifications === "off" ? "off" : "following");
      setLoading(false);
    });
  }, [isAuthenticated]);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (loading || !account) {
    return (
      <>
        <TopBar title="Settings" />
        <p className="p-8 text-spotify-muted">Loading account…</p>
      </>
    );
  }

  const savePushPref = async (pref: "following" | "off") => {
    setPushPref(pref);
    setPushMsg("");
    try {
      const updated = await api.updateProfile({ push_notifications: pref });
      setAccount(updated);
      if (pref === "off") {
        await push.unsubscribe();
        setPushMsg("Push notifications turned off.");
      } else {
        const ok = await push.subscribe();
        setPushMsg(ok ? "Push enabled for new releases from artists you follow." : push.error ?? "Could not enable push.");
      }
    } catch (e) {
      setPushMsg(e instanceof Error ? e.message : "Could not save push settings");
    }
  };

  const saveProfile = async () => {
    setProfileBusy(true);
    setProfileMsg("");
    try {
      const updated = await api.updateProfile({
        display_name: displayName.trim(),
        handle: handle.trim().toLowerCase(),
        avatar_url: avatarUrl.trim(),
        profile_bio: bio.trim(),
        liked_tracks_public: likesPublic,
      });
      setAccount(updated);
      await refreshUser();
      setProfileMsg("Profile saved.");
    } catch (e) {
      setProfileMsg(e instanceof Error ? e.message : "Could not save profile");
    } finally {
      setProfileBusy(false);
    }
  };

  const savePassword = async () => {
    setPasswordBusy(true);
    setPasswordMsg("");
    try {
      await api.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setPasswordMsg("Password updated.");
      const a = await api.me();
      setAccount(a);
    } catch (e) {
      setPasswordMsg(e instanceof Error ? e.message : "Could not change password");
    } finally {
      setPasswordBusy(false);
    }
  };

  const resendVerify = async () => {
    setVerifyBusy(true);
    setVerifyMsg("");
    try {
      await api.resendVerification();
      setVerifyMsg("Verification email sent (if SMTP is configured).");
    } catch (e) {
      setVerifyMsg(e instanceof Error ? e.message : "Could not send email");
    } finally {
      setVerifyBusy(false);
    }
  };

  return (
    <>
      <TopBar title="Settings" />
      <div className="flex-1 overflow-y-auto px-4 pb-12 md:px-8">
        <div className="mx-auto max-w-xl">
          <h1 className="mb-8 text-3xl font-black">Account settings</h1>

          <section className="mb-10 rounded-lg bg-spotify-highlight p-6">
            <h2 className="mb-4 text-lg font-bold">Profile</h2>
            <div className="mb-4 flex items-center gap-4">
              <UserAvatar user={{ display_name: displayName, avatar_url: avatarUrl || undefined }} size="lg" />
              <Link
                to={`/profile/${account.id}`}
                className="text-sm font-semibold text-spotify-green hover:underline"
              >
                View public profile
              </Link>
            </div>
            <label className="mb-3 block text-sm">
              <span className="text-spotify-muted">Display name</span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1 w-full rounded-md bg-spotify-base px-3 py-2"
              />
            </label>
            <label className="mb-3 block text-sm">
              <span className="text-spotify-muted">Handle (@)</span>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value.replace(/\s/g, "_"))}
                className="mt-1 w-full rounded-md bg-spotify-base px-3 py-2"
              />
              <span className="mt-1 block text-xs text-spotify-muted">
                Lowercase letters, digits, underscores — must be unique
              </span>
            </label>
            <label className="mb-3 block text-sm">
              <span className="text-spotify-muted">Avatar URL</span>
              <input
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://…"
                className="mt-1 w-full rounded-md bg-spotify-base px-3 py-2"
              />
            </label>
            <label className="mb-3 block text-sm">
              <span className="text-spotify-muted">Bio</span>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                maxLength={500}
                className="mt-1 w-full rounded-md bg-spotify-base px-3 py-2"
              />
            </label>
            <label className="mb-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={likesPublic}
                onChange={(e) => setLikesPublic(e.target.checked)}
              />
              Show liked tracks on my public profile
            </label>
            <button
              type="button"
              disabled={profileBusy}
              onClick={() => void saveProfile()}
              className="rounded-full bg-spotify-green px-6 py-2 text-sm font-bold text-black disabled:opacity-50"
            >
              {profileBusy ? "Saving…" : "Save profile"}
            </button>
            {profileMsg && <p className="mt-2 text-sm text-spotify-muted">{profileMsg}</p>}
          </section>

          <section className="mb-10 rounded-lg bg-spotify-highlight p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
              <Bell className="h-5 w-5" />
              Push notifications
            </h2>
            <p className="mb-4 text-sm text-spotify-muted">
              Get a browser notification when someone you follow drops a new remix — even when Gachify is closed.
            </p>
            <div className="space-y-2 text-sm">
              <label className="flex cursor-pointer items-center gap-2 rounded-md bg-spotify-base px-3 py-2">
                <input
                  type="radio"
                  name="push-pref"
                  checked={pushPref === "following"}
                  onChange={() => void savePushPref("following")}
                />
                New releases from subscriptions
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-md bg-spotify-base px-3 py-2">
                <input
                  type="radio"
                  name="push-pref"
                  checked={pushPref === "off"}
                  onChange={() => void savePushPref("off")}
                />
                Off
              </label>
            </div>
            {!push.supported && (
              <p className="mt-3 text-xs text-spotify-muted">Push is not supported in this browser.</p>
            )}
            {pushPref === "following" && push.supported && !push.subscribed && !push.busy && (
              <button
                type="button"
                onClick={() => void push.subscribe().then((ok) => setPushMsg(ok ? "Push subscription active." : push.error ?? ""))}
                className="mt-4 rounded-full border border-white/30 px-4 py-2 text-sm font-semibold hover:bg-white/10"
              >
                Enable browser notifications
              </button>
            )}
            {push.busy && (
              <p className="mt-3 flex items-center gap-2 text-sm text-spotify-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Updating…
              </p>
            )}
            {pushMsg && <p className="mt-3 text-sm text-spotify-muted">{pushMsg}</p>}
          </section>

          <section className="mb-10 rounded-lg bg-spotify-highlight p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
              <Globe className="h-5 w-5" />
              {t("settings.language", locale)}
            </h2>
            <div className="flex flex-wrap gap-3">
              {(["en", "ru"] as Locale[]).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => {
                    setLocale(code);
                    setLoc(code);
                    window.location.reload();
                  }}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    locale === code ? "bg-spotify-green text-black" : "bg-spotify-base hover:bg-white/10"
                  }`}
                >
                  {code === "en" ? "English" : "Русский"}
                </button>
              ))}
            </div>
          </section>

          <section className="mb-10 rounded-lg bg-spotify-highlight p-6">
            <h2 className="mb-2 text-lg font-bold">{t("settings.queueSync", locale)}</h2>
            <p className="mb-4 text-sm text-spotify-muted">{t("settings.queueSyncHint", locale)}</p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={queueSync}
                onChange={(e) => {
                  const on = e.target.checked;
                  setQueueSync(on);
                  localStorage.setItem(PLAYER_SYNC_STORAGE_KEY, on ? "on" : "off");
                }}
                className="accent-spotify-green"
              />
              Enable queue sync
            </label>
          </section>

          <section className="mb-10 rounded-lg bg-spotify-highlight p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
              <Download className="h-5 w-5" />
              Offline downloads
            </h2>
            <p className="mb-4 text-sm text-spotify-muted">
              Full tracks for liked remixes (128k HLS or preview MP3), stored on this device.
              Limit: {offline.limit} tracks · used {offline.ids.length} · {offline.formattedSize}.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={offlineBulkBusy || !offline.canDownloadMore || likedIds.size === 0}
                onClick={() => {
                  setOfflineBulkBusy(true);
                  setOfflineMsg("");
                  void (async () => {
                    let ok = 0;
                    for (const id of likedIds) {
                      if (offline.ids.includes(id)) continue;
                      if (!offline.canDownloadMore && ok > 0) break;
                      try {
                        await offline.download(id);
                        ok++;
                      } catch {
                        /* skip unavailable */
                      }
                    }
                    setOfflineMsg(ok ? `Downloaded ${ok} track(s) for offline.` : "Nothing new to download.");
                    setOfflineBulkBusy(false);
                  })();
                }}
                className="rounded-full bg-spotify-green px-5 py-2 text-sm font-bold text-black disabled:opacity-50"
              >
                {offlineBulkBusy ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Downloading…
                  </span>
                ) : (
                  "Download all liked"
                )}
              </button>
            </div>
            {offline.error && <p className="mt-3 text-sm text-red-300">{offline.error}</p>}
            {offlineMsg && <p className="mt-3 text-sm text-spotify-muted">{offlineMsg}</p>}
            {offline.ids.length > 0 && (
              <ul className="mt-4 space-y-1 text-xs text-spotify-muted">
                {offline.ids.slice(0, 8).map((id) => (
                  <li key={id} className="flex items-center justify-between gap-2 rounded bg-spotify-base px-2 py-1">
                    <span className="truncate font-mono">{id.slice(0, 8)}…</span>
                    <button
                      type="button"
                      disabled={offline.busy === id}
                      onClick={() => void offline.remove(id)}
                      className="shrink-0 text-spotify-muted hover:text-white"
                    >
                      Remove
                    </button>
                  </li>
                ))}
                {offline.ids.length > 8 && (
                  <li className="text-spotify-muted">+{offline.ids.length - 8} more</li>
                )}
              </ul>
            )}
          </section>

          <section className="mb-10 rounded-lg bg-spotify-highlight p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
              <Mail className="h-5 w-5" />
              Email
            </h2>
            <p className="text-sm">{account.email || "No email on file"}</p>
            <p className="mt-2 flex items-center gap-2 text-sm">
              {account.email_verified ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-spotify-green" />
                  Verified
                </>
              ) : (
                <>
                  <Shield className="h-4 w-4 text-amber-400" />
                  Not verified
                </>
              )}
            </p>
            {!account.email_verified && account.email && (
              <button
                type="button"
                disabled={verifyBusy}
                onClick={() => void resendVerify()}
                className="mt-4 rounded-full border border-white/30 px-4 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-50"
              >
                {verifyBusy ? "Sending…" : "Resend verification email"}
              </button>
            )}
            {verifyMsg && <p className="mt-2 text-sm text-spotify-muted">{verifyMsg}</p>}
          </section>

          <section className="rounded-lg bg-spotify-highlight p-6">
            <h2 className="mb-4 text-lg font-bold">Password</h2>
            {!account.has_password && (
              <p className="mb-3 text-sm text-spotify-muted">
                You signed in with Google — set a password to also log in with email.
              </p>
            )}
            {account.has_password && (
              <label className="mb-3 block text-sm">
                <span className="text-spotify-muted">Current password</span>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="mt-1 w-full rounded-md bg-spotify-base px-3 py-2"
                />
              </label>
            )}
            <label className="mb-4 block text-sm">
              <span className="text-spotify-muted">New password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 w-full rounded-md bg-spotify-base px-3 py-2"
              />
            </label>
            <button
              type="button"
              disabled={passwordBusy || !newPassword}
              onClick={() => void savePassword()}
              className="rounded-full bg-spotify-green px-6 py-2 text-sm font-bold text-black disabled:opacity-50"
            >
              {passwordBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
            </button>
            {passwordMsg && <p className="mt-2 text-sm text-spotify-muted">{passwordMsg}</p>}
          </section>

          <section className="mt-10 rounded-lg border border-white/10 p-6">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
              <Smartphone className="h-5 w-5" />
              App &amp; mobile
            </h2>
            <p className="text-sm text-spotify-muted">
              {isStandalonePwa()
                ? "Running as installed app — lock-screen controls and background play are enabled."
                : isIOS()
                  ? "Install via Safari → Share → Add to Home Screen for the best iOS experience (background audio + lock screen)."
                  : "Use the install banner or browser menu → Install app for lock-screen controls and offline liked previews."}
            </p>
            <ul className="mt-3 list-inside list-disc text-xs text-spotify-muted">
              <li>Media Session — title, artist, play/pause, skip on lock screen</li>
              <li>Offline downloads — full liked tracks in IndexedDB (Settings)</li>
              <li>Streaming radio needs network when tracks aren&apos;t downloaded</li>
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
