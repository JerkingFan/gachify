import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ mode }) => {
  const isMobile = mode === "mobile";

  return {
    plugins: [
      react(),
      ...(!isMobile
        ? [
            VitePWA({
              registerType: "autoUpdate",
              includeAssets: ["favicon.svg", "pwa-192.svg", "pwa-512.svg"],
              devOptions: {
                enabled: true,
                type: "module",
              },
              manifest: {
                name: "Gachify",
                short_name: "Gachify",
                description: "Gachi remix player — karaoke, radio, lock-screen controls.",
                theme_color: "#121212",
                background_color: "#121212",
                display: "standalone",
                display_override: ["standalone", "minimal-ui"],
                orientation: "portrait",
                categories: ["music", "entertainment"],
                start_url: "/",
                scope: "/",
                icons: [
                  {
                    src: "/pwa-192.svg",
                    sizes: "192x192",
                    type: "image/svg+xml",
                    purpose: "any",
                  },
                  {
                    src: "/pwa-512.svg",
                    sizes: "512x512",
                    type: "image/svg+xml",
                    purpose: "maskable",
                  },
                ],
              },
              workbox: {
                importScripts: ["push-handler.js"],
                navigateFallback: "/index.html",
                globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
                runtimeCaching: [
                  {
                    urlPattern: ({ url }) => url.pathname.startsWith("/api/v1/me/liked"),
                    handler: "NetworkFirst",
                    options: {
                      cacheName: "gachify-liked",
                      networkTimeoutSeconds: 5,
                      expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 },
                    },
                  },
                  {
                    urlPattern: ({ url }) => url.pathname.startsWith("/api/v1/me/playlists"),
                    handler: "NetworkFirst",
                    options: {
                      cacheName: "gachify-playlists",
                      networkTimeoutSeconds: 5,
                      expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 12 },
                    },
                  },
                  {
                    urlPattern: ({ url }) => url.pathname.startsWith("/api/v1/me/feed"),
                    handler: "NetworkFirst",
                    options: {
                      cacheName: "gachify-feed",
                      networkTimeoutSeconds: 5,
                      expiration: { maxEntries: 1, maxAgeSeconds: 60 * 30 },
                    },
                  },
                  {
                    urlPattern: ({ url }) => /^\/api\/v1\/tracks\/[^/]+$/.test(url.pathname),
                    handler: "NetworkFirst",
                    options: {
                      cacheName: "gachify-track-detail",
                      networkTimeoutSeconds: 5,
                      expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 },
                    },
                  },
                  {
                    urlPattern: ({ url }) => url.pathname.startsWith("/api/v1/tracks"),
                    handler: "StaleWhileRevalidate",
                    options: {
                      cacheName: "gachify-tracks",
                      expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 },
                    },
                  },
                  {
                    urlPattern: ({ url }) => url.pathname.includes("/stream/"),
                    handler: "NetworkFirst",
                    options: {
                      cacheName: "gachify-stream",
                      networkTimeoutSeconds: 8,
                      expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 6 },
                    },
                  },
                  {
                    urlPattern: ({ request }) => request.destination === "audio",
                    handler: "CacheFirst",
                    options: {
                      cacheName: "gachify-audio-previews",
                      expiration: { maxEntries: 48, maxAgeSeconds: 60 * 60 * 24 * 7 },
                      cacheableResponse: { statuses: [0, 200] },
                    },
                  },
                ],
              },
            }),
          ]
        : []),
    ],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
        ...(isMobile
          ? {
              "virtual:pwa-register": fileURLToPath(
                new URL("./src/lib/pwaRegister.stub.ts", import.meta.url),
              ),
            }
          : {}),
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: process.env.VITE_API_PROXY_TARGET ?? "http://localhost:8080",
          changeOrigin: true,
        },
        "/health": {
          target: process.env.VITE_API_PROXY_TARGET ?? "http://localhost:8080",
          changeOrigin: true,
        },
        "/share": {
          target: process.env.VITE_API_PROXY_TARGET ?? "http://localhost:8080",
          changeOrigin: true,
        },
        "/stream": {
          target: process.env.VITE_API_PROXY_TARGET ?? "http://localhost:8080",
          changeOrigin: true,
        },
        "/internal/admin": {
          target: process.env.VITE_API_PROXY_TARGET ?? "http://localhost:8080",
          changeOrigin: true,
        },
      },
    },
  };
});
