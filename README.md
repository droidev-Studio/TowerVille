# TowerVille

TowerVille is a cozy **Magic Tower + Roguelite** HTML5 Canvas game with an Animal Crossing-inspired storybook aesthetic. Players guide a cute animal adventurer through a 10-floor fairy-tale tower, making careful route choices with HP, attack, defense, coins, keys, blessings, events, shops, and boss encounters.

中文说明：这是一个“童话魔塔 + 轻肉鸽 + 动森美术风格”的网页小游戏。玩家在 7x7 格子房间中逐层探索，通过钥匙、门、数值战斗、路线规划和随机祝福，挑战每天变化的童话魔塔。

---

## 🚀 Built in 5 Minutes with Droi AI

**From concept to full game — in minutes, not weeks.**

[Droi AI GitHub](https://github.com/droidev-studio)  

This entire cozy magic-tower roguelite game was generated end-to-end by **Droi AI** — complete with 7x7 grid exploration, deterministic Magic Tower combat, roguelite blessing choices, town progression, manifest-driven assets, cozy animal-village visuals, and a storybook tower aesthetic.

Experience the future of game development: [droidev-studio.github.io](https://droidev-studio.github.io)

Project repository: [Droi-AI-landing](https://github.com/droidev-studio/Droi-AI-landing)

---

## Template Type

- Game type: Cozy Magic Tower / Roguelite / Grid Adventure
- Runtime: HTML5 Canvas 2D
- Build step: none
- Main runtime files:
  - `index.html`
  - `game.js`
  - `game.css`
  - `GameSettings.js`
  - `spec/game.json`
  - `spec/levels.json`
  - `spec/entities.json`
  - `spec/prefabs.json`
  - `assets/manifest.json`

---

## Game Concept

TowerVille is designed around the idea of:

> **A non-scary Magic Tower roguelite.**

Instead of a dark dungeon, players enter a warm storybook tower full of toy-like walls, honeywood doors, shell doors, grumpy mushrooms, shell crabs, tangled vines, sleepy ghosts, toy knights, and a drowsy tree spirit boss.

The game combines:

- **Magic Tower strategy**: grid movement, keys, doors, HP/ATK/DEF, numeric combat, and route planning.
- **Roguelite variation**: randomized floor variants, blessings every few floors, shops, events, chests, and run-based rewards.
- **Cozy visual language**: cute animal villager, pastel colors, rounded props, friendly enemies, soft UI, and non-violent feedback.

---

## Features

- 7x7 Magic Tower room layout.
- 10-floor run structure.
- Directional keyboard movement and clickable/tappable adjacent tiles.
- Deterministic Magic Tower combat using HP / Attack / Defense.
- Combat forecast panel showing risk before taking action.
- Yellow and blue key economy.
- Honeywood doors, shell doors, and reserved mushroom door support.
- Pickups including hearts, attack flowers, shield leaves, bell pouches, and keys.
- Enemy roster:
  - Grumpy Mushroom
  - Tangled Vine
  - Shell Crab
  - Drowsy Little Ghost
  - Toy Knight
- Boss encounter:
  - Drowsy Tree Spirit
- Roguelite blessings on floors 3, 6, and 9.
- Shop and event floors.
- Chests, randomized rewards, and route-type metadata.
- Town progression with upgradeable facilities.
- LocalStorage save data.
- Manifest-driven SVG/PNG image loading and audio loading.
- Canvas fallback rendering if assets fail to load.
- Mobile movement buttons.

---

## Core Loop

```text
Town
↓
Enter today's storybook tower
↓
Explore a 7x7 floor
↓
Choose routes: fight, open doors, collect rewards, visit events, use shops
↓
Reach stairs and climb to next floor
↓
Choose roguelite blessings every 3 floors
↓
Defeat the floor-10 boss
↓
Bring home Bells, Starlight Shards, and furniture blueprints
↓
Upgrade town facilities and start another run
```

---

## Quick Start

Use a local static server so JSON specs and `assets/manifest.json` can be fetched correctly.

```powershell
cd "D:\Codex\Codex game design\TowerVille"
python -m http.server 8000
```

Open:

```text
http://127.0.0.1:8000
```

Then click:

```text
Enter Tower
```

or:

```text
Start Run
```

---

## Controls

| Action | Keys / Input |
| --- | --- |
| Move | Arrow Keys / WASD |
| Move on touch devices | On-screen arrow buttons |
| Move with mouse/touch | Click/tap adjacent reachable tile |
| Enter tower | `Enter Tower` / `Start Run` button |
| Return to town | `Town` button |
| Audio settings | `♪` button |
| Help | `?` button |

---

## Magic Tower Combat

TowerVille uses deterministic number-based combat instead of real-time action combat.

Basic combat idea:

```text
playerDamage = max(1, player.attack - enemy.defense)
enemyDamage = max(0, enemy.attack - player.defense)
turnsToDefeatEnemy = ceil(enemy.hp / playerDamage)
playerHpLoss = enemyDamage * max(0, turnsToDefeatEnemy - 1)
```

Before committing to risky moves, the UI provides forecast information through the `Inspect / Action` panel.

This makes route planning the core of the game:

- Should you spend a yellow key now?
- Should you fight a mushroom for coins?
- Should you take a detour for an attack flower?
- Should you save a blue key for a later shortcut?
- Can you survive the next enemy with current HP?

---

## Player Stats

Initial MVP values are configured in `GameSettings.js`:

| Stat | Default | Purpose |
| --- | ---: | --- |
| HP | 120 | Run survival resource |
| Attack | 12 | Determines player damage |
| Defense | 5 | Reduces enemy damage |
| Coins | 0 | Used in shops and town upgrades |
| Yellow Keys | 1 | Opens Honeywood Doors |
| Blue Keys | 0 | Opens Shell Doors |
| Red Keys | 0 | Reserved for later Mushroom Door content |

---

## Roguelite Systems

TowerVille includes light roguelite structure without overcomplicating the MVP.

### Blessing Floors

Configured in `GameSettings.js`:

```js
blessingFloors: [3, 6, 9]
```

Blessing examples include:

- Star Key
- Honey Shield
- Shell Backpack
- Petal Sword
- Mushroom Friend
- Wind Chime Sense

### Floor Variation

The tower supports randomized variations through:

- `spec/levels.json`
- `GameSettings.js` → `TOWER_GENERATION`
- Enemy/reward/event/chest variation chances

### Run Rewards

Successful or failed runs can return resources to town:

- Bells
- Starlight Shards
- Furniture blueprints

---

## Town Progression

The town is not a full building simulator. It is a lightweight meta-progression layer for the tower game.

Facilities include:

- Cottage
- Training Stump
- Guardian Leaf
- Key Shop
- Lucky Wind Chime
- Furniture Corner
- Tower Entrance

Facility progression is configured in `GameSettings.js` under:

```text
META.facilities
```

---

## Asset Architecture

All assets follow the Droi AI four-domain asset structure:

```text
assets/
  Audio & Feel/
    audio/
    effects/

  Game Art/
    bosses/
    enemies/
    map/
    map/main/
    map/collision-prefabs/
    pickups/
    skills/
    weapons/

  Ui Art/
    opening/
    run-entry/

  Visual Style/
    map/
    map/collision/
    player/
    portal/
    style-proofs/

  manifest.json
```

Current mapped resources include:

```text
assets/Visual Style/player/villager.svg
assets/Game Art/enemies/grumpy-mushroom.svg
assets/Game Art/enemies/shell-crab.svg
assets/Game Art/enemies/tangled-vine.svg
assets/Game Art/enemies/sleepy-ghost.svg
assets/Game Art/enemies/toy-knight.svg
assets/Game Art/bosses/sleepy-tree-spirit.svg
assets/Game Art/map/main/*.svg
assets/Game Art/pickups/*.svg
assets/Game Art/skills/*.svg
assets/Ui Art/run-entry/*.svg
assets/Audio & Feel/audio/*.wav
```

Do not use legacy asset paths such as:

```text
assets/player/
assets/enemies/
assets/bosses/
assets/ui-art/
```

---

## Manifest Rules

The runtime loads images and audio from:

```text
assets/manifest.json
```

The manifest contains:

- `assetArchitecture` metadata for Droi AI validation.
- `images` groups for player, enemies, boss, map, town, pickups, skills, and UI.
- `audio` groups for BGM and SFX.
- Runtime-compatible paths relative to `assets/`.

When adding a new asset:

1. Put the file in the correct four-domain folder.
2. Register it in `assets/manifest.json`.
3. Run asset validation.
4. Confirm the game still loads through a local static server.

---

## Data Files

| File | Purpose |
| --- | --- |
| `spec/game.json` | Game identity, runtime, modules, storage, content paths, run dimensions |
| `spec/levels.json` | 10-floor tower layout, templates, placements, route types, floor events |
| `spec/entities.json` | Enemies, bosses, doors, pickups, chests, rewards, stats |
| `spec/prefabs.json` | Terrain, collision prefabs, reusable behavior definitions |
| `GameSettings.js` | High-frequency tuning for rules, player stats, combat, generation, meta, HUD, audio, performance |
| `assets/manifest.json` | Canonical asset index |

---

## Validation

TowerVille includes project validation tools.

```powershell
cd "D:\Codex\Codex game design\TowerVille"
node tools\validate-game.js
node tools\validate-assets.js
node tools\validate-mvp.js
```

Additional simulation helper:

```powershell
node tools\simulate-runs.js
```

The validators check areas such as:

- Expected 10-floor tower structure.
- Valid entity references.
- Route type coverage.
- Door role rules.
- Reachability and placement constraints.
- Asset manifest references.
- MVP requirements.

---

## AI Generation Notes

AI should preserve the static HTML5 Canvas runtime and prefer changing:

- `spec/game.json`
- `spec/levels.json`
- `spec/entities.json`
- `spec/prefabs.json`
- `GameSettings.js`
- `assets/manifest.json`
- Asset files under the four-domain `assets/` structure
- Rule/design documentation

AI should avoid:

- Rewriting `game.js` unless fixing a runtime compatibility bug.
- Introducing React, Vue, Three.js, or a build step.
- Using external CDN dependencies.
- Creating fake asset paths.
- Breaking the four-domain asset architecture.
- Removing the Magic Tower route-planning core.
- Turning the game into a full island builder; town progression should remain lightweight.

---

## Design Pillars

1. **Route planning over reflexes**  
   The player wins by choosing efficient paths, not by fast action combat.

2. **Cozy, non-scary tower fantasy**  
   The tower should feel like a storybook toy world, not a dark dungeon.

3. **Readable numeric decisions**  
   HP loss, key cost, and reward value should be clear before commitment.

4. **Short roguelite runs**  
   A complete MVP run targets 10 floors and 10–20 minutes.

5. **Small-town return loop**  
   Runs feed back into gentle town upgrades and collection goals.

---

## Project Status

Current version:

```text
0.1.0
```

MVP content includes:

- 10 tower floors
- 7x7 room size
- town module
- magic tower module
- roguelite blessings
- events
- shop
- boss
- audio fallback
- asset manifest
- localStorage save key: `towerville_save_v1`

---

## License / Attribution

Generated with Droi AI as a static HTML5 Canvas game project.

For Droi AI platform and template tooling, see:

- [Droi AI GitHub](https://github.com/droidev-studio)
- [Droi-AI-landing](https://github.com/droidev-studio/Droi-AI-landing)
