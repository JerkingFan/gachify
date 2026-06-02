import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function useWebPush(enabled: boolean) {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        "Notification" in window &&
        "serviceWorker" in navigator &&
        "PushManager" in window,
    );
  }, []);

  const subscribe = useCallback(async () => {
    if (!supported || !enabled) return false;
    setBusy(true);
    setError(null);
    try {
      const { enabled: pushEnabled, public_key } = await api.getPushVapidPublicKey();
      if (!pushEnabled || !public_key) {
        setError("Push is not configured on the server.");
        return false;
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setError("Notification permission denied.");
        return false;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(public_key),
        });
      }
      const json = sub.toJSON();
      await api.subscribePush({
        endpoint: json.endpoint!,
        keys: {
          p256dh: json.keys!.p256dh!,
          auth: json.keys!.auth!,
        },
      });
      setSubscribed(true);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enable push");
      return false;
    } finally {
      setBusy(false);
    }
  }, [supported, enabled]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.unsubscribePush({ endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }, [supported]);

  useEffect(() => {
    if (!supported || !enabled) return;
    void navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(Boolean(sub));
    });
  }, [supported, enabled]);

  return { supported, subscribed, busy, error, subscribe, unsubscribe };
}
