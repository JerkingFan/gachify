#!/usr/bin/env node
/**
 * Generate Android mipmap launcher PNGs from resources/apk-launcher-source.png
 * Run: npm run icons:android
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const res = join(root, "android", "app", "src", "main", "res");
const sourcePath = join(root, "resources", "apk-launcher-source.png");

if (!existsSync(sourcePath)) {
  console.error(`Missing ${sourcePath}`);
  process.exit(1);
}

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

/** Square master with padding for adaptive-icon safe zone (~18% inset). */
async function buildMaster() {
  const meta = await sharp(sourcePath).metadata();
  const maxSide = Math.max(meta.width ?? 1, meta.height ?? 1);
  const upscale = Math.max(1, Math.ceil(512 / maxSide));
  const upscaledW = (meta.width ?? 1) * upscale;
  const upscaledH = (meta.height ?? 1) * upscale;

  const upscaled = await sharp(sourcePath)
    .resize(upscaledW, upscaledH, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();

  const canvas = 512;
  const pad = Math.round(canvas * 0.12);
  const inner = canvas - pad * 2;
  const fitW = Math.round(inner * 0.88);
  const fitH = Math.round((fitW * upscaledH) / upscaledW);

  return sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: await sharp(upscaled)
          .resize(fitW, fitH, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer(),
        gravity: "center",
      },
    ])
    .png()
    .toBuffer();
}

/** Full-bleed square launcher (legacy icons). */
async function buildLauncherMaster() {
  const meta = await sharp(sourcePath).metadata();
  const maxSide = Math.max(meta.width ?? 1, meta.height ?? 1);
  const upscale = Math.max(1, Math.ceil(512 / maxSide));

  return sharp(sourcePath)
    .resize((meta.width ?? 1) * upscale, (meta.height ?? 1) * upscale, {
      kernel: sharp.kernel.nearest,
    })
    .resize(512, 512, {
      fit: "contain",
      background: { r: 18, g: 18, b: 18, alpha: 255 },
    })
    .png()
    .toBuffer();
}

async function writePng(folder, name, size, input) {
  const out = join(res, folder, `${name}.png`);
  await sharp(input).resize(size, size).png().toFile(out);
  console.log("wrote", out);
}

async function main() {
  const [fgMaster, launcherMaster] = await Promise.all([buildMaster(), buildLauncherMaster()]);

  for (const [folder, size] of Object.entries(launcherSizes)) {
    await writePng(folder, "ic_launcher", size, launcherMaster);
    await writePng(folder, "ic_launcher_round", size, launcherMaster);
  }

  for (const [folder, size] of Object.entries(foregroundSizes)) {
    await writePng(folder, "ic_launcher_foreground", size, fgMaster);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
