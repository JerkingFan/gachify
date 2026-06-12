import { isNativeApp } from "@/lib/native";
import { isIOS, isStandalonePwa } from "@/lib/pwa";

const SNOOZE_KEY = "gachify:mobile-install-snooze-until";
const DISMISS_KEY = "gachify:mobile-install-dismissed";

const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

export function isMobileBrowser(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(max-width: 768px)").matches) return true;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export function isAndroidBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

export function getApkDownloadUrl(): string {
  const configured = import.meta.env.VITE_APK_URL?.trim();
  if (configured) return configured;
  if (typeof window !== "undefined") {
    return `${window.location.origin}/gachify.apk`;
  }
  return "/gachify.apk";
}

function snoozeUntil(): number {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
  } catch {
    return 0;
  }
}

export function isInstallSnoozed(): boolean {
  try {
    if (localStorage.getItem(DISMISS_KEY) === "1") return true;
  } catch {
    /* ignore */
  }
  return Date.now() < snoozeUntil();
}

export function snoozeMobileInstall() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
  } catch {
    /* ignore */
  }
}

export function dismissMobileInstallForever() {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
    localStorage.removeItem(SNOOZE_KEY);
  } catch {
    /* ignore */
  }
}

export function shouldOfferMobileInstall(force = false): boolean {
  if (isNativeApp() || isStandalonePwa()) return false;
  if (!isMobileBrowser()) return false;
  if (force) return true;
  return !isInstallSnoozed();
}

export function isIosBrowser(): boolean {
  return isIOS();
}
