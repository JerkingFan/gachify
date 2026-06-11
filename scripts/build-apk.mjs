#!/usr/bin/env node
/**
 * One-command debug APK: npm run apk
 *   npm run apk:local     emulator / dev PC (10.0.2.2:8080)
 *   npm run apk -- --run  install on device/emulator
 *   npm run apk -- --api http://your-server.com
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveMobileApiOrigin, writeMobileEnv } from "./resolve-mobile-api.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const web = join(root, "apps", "web");
const androidDir = join(web, "android");
const apkOut = join(androidDir, "app", "build", "outputs", "apk", "debug", "app-debug.apk");
const apkCopy = join(root, "gachify-debug.apk");

const args = process.argv.slice(2);
const runOnDevice = args.includes("--run");
const useLocal = args.includes("--local");
const apiFlag = args.findIndex((a) => a === "--api");
const cliApi = apiFlag >= 0 ? args[apiFlag + 1] : null;

function run(cwd, command, args = []) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function findAndroidSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.platform === "win32"
      ? join(homedir(), "AppData", "Local", "Android", "Sdk")
      : join(homedir(), "Android", "Sdk"),
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function ensureAndroidSdk() {
  const sdk = findAndroidSdk();
  if (!sdk) {
    console.error(`
Android SDK not found.

  1. Install Android Studio: https://developer.android.com/studio
  2. Open it once (SDK downloads automatically)
  3. Run again: npm run apk
`);
    process.exit(1);
  }
  const escaped = sdk.replace(/\\/g, "\\\\");
  writeFileSync(join(androidDir, "local.properties"), `sdk.dir=${escaped}\n`);
  return sdk;
}

function ensureWebDeps() {
  if (!existsSync(join(web, "node_modules"))) {
    console.log("Installing web dependencies...");
    run(web, "npm", ["install"]);
  }
}

function ensureMobileEnv() {
  if (useLocal) {
    writeMobileEnv(web, "http://10.0.2.2:8080");
    console.log("API for APK: http://10.0.2.2:8080 (emulator / local dev)");
    return;
  }

  const origin =
    resolveMobileApiOrigin({ root, web, cliApi }) ??
    (cliApi ? cliApi.replace(/\/$/, "") : null);

  if (!origin) {
    console.error(`
No server URL for the APK.

  1. Copy apps/web/.env.mobile.production.example -> .env.mobile.production
  2. Set VITE_API_ORIGIN=http://YOUR_SERVER  (public site URL, no /api/v1)
  3. npm run apk

  Or one-shot:
    npm run apk -- --api http://5.83.140.179

  Local emulator only:
    npm run apk:local
`);
    process.exit(1);
  }

  writeMobileEnv(web, origin);
  console.log(`API for APK: ${origin}`);
}

function ensureAndroidProject() {
  if (!existsSync(androidDir)) {
    console.log("Adding Android platform...");
    run(web, "npx", ["cap", "add", "android"]);
  }
}

console.log("\n  Gachify APK build\n");

ensureWebDeps();
ensureMobileEnv();
ensureAndroidSdk();
ensureAndroidProject();

function verifyApiOriginInBundle(apiOrigin) {
  const dist = join(web, "dist", "assets");
  if (!existsSync(dist)) {
    console.error("dist/assets missing after mobile build");
    process.exit(1);
  }
  const needle = apiOrigin.replace(/\/$/, "");
  const hit = readdirSync(dist)
    .filter((f) => f.endsWith(".js"))
    .some((f) => readFileSync(join(dist, f), "utf8").includes(needle));
  if (!hit) {
    console.error(`
API URL was not baked into the APK bundle (${needle}).

  Re-run: npm run apk -- --api ${needle}
`);
    process.exit(1);
  }
}

const resolvedOrigin =
  useLocal
    ? "http://10.0.2.2:8080"
    : resolveMobileApiOrigin({ root, web, cliApi }) ??
      (cliApi ? cliApi.replace(/\/$/, "") : null);

console.log("\n==> Building web app (mobile)...");
run(web, "npm", ["run", "build:mobile"]);
if (resolvedOrigin) verifyApiOriginInBundle(resolvedOrigin);

console.log("\n==> Syncing Capacitor...");
run(web, "npx", ["cap", "sync", "android"]);

if (runOnDevice) {
  console.log("\n==> Launching on device/emulator...");
  run(web, "npx", ["cap", "run", "android"]);
  process.exit(0);
}

console.log("\n==> Gradle assembleDebug...");
const gradle =
  process.platform === "win32"
    ? join(androidDir, "gradlew.bat")
    : join(androidDir, "gradlew");
run(androidDir, gradle, ["assembleDebug"]);

if (!existsSync(apkOut)) {
  console.error("APK not found after build:", apkOut);
  process.exit(1);
}

cpSync(apkOut, apkCopy, { force: true });

console.log(`
  Done!

  APK:  ${apkCopy}

  Install on phone (USB debugging on):
    npm run apk:install
`);
