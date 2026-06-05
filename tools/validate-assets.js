import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const requiredDirs = [
  "assets/Audio & Feel/audio",
  "assets/Audio & Feel/effects",
  "assets/Game Art/bosses",
  "assets/Game Art/enemies",
  "assets/Game Art/map",
  "assets/Game Art/map/main",
  "assets/Game Art/map/collision-prefabs",
  "assets/Game Art/minibosses",
  "assets/Game Art/pickups",
  "assets/Game Art/skills",
  "assets/Game Art/weapons",
  "assets/Ui Art/opening",
  "assets/Ui Art/run-entry",
  "assets/Visual Style/map",
  "assets/Visual Style/map/collision",
  "assets/Visual Style/player",
  "assets/Visual Style/portal",
  "assets/Visual Style/style-proofs"
];

const jsonFiles = [
  "spec/game.json",
  "spec/levels.json",
  "spec/entities.json",
  "assets/manifest.json",
  "assets/Visual Style/map/manifest.json"
];

function fail(message) {
  console.error(`[validate-assets] ${message}`);
  process.exitCode = 1;
}

function readJson(relativePath) {
  const fullPath = path.join(root, relativePath);
  try {
    return JSON.parse(fs.readFileSync(fullPath, "utf8"));
  } catch (error) {
    fail(`${relativePath} is not valid JSON: ${error.message}`);
    return null;
  }
}

requiredDirs.forEach((relativePath) => {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
    fail(`Missing required directory: ${relativePath}`);
  }
});

jsonFiles.forEach(readJson);

const manifest = readJson("assets/manifest.json");
const forbidden = ["_archive", "ui-art", "assets/player", "assets/enemies", "assets/bosses", "assets/ui"];
const manifestText = JSON.stringify(manifest || {});
forbidden.forEach((segment) => {
  if (manifestText.includes(segment)) {
    fail(`Manifest contains forbidden legacy or archive path: ${segment}`);
  }
});

function walkAssetRefs(value, refs = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => walkAssetRefs(item, refs));
    return refs;
  }
  if (value && typeof value === "object") {
    Object.keys(value).forEach((key) => {
      if (key === "src" && typeof value[key] === "string" && value[key]) {
        refs.push(value[key]);
      } else {
        walkAssetRefs(value[key], refs);
      }
    });
  }
  return refs;
}

if (manifest) {
  walkAssetRefs(manifest).forEach((src) => {
    const normalized = src.replace(/\\/g, "/");
    const fullPath = path.join(root, "assets", normalized);
    if (!fs.existsSync(fullPath)) {
      fail(`Manifest asset does not exist: ${src}`);
    }
  });
  const requiredSfx = ["move", "door", "pickup", "chest", "combat", "blocked", "blessing", "event", "buy", "boss", "win", "rest", "start"];
  requiredSfx.forEach((key) => {
    if (!manifest.audio || !manifest.audio.sfx || !manifest.audio.sfx[key] || !manifest.audio.sfx[key].src) {
      fail(`Manifest missing required SFX: ${key}`);
    }
  });
  ["town", "tower"].forEach((key) => {
    if (!manifest.audio || !manifest.audio.bgm || !manifest.audio.bgm[key] || !manifest.audio.bgm[key].src) {
      fail(`Manifest missing required BGM: ${key}`);
    }
  });
}

if (!process.exitCode) {
  console.log("[validate-assets] OK");
}
