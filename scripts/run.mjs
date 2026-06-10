#!/usr/bin/env node
/**
 * Gachify CLI — run from repo root:
 *   npm run android      → build + launch on device/emulator
 *   npm run android:apk  → build debug APK
 *   npm run dev          → full local stack (PowerShell)
 *   node scripts/run.mjs android
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const web = join(root, "apps", "web");
const cmd = process.argv[2] || "android";

function run(cwd, command, args = []) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

/** PowerShell on Windows often blocks .ps1 — Bypass for this process only. */
function runPs1(scriptName, extraArgs = []) {
  const script = join(root, "scripts", scriptName);
  run(root, "powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    script,
    ...extraArgs,
  ]);
}

function npm(args) {
  run(web, "npm", args);
}

function ensureMobileEnv() {
  const envPath = join(web, ".env.mobile");
  if (!existsSync(envPath)) {
    copyFileSync(join(web, ".env.mobile.example"), envPath);
    console.log("Created apps/web/.env.mobile (edit VITE_API_ORIGIN for your API).");
  }
}

function ensureWebDeps() {
  if (!existsSync(join(web, "node_modules"))) {
    console.log("Installing apps/web dependencies…");
    npm(["install"]);
  }
}

const help = `Gachify

  npm run setup        One-time: download Redis + MinIO (no Docker)
  npm run dev          Local stack without Docker (needs Postgres once)
  npm run dev:docker   Same but via Docker Compose
  npm run apk          Build APK -> gachify-debug.apk (one command)
  npm run android      Build + run on emulator/device
  npm run android:studio  Open Android Studio
`;

switch (cmd) {
  case "help":
  case "-h":
  case "--help":
    console.log(help);
    break;

  case "setup":
    runPs1("infra-local.ps1", ["-Setup"]);
    break;

  case "dev":
    runPs1("dev.ps1", process.argv.slice(3));
    break;

  case "android":
  case "main":
    run(root, "node", [join(root, "scripts", "build-apk.mjs"), "--run"]);
    break;

  case "android:apk":
  case "apk":
    run(root, "node", [join(root, "scripts", "build-apk.mjs"), ...process.argv.slice(3)]);
    break;

  case "android:studio":
  case "studio":
    ensureWebDeps();
    ensureMobileEnv();
    if (process.platform === "win32") {
      runPs1("build-android.ps1", ["-OpenStudio"]);
    } else {
      npm(["run", "cap:sync"]);
      npm(["run", "android:open"]);
    }
    break;

  case "android:sync":
    ensureWebDeps();
    ensureMobileEnv();
    npm(["run", "cap:sync"]);
    break;

  default:
    console.error(`Unknown command: ${cmd}\n`);
    console.log(help);
    process.exit(1);
}
