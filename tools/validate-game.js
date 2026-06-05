import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const requiredDoorRoles = new Set(["main_gate", "treasure_gate", "shortcut_gate", "boss_gate"]);
const allowedRouteTypes = new Set(["combat_growth", "key_shortcut", "risk_chest", "safe_stairs", "boss_route"]);
const requiredNonBossRouteTypes = new Set(["combat_growth", "key_shortcut", "risk_chest", "safe_stairs"]);
const passableOccupants = new Set(["pickup", "chest", "event", "shop"]);
const blockingOccupants = new Set(["enemy", "boss", "door"]);

function fail(message) {
  console.error(`[validate-game] ${message}`);
  process.exitCode = 1;
}

function readJson(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
  } catch (error) {
    fail(`${relativePath} is not valid JSON: ${error.message}`);
    return null;
  }
}

function keyOf(x, y) {
  return `${x},${y}`;
}

function createTerrain(roomSize, templateWalls) {
  const walls = new Set();
  for (let y = 0; y < roomSize; y += 1) {
    for (let x = 0; x < roomSize; x += 1) {
      if (x === 0 || y === 0 || x === roomSize - 1 || y === roomSize - 1) {
        walls.add(keyOf(x, y));
      }
    }
  }
  templateWalls.forEach(([x, y]) => walls.add(keyOf(x, y)));
  return walls;
}

function reachableCells({ roomSize, walls, placements, ignoreBlockingOccupants }) {
  const occupantByCell = new Map();
  placements.forEach((placement) => occupantByCell.set(keyOf(placement.x, placement.y), placement));

  const start = { x: 1, y: 5 };
  const queue = [start];
  const seen = new Set([keyOf(start.x, start.y)]);

  while (queue.length) {
    const current = queue.shift();
    [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0]
    ].forEach(([dx, dy]) => {
      const x = current.x + dx;
      const y = current.y + dy;
      const key = keyOf(x, y);
      if (x < 0 || y < 0 || x >= roomSize || y >= roomSize || seen.has(key) || walls.has(key)) {
        return;
      }
      const occupant = occupantByCell.get(key);
      if (!ignoreBlockingOccupants && occupant && blockingOccupants.has(occupant.type)) {
        return;
      }
      seen.add(key);
      queue.push({ x, y });
    });
  }

  return seen;
}

function hasAdjacentReachableReward(door, reachable, placements) {
  return placements.some((placement) => {
    if (!passableOccupants.has(placement.type)) {
      return false;
    }
    const distance = Math.abs(placement.x - door.x) + Math.abs(placement.y - door.y);
    return distance <= 2 && !reachable.has(keyOf(placement.x, placement.y));
  });
}

function hasEntityForPlacement(entities, type, id) {
  const buckets = {
    enemy: "enemies",
    boss: "bosses",
    door: "doors",
    pickup: "pickups",
    chest: "chests",
    event: "events",
    shop: "shops"
  };
  const bucket = entities[buckets[type]];
  return !!(bucket && bucket[id]);
}

const levels = readJson("spec/levels.json");
const entities = readJson("spec/entities.json");

