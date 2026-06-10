#!/usr/bin/env node
/**
 * One-command debug APK: npm run apk
 * Optional: npm run apk -- --run   (install on emulator/device)
 *           npm run apk -- --api http://192.168.1.5:8080
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const web = join(root, "apps", "web");
const androidDir = join(web, "android");
const apkOut = join(androidDir, "app", "build", "outputs", "apk", "debug", "app-debug.apk");
const apkCopy = join(root, "gachify-debug.apk");

const args = process.argv.slice(2);
const runOnDevice = args.includes("--run");
const apiFlag = args.findIndex((a) => a === "--api");
const apiOrigin = apiFlag >= 0 ? args[apiFlag + 1] : null;

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
  const envPath = join(web, ".env.mobile");
  if (apiOrigin) {
    writeFileSync(
      envPath,
      `VITE_MOBILE=true\nVITE_API_ORIGIN=${apiOrigin}\n`,
      "utf8",
    );
    console.log(`API for APK: ${apiOrigin}`);
    return;
  }
  if (!existsSync(envPath)) {
    copyFileSync(join(web, ".env.mobile.example"), envPath);
    console.log("Created .env.mobile (emulator API: http://10.0.2.2:8080)");
  }
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

console.log("\n==> Building web app (mobile)...");
run(web, "npm", ["run", "build:mobile"]);

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
  Also: ${apkOut}

  Install on phone: copy gachify-debug.apk or
    adb install gachify-debug.apk

  Phone on Wi-Fi? Rebuild with your PC IP:
    npm run apk -- --api http://192.168.x.x:8080
`);
