#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apk = join(root, "gachify-debug.apk");

function findAdb() {
  const roots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.platform === "win32"
      ? join(homedir(), "AppData", "Local", "Android", "Sdk")
      : join(homedir(), "Android", "Sdk"),
  ].filter(Boolean);

  for (const sdk of roots) {
    const adb =
      process.platform === "win32"
        ? join(sdk, "platform-tools", "adb.exe")
        : join(sdk, "platform-tools", "adb");
    if (existsSync(adb)) return adb;
  }
  return null;
}

if (!existsSync(apk)) {
  console.error("APK not found. Run first: npm run apk");
  process.exit(1);
}

const adb = findAdb();
if (!adb) {
  console.error(`
adb not found. Install Android Studio SDK Platform-Tools, or run:

  "%LOCALAPPDATA%\\Android\\Sdk\\platform-tools\\adb.exe" install -r gachify-debug.apk

Or copy gachify-debug.apk to the phone and open it there.
`);
  process.exit(1);
}

console.log("Installing", apk);
const r = spawnSync(adb, ["install", "-r", apk], { stdio: "inherit" });
process.exit(r.status ?? 1);
