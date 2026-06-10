import { isMobileBuild } from "@/lib/apiOrigin";

/** Register service worker for web/PWA; skipped in Capacitor APK builds. */
export function registerPwaServiceWorker(): void {
  if (isMobileBuild() || !("serviceWorker" in navigator)) return;
  void import("virtual:pwa-register").then(({ registerSW }) => {
    registerSW({
      immediate: true,
      onOfflineReady() {
        console.info("[Gachify] Ready for offline use");
      },
    });
  });
}
