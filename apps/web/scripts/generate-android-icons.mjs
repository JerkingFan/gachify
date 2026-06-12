#!/usr/bin/env node
/**
 * Rasterize public/pwa-512.svg into Android mipmap PNGs (legacy + foreground).
 * Run: node scripts/generate-android-icons.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const res = join(root, "android", "app", "src", "main", "res");
const svg = readFileSync(join(root, "public", "pwa-512.svg"));

const launcherSizes = {
  "mipmap-mdpi": 48,
  "mipmap-hdpi": 72,
  "mipmap-xhdpi": 96,
  "mipmap-xxhdpi": 144,
  "mipmap-xxxhdpi": 192,
};

const foregroundSizes = {
  "mipmap-mdpi": 108,
  "mipmap-hdpi": 162,
  "mipmap-xhdpi": 216,
  "mipmap-xxhdpi": 324,
  "mipmap-xxxhdpi": 432,
};

async function writePng(folder, name, size, input = svg) {
  const out = join(res, folder, `${name}.png`);
  await sharp(input).resize(size, size).png().toFile(out);
  console.log("wrote", out);
}

async function main() {
  for (const [folder, size] of Object.entries(launcherSizes)) {
    await writePng(folder, "ic_launcher", size);
    await writePng(folder, "ic_launcher_round", size);
  }

  // Foreground layer: icon on transparent (adaptive fallback PNGs).
  const fgSvg = Buffer.from(
    readFileSync(join(root, "public", "pwa-512.svg"))
      .toString("utf8")
      .replace(/<rect[^/]*\/>/i, "")
      .replace('fill="#121212"', 'fill="none"'),
  );

  for (const [folder, size] of Object.entries(foregroundSizes)) {
    await writePng(folder, "ic_launcher_foreground", size, fgSvg);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
