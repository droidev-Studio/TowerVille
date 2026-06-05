import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const TERRAIN = { FLOOR: "floor", WALL: "wall", ENTRANCE: "entrance", STAIRS: "stairs" };
const BLOCKING = new Set(["door", "enemy", "boss"]);
const PASSIVE = new Set(["pickup", "chest", "event", "shop"]);
const TEMPLATE_WALLS = {
  split_garden: [[3, 1], [3, 2], [3, 4], [4, 4], [5, 5]],
  market_turn: [[2, 1], [2, 3], [4, 1], [4, 5]],
  three_paths: [[3, 1], [1, 4], [3, 4], [5, 3]],
  shop_crossroad: [[2, 2], [4, 2], [2, 5], [4, 5]],
  guard_gate: [[2, 2], [3, 2], [4, 4], [2, 4]],
  blue_shortcut: [[1, 2], [2, 2], [4, 4], [5, 4]],
  risk_chest: [[3, 1], [3, 3], [1, 5], [5, 3]],
  key_pressure: [[2, 2], [3, 2], [4, 4], [5, 4]],
  final_prep: [[2, 3], [4, 3], [3, 4], [5, 4]],
  boss_room: [[1, 2], [5, 2], [1, 4], [5, 4]]
};

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function makeRng(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function choose(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createPlayer(settings) {
  return {
    hp: settings.PLAYER.baseHp,
    maxHp: settings.PLAYER.baseHp,
    attack: settings.PLAYER.baseAttack,
    shield: 0,
    coins: settings.PLAYER.baseCoins,
    yellowKeys: settings.PLAYER.baseYellowKeys,
    blueKeys: settings.PLAYER.baseBlueKeys,
    redKeys: settings.PLAYER.baseRedKeys,
    blessings: [],
    x: 1,
    y: 5
  };
}

function createFloor(level, rng, roomSize) {
  const cells = [];
  for (let y = 0; y < roomSize; y += 1) {
    const row = [];
    for (let x = 0; x < roomSize; x += 1) {
      row.push({
        x,
        y,
        terrain: x === 0 || y === 0 || x === roomSize - 1 || y === roomSize - 1 ? TERRAIN.WALL : TERRAIN.FLOOR,
        occupant: null
      });
    }
    cells.push(row);
  }
  (TEMPLATE_WALLS[level.template] || []).forEach(([x, y]) => {
    cells[y][x].terrain = TERRAIN.WALL;
  });
  cells[5][1].terrain = TERRAIN.ENTRANCE;
  if (level.isBossFloor) {
    cells[1][3].terrain = TERRAIN.STAIRS;
  } else {
    cells[1][5].terrain = TERRAIN.STAIRS;
  }
  level.placements.forEach((placement) => {
    const resolved = { ...placement };
    if (Array.isArray(placement.randomFrom) && placement.randomFrom.length > 1) {
      resolved.id = choose(rng, placement.randomFrom);
    }
    const cell = cells[placement.y] && cells[placement.y][placement.x];
    if (cell && cell.terrain !== TERRAIN.WALL) {
      cell.occupant = resolved;
    }
  });
  return cells;
}

function getCell(cells, x, y) {
  return cells[y] && cells[y][x] ? cells[y][x] : null;
}

function neighbors(cells, cell) {
  return [
    getCell(cells, cell.x, cell.y - 1),
    getCell(cells, cell.x, cell.y + 1),
    getCell(cells, cell.x - 1, cell.y),
    getCell(cells, cell.x + 1, cell.y)
  ].filter(Boolean);
}

function reachableCells(cells, player) {
  const start = getCell(cells, player.x, player.y);
  const queue = [start];
  const seen = new Set([`${start.x},${start.y}`]);
  const reachable = [];
  while (queue.length) {
    const cell = queue.shift();
    reachable.push(cell);
    neighbors(cells, cell).forEach((next) => {
      const key = `${next.x},${next.y}`;
      if (seen.has(key) || next.terrain === TERRAIN.WALL || (next.occupant && BLOCKING.has(next.occupant.type))) {
        return;
      }
      seen.add(key);
      queue.push(next);
    });
  }
  return reachable;
}

function applyReward(player, reward, floorNumber = 1, pickupId = "") {
  const scaledReward = scaleReward(reward, floorNumber, pickupId);
  Object.entries(scaledReward || {}).forEach(([key, value]) => {
    if (key === "hp") {
      player.hp = Math.min(player.maxHp, player.hp + value + blessingEffect(player, "hpRewardBonus"));
    } else if (key === "shield" || key === "defense") {
      player.shield = Math.max(0, (player.shield || 0) + value);
    } else if (typeof player[key] === "number") {
      if (key === "coins") {
        value += blessingEffect(player, "coinRewardBonus");
      }
      player[key] += value;
    }
  });
}

function scaleReward(reward, floorNumber, pickupId) {
  const output = { ...(reward || {}) };
  const floorIndex = Math.max(0, floorNumber - 1);
  if (pickupId === "small_heart") {
    output.hp = settings.TOWER.smallHeartBase + floorIndex * settings.TOWER.smallHeartGrowthPerFloor;
  }
  if (pickupId === "big_heart") {
    output.hp = settings.TOWER.bigHeartBase + floorIndex * settings.TOWER.bigHeartGrowthPerFloor;
  }
  if (pickupId === "defense_leaf") {
    output.shield = settings.TOWER.defenseLeafBaseShield + floorNumber * settings.TOWER.defenseLeafShieldGrowthPerFloor;
    delete output.defense;
  }
  return output;
}

function combatForecast(player, occupant, entities, settings, floorNumber) {
  const table = occupant.type === "boss" ? entities.bosses : entities.enemies;
  const entity = table[occupant.id];
  const attack = player.attack + blessingEffect(player, "attackBonus") + (player.hp <= player.maxHp * 0.5 ? blessingEffect(player, "lowHpAttackBonus") : 0);
  const floorIndex = Math.max(0, floorNumber - 1);
  const enemyMaxHp = occupant.type === "boss" ? entity.hp : entity.hp + floorIndex * (entity.hpGrowth || 0);
  const enemyHpBefore = typeof occupant.currentHp === "number" ? occupant.currentHp : enemyMaxHp;
  const playerDamage = Math.max(settings.COMBAT.minimumDamage, attack);
  const damageDealt = Math.min(enemyHpBefore, playerDamage);
  const enemyHpAfter = Math.max(0, enemyHpBefore - damageDealt);
  const incomingDamage = Math.max(0, enemyHpBefore - blessingEffect(player, "combatHpLossReduction"));
  const shieldLoss = Math.min(player.shield || 0, incomingDamage);
  const hpLoss = Math.max(0, incomingDamage - shieldLoss);
  return {
    hpLoss,
    shieldLoss,
    enemyHpAfter,
    killed: enemyHpAfter <= 0,
    canFight: settings.CORE_RULES.isLethalCombatAllowed || player.hp > hpLoss,
    reward: entity.reward || {}
  };
}

function blessingEffect(player, key) {
  return (player.blessings || []).reduce((sum, blessing) => sum + (blessing.effects && typeof blessing.effects[key] === "number" ? blessing.effects[key] : 0), 0);
}

function chooseBlessing(player, entities) {
  const priority = ["moon_button", "tiny_boots", "picnic_box", "warm_cocoa", "leaf_umbrella", "acorn_purse", "clover_snack", "brave_badge", "ribbon_keyring"];
  const picked = priority.find((id) => entities.blessings[id] && !player.blessings.some((blessing) => blessing.id === id));
  if (!picked) {
    return;
  }
  const blessing = { id: picked, ...(entities.blessings[picked] || {}) };
  player.blessings.push(blessing);
  if (blessing.effects && blessing.effects.maxHpBonus) {
    player.maxHp += blessing.effects.maxHpBonus;
    player.hp += blessing.effects.maxHpBonus;
  }
  if (blessing.effects && blessing.effects.shieldBonus) {
    player.shield += blessing.effects.shieldBonus;
  }
}

function resolvePassive(cell, player, entities, rng, stats) {
  const occupant = cell.occupant;
  if (!occupant || !PASSIVE.has(occupant.type)) {
    return false;
  }
  if (occupant.type === "pickup") {
    applyReward(player, entities.pickups[occupant.id].effect || {}, cell.floorNumber || 1, occupant.id);
    stats.pickups += 1;
  }
  if (occupant.type === "chest") {
    applyReward(player, entities.chests[occupant.id].reward || {});
    stats.chests += 1;
  }
  if (occupant.type === "event") {
    const eventDefinition = entities.events[occupant.id];
    const affordable = eventDefinition.choices.filter((choice) => canAfford(player, choice.cost || {}));
    const choice = affordable.find((item) => item.outcomeTier === "good") || affordable[0];
    if (choice) {
      spend(player, choice.cost || {});
      if (choice.randomReward) {
        applyReward(player, { [choose(rng, choice.randomReward)]: 1 }, cell.floorNumber || 1);
      }
      applyReward(player, choice.reward || {}, cell.floorNumber || 1);
      stats.events += 1;
    }
  }
  if (occupant.type === "shop") {
    buyUsefulShopItems(player, entities.shops[occupant.id], entities, stats, cell.floorNumber || 1);
  }
  cell.occupant = null;
  player.x = cell.x;
  player.y = cell.y;
  return true;
}

function canAfford(player, cost) {
  return Object.entries(cost || {}).every(([key, value]) => key === "hp" ? player.hp > value : player[key] >= value);
}

function spend(player, cost) {
  Object.entries(cost || {}).forEach(([key, value]) => {
    player[key] -= value;
  });
}

function buyUsefulShopItems(player, shop, entities, stats, floorNumber) {
  let bought = false;
  const trainingPrice = settings.TOWER.shopAttackTrainingBasePrice + Math.max(0, floorNumber - 1) * settings.TOWER.shopAttackTrainingPriceGrowthPerFloor;
  if (!player.shopTrainingBought && player.coins >= trainingPrice) {
    player.coins -= trainingPrice;
    player.attack += 1;
    player.shopTrainingBought = true;
    bought = true;
  }
  shop.items.forEach((item) => {
    if (player.coins < item.price) {
      return;
    }
    const pickup = entities.pickups[item.pickupId];
    const scaledEffect = scaleReward(pickup.effect, floorNumber, item.pickupId);
    const usefulHeart = scaledEffect.hp && player.hp < player.maxHp * 0.75;
    const usefulKey = pickup.effect.yellowKeys || pickup.effect.blueKeys;
    const usefulGrowth = scaledEffect.attack || scaledEffect.shield;
    if (!usefulHeart && !usefulKey && !usefulGrowth) {
      return;
    }
    player.coins -= item.price;
    applyReward(player, pickup.effect, floorNumber, item.pickupId);
    bought = true;
  });
  if (bought) {
    stats.shops += 1;
  }
}

function simulateFloor(level, player, entities, settings, rng, stats) {
  const cells = createFloor(level, rng, settings.CORE_RULES.roomSize);
  cells.flat().forEach((cell) => {
    cell.floorNumber = level.floor;
  });
  player.x = 1;
  player.y = 5;
  if (level.floor > 1) {
    player.hp = Math.min(player.maxHp, player.hp + blessingEffect(player, "floorStartHeal"));
  }
  for (let step = 0; step < 180; step += 1) {
    const reachable = reachableCells(cells, player);
    const passive = reachable.find((cell) => cell.occupant && PASSIVE.has(cell.occupant.type));
    if (passive && resolvePassive(passive, player, entities, rng, stats)) {
      continue;
    }
    const frontier = [];
    reachable.forEach((cell) => {
      neighbors(cells, cell).forEach((next) => {
        if (next.occupant && BLOCKING.has(next.occupant.type)) {
          frontier.push(next);
        }
      });
    });
    const fight = frontier
      .filter((cell) => cell.occupant.type === "enemy" || cell.occupant.type === "boss")
      .map((cell) => ({ cell, forecast: combatForecast(player, cell.occupant, entities, settings, level.floor) }))
      .filter((item) => item.forecast.canFight)
      .sort((a, b) => a.forecast.hpLoss - b.forecast.hpLoss)[0];
    const stairs = reachable.find((cell) => cell.terrain === TERRAIN.STAIRS);
    const shouldFarmBeforeStairs = fight && !level.isBossFloor && stairs && fight.forecast.hpLoss <= Math.max(18, player.hp * 0.32);
    if (stairs && !level.isBossFloor && !shouldFarmBeforeStairs) {
      if (level.grantBlessingAfterClear) {
        chooseBlessing(player, entities);
      }
      return { cleared: true };
    }
    if (fight) {
      player.shield = Math.max(0, (player.shield || 0) - fight.forecast.shieldLoss);
      player.hp -= fight.forecast.hpLoss;
      if (fight.forecast.killed) {
        applyReward(player, fight.forecast.reward, level.floor);
        stats.enemies += 1;
        const wasBoss = fight.cell.occupant.type === "boss";
        fight.cell.occupant = null;
        player.x = fight.cell.x;
        player.y = fight.cell.y;
        if (wasBoss) {
          return { cleared: true, bossDefeated: true };
        }
      } else {
        fight.cell.occupant.currentHp = fight.forecast.enemyHpAfter;
      }
      continue;
    }
    const door = frontier.find((cell) => {
      if (cell.occupant.type !== "door") {
        return false;
      }
      const definition = entities.doors[cell.occupant.id];
      return player[definition.keyType] >= definition.keyCost;
    });
    if (door) {
      const definition = entities.doors[door.occupant.id];
      player[definition.keyType] -= definition.keyCost;
      door.occupant = null;
      player.x = door.x;
      player.y = door.y;
      stats.doors += 1;
      continue;
    }
    return { cleared: false, reason: "blocked" };
  }
  return { cleared: false, reason: "step_limit" };
}

function simulateRun(seed, levels, entities, settings) {
  const rng = makeRng(seed);
  const player = createPlayer(settings);
  const stats = { enemies: 0, doors: 0, chests: 0, events: 0, shops: 0, pickups: 0 };
  let reachedFloor = 1;
  for (const level of levels.floors) {
    reachedFloor = level.floor;
    const result = simulateFloor(clone(level), player, entities, settings, rng, stats);
    if (!result.cleared) {
      return { victory: false, reachedFloor, hp: player.hp, shield: player.shield, yellowKeys: player.yellowKeys, blueKeys: player.blueKeys, reason: result.reason, stats };
    }
    if (result.bossDefeated || level.isBossFloor) {
      return { victory: true, reachedFloor, hp: player.hp, shield: player.shield, yellowKeys: player.yellowKeys, blueKeys: player.blueKeys, reason: "cleared", stats };
    }
  }
  return { victory: true, reachedFloor, hp: player.hp, shield: player.shield, yellowKeys: player.yellowKeys, blueKeys: player.blueKeys, reason: "cleared", stats };
}

const runsArgIndex = process.argv.indexOf("--runs");
const runs = runsArgIndex >= 0 ? Number(process.argv[runsArgIndex + 1]) || 200 : 200;
const levels = readJson("spec/levels.json");
const entities = readJson("spec/entities.json");
globalThis.window = {};
await import(pathToFileURL(path.join(root, "GameSettings.js")).href);
const settings = globalThis.window.DEFAULT_GAME_SETTINGS;

const results = [];
for (let index = 0; index < runs; index += 1) {
  results.push(simulateRun(1000 + index * 7919, levels, entities, settings));
}

const wins = results.filter((result) => result.victory).length;
const avgFloor = results.reduce((sum, result) => sum + result.reachedFloor, 0) / results.length;
const avgHp = results.reduce((sum, result) => sum + result.hp, 0) / results.length;
const failByFloor = results.reduce((map, result) => {
  if (!result.victory) {
    map[result.reachedFloor] = (map[result.reachedFloor] || 0) + 1;
  }
  return map;
}, {});
const avgStats = ["enemies", "doors", "chests", "events", "shops", "pickups"].reduce((map, key) => {
  map[key] = results.reduce((sum, result) => sum + result.stats[key], 0) / results.length;
  return map;
}, {});

console.log(`[simulate-runs] runs=${runs}`);
console.log(`[simulate-runs] bossWinRate=${((wins / runs) * 100).toFixed(1)}% avgFloor=${avgFloor.toFixed(2)} avgHp=${avgHp.toFixed(1)}`);
console.log(`[simulate-runs] avgStats enemies=${avgStats.enemies.toFixed(1)} doors=${avgStats.doors.toFixed(1)} chests=${avgStats.chests.toFixed(1)} events=${avgStats.events.toFixed(1)} shops=${avgStats.shops.toFixed(1)} pickups=${avgStats.pickups.toFixed(1)}`);
console.log(`[simulate-runs] failByFloor=${JSON.stringify(failByFloor)}`);

if (wins === 0) {
  console.error("[simulate-runs] No simulated run can clear the tower.");
  process.exitCode = 1;
}
