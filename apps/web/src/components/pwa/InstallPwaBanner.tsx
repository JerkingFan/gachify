import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";
import { isNativeApp } from "@/lib/native";
import { isIOS, isStandalonePwa } from "@/lib/pwa";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "gachify:pwa-install-dismissed";

export function InstallPwaBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [hidden, setHidden] = useState(isStandalonePwa);

  useEffect(() => {
    if (isStandalonePwa()) {
      setHidden(true);
      return;
    }
    const onInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => window.removeEventListener("beforeinstallprompt", onInstall);
  }, []);

  if (isNativeApp() || hidden || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    dismiss();
  };

  const ios = isIOS();

  return (
    <div className="fixed bottom-[calc(var(--gachify-mobile-chrome-h)+8px)] left-2 right-2 z-40 md:bottom-4 md:left-auto md:right-4 md:max-w-sm">
      <div className="flex gap-3 rounded-xl border border-spotify-green/40 bg-spotify-elevated p-4 shadow-2xl">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-spotify-green text-xl font-bold text-black">
          ♂
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Install Gachify</p>
          <p className="mt-0.5 text-xs text-spotify-muted">
            {ios
              ? "Share → Add to Home Screen for lock-screen controls & background play."
              : "Add to home screen — background audio, offline liked previews, app-like player."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {!ios && deferred && (
              <button
                type="button"
                onClick={() => void install()}
                className="inline-flex items-center gap-1 rounded-full bg-spotify-green px-3 py-1.5 text-xs font-bold text-black"
              >
                <Download className="h-3.5 w-3.5" />
                Install
              </button>
            )}
            {ios && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-spotify-green">
                <Share className="h-3.5 w-3.5" />
                Safari Share menu
              </span>
            )}
            <button
              type="button"
              onClick={dismiss}
              className="rounded-full px-3 py-1.5 text-xs text-spotify-muted hover:text-white"
            >
              Not now
            </button>
          </div>
        </div>
        <button type="button" onClick={dismiss} className="btn-icon shrink-0 self-start" aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
