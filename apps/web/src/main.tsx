import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { initLocale } from "./lib/i18n";
import { queryClient } from "./lib/queryClient";
import "./index.css";

initLocale();

registerSW({
  immediate: true,
  onOfflineReady() {
    console.info("[Gachify] Ready for offline use");
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </HelmetProvider>
  </StrictMode>,
);