if (levels && entities) {
  const floors = levels.floors || [];
  const roomSize = levels.roomSize || 7;
  if (floors.length !== 10) {
    fail(`Expected 10 floors, found ${floors.length}`);
  }

  const templates = {
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

  let blueDoorCount = 0;
  let roleDoorCount = 0;
  let randomEventSlotCount = 0;
  let chestCount = 0;

  floors.forEach((floor) => {
    const placements = floor.placements || [];
    const routeTypes = floor.routeTypes || [];
    const walls = createTerrain(roomSize, templates[floor.template] || []);
    const reachableIgnoringCombat = reachableCells({ roomSize, walls, placements, ignoreBlockingOccupants: true });
    const stairsKey = floor.isBossFloor ? keyOf(3, 1) : keyOf(5, 1);

    (floor.enemyPool || []).forEach((enemyId) => {
      if (!entities.enemies || !entities.enemies[enemyId]) {
        fail(`Floor ${floor.floor} enemyPool id does not exist: ${enemyId}`);
      }
    });

    if (!reachableIgnoringCombat.has(stairsKey)) {
      fail(`Floor ${floor.floor} has no structural path from entrance to stairs`);
    }

    if (!routeTypes.length) {
      fail(`Floor ${floor.floor} missing routeTypes`);
    }
    routeTypes.forEach((routeType) => {
      if (!allowedRouteTypes.has(routeType)) {
        fail(`Floor ${floor.floor} has invalid routeType: ${routeType}`);
      }
    });
    if (!floor.isBossFloor) {
      const meaningfulRouteTypes = routeTypes.filter((routeType) => requiredNonBossRouteTypes.has(routeType));
      if (new Set(meaningfulRouteTypes).size < 2) {
        fail(`Floor ${floor.floor} needs at least 2 route types, found: ${routeTypes.join(", ")}`);
      }
    }

    placements.forEach((placement) => {
      if (!hasEntityForPlacement(entities, placement.type, placement.id)) {
        fail(`Floor ${floor.floor} placement ${placement.type}:${placement.id} does not exist in spec/entities.json`);
      }
      if (placement.type === "door" && placement.randomFrom) {
        fail(`Floor ${floor.floor} door at ${placement.x},${placement.y} must not use randomFrom`);
      }
      if (Array.isArray(placement.randomFrom)) {
        if (placement.randomFrom.length < 2) {
          fail(`Floor ${floor.floor} randomFrom at ${placement.x},${placement.y} needs at least 2 ids`);
        }
        placement.randomFrom.forEach((id) => {
          if (!hasEntityForPlacement(entities, placement.type, id)) {
            fail(`Floor ${floor.floor} randomFrom id ${placement.type}:${id} does not exist`);
          }
        });
        if (placement.type === "event") {
          randomEventSlotCount += 1;
        }
      }
    });

    const doors = placements.filter((placement) => placement.type === "door");
    chestCount += placements.filter((placement) => placement.type === "chest").length;
    if (!floor.isBossFloor && !doors.length) {
      fail(`Floor ${floor.floor} has no door decision`);
    }

    doors.forEach((door) => {
      roleDoorCount += 1;
      if (door.id === "door_blue") {
        blueDoorCount += 1;
      }
      if (!requiredDoorRoles.has(door.role)) {
        fail(`Floor ${floor.floor} door at ${door.x},${door.y} has invalid or missing role`);
      }
      if (!door.hint || door.hint.length < 8) {
        fail(`Floor ${floor.floor} door at ${door.x},${door.y} needs a useful hint`);
      }
      if (door.role === "treasure_gate") {
        const reachableWithoutDoors = reachableCells({ roomSize, walls, placements, ignoreBlockingOccupants: false });
        if (!hasAdjacentReachableReward(door, reachableWithoutDoors, placements)) {
          fail(`Floor ${floor.floor} treasure door at ${door.x},${door.y} does not appear to guard nearby reward content`);
        }
      }
    });

    if (floor.isBossFloor && !placements.some((placement) => placement.type === "boss")) {
      fail(`Boss floor ${floor.floor} has no boss placement`);
    }
  });

  if (roleDoorCount < 8) {
    fail(`Expected at least 8 meaningful door decisions, found ${roleDoorCount}`);
  }
  if (blueDoorCount < 2) {
    fail(`Expected at least 2 blue door decisions, found ${blueDoorCount}`);
  }
  if (randomEventSlotCount < 2) {
    fail(`Expected at least 2 random event slots, found ${randomEventSlotCount}`);
  }
  if (chestCount < 3) {
    fail(`Expected at least 3 chest placements, found ${chestCount}`);
  }

  if (Object.keys(entities.blessings || {}).length < 15) {
    fail(`Expected at least 15 blessings, found ${Object.keys(entities.blessings || {}).length}`);
  }
  if (Object.keys(entities.events || {}).length < 10) {
    fail(`Expected at least 10 events, found ${Object.keys(entities.events || {}).length}`);
  }
  if (Object.keys(entities.chests || {}).length < 8) {
    fail(`Expected at least 8 chests, found ${Object.keys(entities.chests || {}).length}`);
  }

  Object.entries(entities.chests || {}).forEach(([chestId, chest]) => {
    ["name", "description", "reward", "assetKey"].forEach((field) => {
      if (!chest[field]) {
        fail(`Chest ${chestId} missing ${field}`);
      }
    });
  });

  Object.entries(entities.enemies || {}).forEach(([enemyId, enemy]) => {
    if (typeof enemy.hpGrowth !== "number" || typeof enemy.attackGrowth !== "number") {
      fail(`Enemy ${enemyId} must define hpGrowth and attackGrowth for floor scaling`);
    }
  });

  const smallHeart = entities.pickups && entities.pickups.small_heart;
  const bigHeart = entities.pickups && entities.pickups.big_heart;
  if (!smallHeart || smallHeart.effect.hp !== 5 || smallHeart.scaleKey !== "smallHeart") {
    fail("small_heart must use base HP 5 and scaleKey smallHeart");
  }
  if (!bigHeart || bigHeart.effect.hp !== 15 || bigHeart.scaleKey !== "bigHeart") {
    fail("big_heart must use base HP 15 and scaleKey bigHeart");
  }
  const defenseLeaf = entities.pickups && entities.pickups.defense_leaf;
  if (!defenseLeaf || !defenseLeaf.effect.shield || defenseLeaf.scaleKey !== "defenseLeaf") {
    fail("defense_leaf must provide scaling shield");
  }

  Object.entries(entities.blessings || {}).forEach(([blessingId, blessing]) => {
    if (!blessing.assetKey) {
      fail(`Blessing ${blessingId} missing assetKey`);
    }
    if (!["default", "starlight"].includes(blessing.unlock)) {
      fail(`Blessing ${blessingId} has invalid unlock type`);
    }
  });

  const allowedOutcomeTiers = new Set(["good", "neutral", "risky"]);
  Object.entries(entities.events || {}).forEach(([eventId, eventDefinition]) => {
    (eventDefinition.choices || []).forEach((choice, index) => {
      if (!allowedOutcomeTiers.has(choice.outcomeTier)) {
        fail(`Event ${eventId} choice ${index} missing valid outcomeTier`);
      }
    });
  });

  const requiredFacilities = ["cottage", "trainingStump", "guardianLeaf", "keyShop", "luckyWindChime", "furnitureCorner"];
  requiredFacilities.forEach((facilityId) => {
    const facility = entities.townFacilities && entities.townFacilities[facilityId];
    if (!facility) {
      fail(`Missing town facility: ${facilityId}`);
      return;
    }
    ["name", "shortName", "icon", "color", "description", "nextLevelTemplate"].forEach((field) => {
      if (!facility[field]) {
        fail(`Town facility ${facilityId} missing ${field}`);
      }
    });
  });
}

if (!process.exitCode) {
  console.log("[validate-game] OK");
}
