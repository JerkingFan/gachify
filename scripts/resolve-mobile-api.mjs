import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

function isLocalOrigin(url) {
  if (!url) return true;
  try {
    const { hostname } = new URL(url);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "10.0.2.2" ||
      hostname.endsWith(".local")
    );
  } catch {
    return true;
  }
}

/** Pick API origin baked into the APK. */
export function resolveMobileApiOrigin({ root, web, cliApi }) {
  if (cliApi) return cliApi.replace(/\/$/, "");

  const prodFile = join(web, ".env.mobile.production");
  if (existsSync(prodFile)) {
    const origin = parseEnv(readFileSync(prodFile, "utf8")).VITE_API_ORIGIN?.trim();
    if (origin && !isLocalOrigin(origin)) return origin.replace(/\/$/, "");
  }

  for (const envPath of [join(root, ".env"), join(root, ".env.production")]) {
    if (!existsSync(envPath)) continue;
    const url = parseEnv(readFileSync(envPath, "utf8")).GACHIFY_PUBLIC_API_URL?.trim();
    if (url && !isLocalOrigin(url)) return url.replace(/\/$/, "");
  }

  const mobileFile = join(web, ".env.mobile");
  if (existsSync(mobileFile)) {
    const origin = parseEnv(readFileSync(mobileFile, "utf8")).VITE_API_ORIGIN?.trim();
    if (origin && !isLocalOrigin(origin)) return origin.replace(/\/$/, "");
  }

  return null;
}

export function writeMobileEnv(web, apiOrigin) {
  writeFileSync(join(web, ".env.mobile"), `VITE_MOBILE=true\nVITE_API_ORIGIN=${apiOrigin}\n`, "utf8");
}
