#!/usr/bin/env node
// Rasterizes SVG masters in assets/source/ into the PNG variants used by the
// web app (public/) and the iOS AppIcon/Splash pipeline (assets/*.png).
//
// Usage:
//   node scripts/build-icons.mjs           # build all
//   node scripts/build-icons.mjs --verify  # regenerate to tmp, diff against committed PNGs

import sharp from "sharp";
import { mkdir, readFile, writeFile, rm, mkdtemp } from "fs/promises";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { createHash } from "crypto";

const BRAND_BG = "#09090b";

const JOBS = [
  // App icon
  { src: "assets/source/icon.svg",     out: "public/blipp-icon-transparent-192.png", size: 192  },
  { src: "assets/source/icon.svg",     out: "public/blipp-icon-transparent-512.png", size: 512  },
  { src: "assets/source/icon.svg",     out: "assets/icon-only.png",                  size: 1024, flatten: true },
  // iOS AppIcon — single 1024x1024 file consumed by Xcode via Contents.json
  { src: "assets/source/icon.svg",     out: "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", size: 1024, flatten: true },
  // Wordmark (preserve aspect ratio, constrain height)
  { src: "assets/source/wordmark.svg", out: "public/blipp-wordmark-transparent.png", height: 256 },
  // Splash
  { src: "assets/source/splash.svg",   out: "public/splash.png",                     size: 1536, flatten: true },
  { src: "assets/source/splash.svg",   out: "assets/splash.png",                     size: 2732, flatten: true },
  // iOS Splash — Xcode Splash.imageset wants three identical copies for @1x/@2x/@3x scales
  { src: "assets/source/splash.svg",   out: "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png",   size: 2732, flatten: true },
  { src: "assets/source/splash.svg",   out: "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png", size: 2732, flatten: true },
  { src: "assets/source/splash.svg",   out: "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png", size: 2732, flatten: true },
];

async function render(job) {
  const input = await readFile(job.src);
  let pipeline = sharp(input, { density: 384 });
  if (job.size) {
    pipeline = pipeline.resize(job.size, job.size, { fit: "inside" });
  } else if (job.height) {
    pipeline = pipeline.resize({ height: job.height });
  }
  if (job.flatten) {
    pipeline = pipeline.flatten({ background: BRAND_BG });
  }
  return pipeline.png().toBuffer();
}

async function pixelHash(pngBuf) {
  const { data, info } = await sharp(pngBuf).raw().toBuffer({ resolveWithObject: true });
  const h = createHash("sha256");
  h.update(`${info.width}x${info.height}x${info.channels}`);
  h.update(data);
  return h.digest("hex");
}

async function build(destRoot) {
  const results = [];
  for (const job of JOBS) {
    const buf = await render(job);
    const outPath = join(destRoot, job.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, buf);
    results.push({ job, buf });
    console.log(`  ✓ ${job.out}`);
  }
  return results;
}

async function verify() {
  const tmp = await mkdtemp(join(tmpdir(), "blipp-icons-"));
  try {
    const generated = [];
    for (const job of JOBS) {
      const buf = await render(job);
      generated.push({ job, buf });
    }
    let drift = false;
    for (const { job, buf } of generated) {
      let committed;
      try {
        committed = await readFile(job.out);
      } catch {
        console.error(`  ✗ missing: ${job.out}`);
        drift = true;
        continue;
      }
      const [a, b] = await Promise.all([pixelHash(buf), pixelHash(committed)]);
      if (a !== b) {
        console.error(`  ✗ drift:   ${job.out}`);
        drift = true;
      } else {
        console.log(`  ✓ in sync: ${job.out}`);
      }
    }
    if (drift) {
      console.error("\nIcons drifted from their SVG sources.");
      console.error("Run `npm run icons:build` and commit the regenerated PNGs.");
      process.exit(1);
    }
    console.log("\nAll icons are in sync with their SVG sources.");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

const arg = process.argv[2];
if (arg === "--verify") {
  console.log("Verifying icons against sources...");
  await verify();
} else {
  console.log("Building icons from sources...");
  await build(".");
  console.log("\nDone.");
}
