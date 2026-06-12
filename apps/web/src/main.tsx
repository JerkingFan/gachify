import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import App from "./App";
import { initLocale } from "./lib/i18n";
import { assertMobileApiConfigured } from "./lib/apiOrigin";
import { isNativeApp } from "./lib/native";
import { registerPwaServiceWorker } from "./lib/pwaRegister";
import { queryClient } from "./lib/queryClient";
import "./index.css";

initLocale();
registerPwaServiceWorker();

if (isNativeApp()) {
  document.documentElement.classList.add("native-app");
  assertMobileApiConfigured();
  void import("@capacitor/status-bar").then(({ StatusBar, Style }) => {
    void StatusBar.setStyle({ style: Style.Dark });
    void StatusBar.setBackgroundColor({ color: "#121212" });
    // Let env(safe-area-inset-*) match the real display on notched Android devices.
    void StatusBar.setOverlaysWebView({ overlay: true });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </HelmetProvider>
  </StrictMode>,
);
