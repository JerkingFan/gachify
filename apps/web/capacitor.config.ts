import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.gachify.app",
  appName: "Gachify",
  webDir: "dist",
  server: {
    // http avoids https://localhost -> http://API mixed-content blocks on Android
    androidScheme: "http",
    // Live reload: set CAP_SERVER_URL=http://192.168.x.x:5173 before `npx cap sync`
    ...(process.env.CAP_SERVER_URL
      ? { url: process.env.CAP_SERVER_URL, cleartext: true }
      : {}),
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    // Off: the HTTP interceptor breaks JSON fetch on many Android builds.
    // API CORS allows http://localhost (androidScheme).
    CapacitorHttp: {
      enabled: false,
    },
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#121212",
      androidScaleType: "CENTER_CROP",
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#121212",
    },
  },
};

export default config;
