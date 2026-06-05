import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const requiredFiles = [
  "index.html",
  "game.css",
  "GameSettings.js",
  "game.js",
  "spec/game.json",
  "spec/levels.json",
  "spec/entities.json",
  "assets/manifest.json",
  "tools/validate-assets.js",
  "tools/validate-game.js",
  "tools/simulate-runs.js"
];

function fail(message) {
  console.error(`[validate-mvp] ${message}`);
  process.exitCode = 1;
}

function runNode(args) {
  execFileSync(process.execPath, args, {
    cwd: root,
    stdio: "inherit"
  });
}

requiredFiles.forEach((relativePath) => {
  if (!fs.existsSync(path.join(root, relativePath))) {
    fail(`Missing required file: ${relativePath}`);
  }
});

const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const settingsIndex = indexHtml.indexOf("GameSettings.js");
const gameIndex = indexHtml.indexOf("game.js");
if (settingsIndex === -1 || gameIndex === -1 || settingsIndex > gameIndex) {
  fail("index.html must load GameSettings.js before game.js");
}

const gameSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
[
  "showRunMenu",
  "showFacilityModal",
  "getDoorRoleText",
  "getTownSpotFromPointer",
  "getCombatForecast",
  "finishRun",
  "saveGame"
].forEach((symbol) => {
  if (!gameSource.includes(symbol)) {
    fail(`game.js is missing expected runtime capability: ${symbol}`);
  }
});

try {
  runNode(["--check", "GameSettings.js"]);
  runNode(["--check", "game.js"]);
  runNode(["tools/validate-assets.js"]);
  runNode(["tools/validate-game.js"]);
  runNode(["tools/simulate-runs.js", "--runs", "80"]);
} catch (error) {
  fail(`Nested validation failed: ${error.message}`);
}

if (!process.exitCode) {
  console.log("[validate-mvp] OK");
}
