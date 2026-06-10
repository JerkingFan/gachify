import { Capacitor } from "@capacitor/core";

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function isAndroid(): boolean {
  return Capacitor.getPlatform() === "android";
}
