import { Download, Share, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";
import { usePwaInstallPrompt } from "@/hooks/usePwaInstallPrompt";
import { getLocale, t } from "@/lib/i18n";
import {
  dismissMobileInstallForever,
  getApkDownloadUrl,
  isAndroidBrowser,
  isIosBrowser,
  shouldOfferMobileInstall,
  snoozeMobileInstall,
} from "@/lib/mobileInstall";
import { useUIStore } from "@/store/uiStore";

export function MobileInstallPrompt() {
  const locale = getLocale();
  const forced = useUIStore((s) => s.mobileInstallOpen);
  const setForced = useUIStore((s) => s.setMobileInstallOpen);
  const { canPromptInstall, promptInstall } = usePwaInstallPrompt();
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);

  const showApk = isAndroidBrowser();
  const apkUrl = getApkDownloadUrl();
  const ios = isIosBrowser();

  useEffect(() => {
    if (!shouldOfferMobileInstall(forced)) {
      setVisible(false);
      return;
    }
    if (forced) {
      setVisible(true);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), 1800);
    return () => window.clearTimeout(timer);
  }, [forced]);

  const close = (snooze: boolean) => {
    setVisible(false);
    setForced(false);
    if (snooze) snoozeMobileInstall();
  };

  const closeForever = () => {
    dismissMobileInstallForever();
    setVisible(false);
    setForced(false);
  };

  const onInstallPwa = async () => {
    setInstalling(true);
    try {
      const ok = await promptInstall();
      if (ok) closeForever();
      else close(true);
    } finally {
      setInstalling(false);
    }
  };

  if (!visible || !shouldOfferMobileInstall(forced)) return null;

  return (
    <div
      className="fixed inset-0 z-[45] flex items-end justify-center p-4 pb-[calc(var(--gachify-mobile-chrome-h)+12px)] md:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-install-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/65"
        aria-label={t("install.close", locale)}
        onClick={() => close(true)}
      />
      <div className="safe-top relative w-full max-w-sm overflow-hidden rounded-2xl border border-spotify-green/30 bg-spotify-elevated shadow-2xl">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-spotify-green/80 via-spotify-green to-spotify-green/80" />
        <div className="p-5">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-spotify-green text-2xl font-bold text-black">
              ♂
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 id="mobile-install-title" className="text-base font-bold text-white">
                {t("install.title", locale)}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-spotify-muted">
                {t("install.subtitle", locale)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => close(true)}
              className="btn-icon shrink-0"
              aria-label={t("install.close", locale)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <ul className="mb-4 space-y-1 text-xs text-spotify-muted">
            <li>• {t("install.feature.lock", locale)}</li>
            <li>• {t("install.feature.bg", locale)}</li>
            <li>• {t("install.feature.offline", locale)}</li>
          </ul>

          <div className="flex flex-col gap-2">
            {canPromptInstall && (
              <button
                type="button"
                disabled={installing}
                onClick={() => void onInstallPwa()}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-spotify-green py-3 text-sm font-bold text-black disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                {installing ? t("install.installing", locale) : t("install.installPwa", locale)}
              </button>
            )}

            {showApk && (
              <a
                href={apkUrl}
                download
                className="flex w-full items-center justify-center gap-2 rounded-full border border-white/25 py-3 text-sm font-semibold text-white active:bg-white/10"
                onClick={() => close(true)}
              >
                <Smartphone className="h-4 w-4" />
                {t("install.downloadApk", locale)}
              </a>
            )}

            {ios && (
              <div className="rounded-lg bg-spotify-highlight px-3 py-2 text-xs text-spotify-muted">
                <p className="flex items-center gap-1.5 font-semibold text-white">
                  <Share className="h-3.5 w-3.5 shrink-0" />
                  {t("install.iosTitle", locale)}
                </p>
                <p className="mt-1">{t("install.iosSteps", locale)}</p>
              </div>
            )}

            {!canPromptInstall && !showApk && !ios && (
              <p className="text-center text-xs text-spotify-muted">{t("install.unavailable", locale)}</p>
            )}
          </div>

          <div className="mt-3 flex justify-between gap-2 text-xs">
            <button
              type="button"
              onClick={() => close(true)}
              className="text-spotify-muted hover:text-white"
            >
              {t("install.later", locale)}
            </button>
            <button
              type="button"
              onClick={closeForever}
              className="text-spotify-muted hover:text-white"
            >
              {t("install.never", locale)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
