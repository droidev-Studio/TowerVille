(function () {
  "use strict";

  const GAME_STATES = Object.freeze({
    BOOT: "BOOT",
    TOWN: "TOWN",
    RUNNING: "RUNNING",
    MODAL: "MODAL",
    SETTLEMENT: "SETTLEMENT"
  });

  const ACTIONS = Object.freeze({
    MOVE_UP: "MOVE_UP",
    MOVE_DOWN: "MOVE_DOWN",
    MOVE_LEFT: "MOVE_LEFT",
    MOVE_RIGHT: "MOVE_RIGHT",
    CONFIRM: "CONFIRM",
    CANCEL: "CANCEL",
    OPEN_MENU: "OPEN_MENU"
  });

  const TERRAIN = Object.freeze({
    FLOOR: "floor",
    WALL: "wall",
    ENTRANCE: "entrance",
    STAIRS: "stairs"
  });

  const OCCUPANT = Object.freeze({
    ENEMY: "enemy",
    BOSS: "boss",
    DOOR: "door",
    PICKUP: "pickup",
    CHEST: "chest",
    EVENT: "event",
    SHOP: "shop"
  });

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

  const TOWN_SPOTS = [
    { id: "cottage", kind: "facility", x: 114, y: 160, radius: 68, labelX: 114, labelY: 252, labelWidth: 112 },
    { id: "trainingStump", kind: "facility", x: 588, y: 170, radius: 74, labelX: 588, labelY: 268, labelWidth: 112 },
    { id: "guardianLeaf", kind: "facility", x: 616, y: 330, radius: 76, labelX: 625, labelY: 440, labelWidth: 112 },
    { id: "keyShop", kind: "facility", x: 103, y: 335, radius: 70, labelX: 102, labelY: 438, labelWidth: 112 },
    { id: "luckyWindChime", kind: "facility", x: 122, y: 548, radius: 88, labelX: 124, labelY: 666, labelWidth: 118 },
    { id: "furnitureCorner", kind: "facility", x: 565, y: 565, radius: 92, labelX: 574, labelY: 682, labelWidth: 120 },
    { id: "towerEntry", kind: "tower", x: 380, y: 280, radius: 104, labelX: 380, labelY: 426, labelWidth: 126 }
  ];

  const runtime = {
    state: GAME_STATES.BOOT,
    previousState: GAME_STATES.BOOT,
    dom: {},
    canvas: null,
    ctx: null,
    settings: null,
    spec: null,
    levels: null,
    entities: null,
    prefabs: null,
    manifest: null,
    imageAssets: new Map(),
    audioAssets: new Map(),
    currentBgm: null,
    save: null,
    run: null,
    selectedCell: null,
    selectedTownSpot: null,
    modalCloseAction: null,
    audioContext: null,
    lastSfxAt: 0,
    floatingTexts: [],
    damageFeedback: null,
    animationFrame: 0
  };

  document.addEventListener("DOMContentLoaded", boot);

  async function boot() {
    cacheDom();
    bindInput();
    runtime.settings = window.GAME_SETTINGS || {};
    loadAudioPreferences();
    changeState(GAME_STATES.BOOT);

    try {
      const [spec, levels, entities, prefabs, manifest] = await Promise.all([
        loadJson("spec/game.json"),
        loadJson("spec/levels.json"),
        loadJson("spec/entities.json"),
        loadJson("spec/prefabs.json"),
        loadJson("assets/manifest.json")
      ]);
      runtime.spec = spec;
      runtime.levels = levels;
      runtime.entities = entities;
      runtime.prefabs = prefabs;
      runtime.manifest = manifest;
      runtime.imageAssets = await loadManifestImages(manifest);
      runtime.audioAssets = loadManifestAudio(manifest);
      runtime.save = loadSave();
      addSystemLog("Welcome back. Today's tower is ready.");
      changeState(GAME_STATES.TOWN);
      startBgm("town");
      updateInterface();
      draw();
      startRenderLoop();
    } catch (error) {
      showOverlay("Load Failed", "Open index.html through a local static server and make sure the spec and manifest JSON files can be loaded.", "Retry", () => window.location.reload());
      console.error("[Boot]", error);
    }
  }

  function cacheDom() {
    runtime.canvas = document.getElementById("gameCanvas");
    runtime.ctx = runtime.canvas.getContext("2d");
    runtime.dom = {
      newRunButton: document.getElementById("newRunButton"),
      townButton: document.getElementById("townButton"),
      audioButton: document.getElementById("audioButton"),
      helpButton: document.getElementById("helpButton"),
      overlayStartButton: document.getElementById("overlayStartButton"),
      stateOverlay: document.getElementById("stateOverlay"),
      overlayTitle: document.querySelector("#stateOverlay h2"),
      overlayBody: document.querySelector("#stateOverlay p"),
      floorLabel: document.getElementById("floorLabel"),
      stateLabel: document.getElementById("stateLabel"),
      hpValue: document.getElementById("hpValue"),
      attackValue: document.getElementById("attackValue"),
      defenseValue: document.getElementById("defenseValue"),
      coinsValue: document.getElementById("coinsValue"),
      yellowKeysValue: document.getElementById("yellowKeysValue"),
      blueKeysValue: document.getElementById("blueKeysValue"),
      goalPanel: document.getElementById("goalPanel"),
      forecastPanel: document.getElementById("forecastPanel"),
      blessingList: document.getElementById("blessingList"),
      logPanel: document.getElementById("logPanel"),
      modalBackdrop: document.getElementById("modalBackdrop"),
      modalTitle: document.getElementById("modalTitle"),
      modalBody: document.getElementById("modalBody"),
      modalOptions: document.getElementById("modalOptions"),
      modalCloseButton: document.getElementById("modalCloseButton")
    };
  }

  function bindInput() {
    const keyToAction = {
      ArrowUp: ACTIONS.MOVE_UP,
      KeyW: ACTIONS.MOVE_UP,
      ArrowDown: ACTIONS.MOVE_DOWN,
      KeyS: ACTIONS.MOVE_DOWN,
      ArrowLeft: ACTIONS.MOVE_LEFT,
      KeyA: ACTIONS.MOVE_LEFT,
      ArrowRight: ACTIONS.MOVE_RIGHT,
      KeyD: ACTIONS.MOVE_RIGHT,
      Enter: ACTIONS.CONFIRM,
      Escape: ACTIONS.CANCEL
    };

    document.addEventListener("keydown", (event) => {
      const action = keyToAction[event.code];
      if (!action) {
        return;
      }
      event.preventDefault();
      handleAction(action);
    });

    runtime.canvas.addEventListener("mousemove", (event) => {
      if (runtime.state === GAME_STATES.TOWN && !runtime.run) {
        runtime.selectedTownSpot = getTownSpotFromPointer(event);
        updateTownForecast(runtime.selectedTownSpot);
        return;
      }
      const cell = getCellFromPointer(event);
      runtime.selectedCell = cell;
      updateForecastForCell(cell);
    });

    runtime.canvas.addEventListener("mouseleave", () => {
      runtime.selectedCell = null;
      runtime.selectedTownSpot = null;
      updateForecastForCell(null);
      if (runtime.state === GAME_STATES.TOWN && !runtime.run) {
        updateTownForecast(null);
      }
    });

    runtime.canvas.addEventListener("click", (event) => {
      if (runtime.state === GAME_STATES.TOWN && !runtime.run) {
        const spot = getTownSpotFromPointer(event);
        if (spot) {
          handleTownSpotClick(spot);
        }
        return;
      }
      const cell = getCellFromPointer(event);
      if (!cell || runtime.state !== GAME_STATES.RUNNING) {
        return;
      }
      const player = runtime.run.player;
      const dx = cell.x - player.x;
      const dy = cell.y - player.y;
      if (Math.abs(dx) + Math.abs(dy) === 1) {
        moveByDelta(dx, dy);
      } else {
        runtime.selectedCell = cell;
        updateForecastForCell(cell);
      }
    });

    runtime.canvas.addEventListener("touchstart", (event) => {
      const touch = event.changedTouches && event.changedTouches[0];
      if (!touch) {
        return;
      }
      event.preventDefault();
      if (runtime.state === GAME_STATES.TOWN && !runtime.run) {
        const spot = getTownSpotFromClientPoint(touch.clientX, touch.clientY);
        runtime.selectedTownSpot = spot;
        updateTownForecast(spot);
        if (spot) {
          handleTownSpotClick(spot);
        }
        return;
      }
      const cell = getCellFromClientPoint(touch.clientX, touch.clientY);
      if (!cell || runtime.state !== GAME_STATES.RUNNING) {
        return;
      }
      const player = runtime.run.player;
      const dx = cell.x - player.x;
      const dy = cell.y - player.y;
      if (Math.abs(dx) + Math.abs(dy) === 1) {
        moveByDelta(dx, dy);
      } else {
        runtime.selectedCell = cell;
        updateForecastForCell(cell);
      }
    }, { passive: false });

    document.querySelectorAll(".move-button").forEach((button) => {
      button.addEventListener("click", () => handleAction(button.dataset.action));
    });

    runtime.dom.newRunButton.addEventListener("click", handleStartButton);
    runtime.dom.overlayStartButton.addEventListener("click", startNewRun);
    runtime.dom.townButton.addEventListener("click", handleTownButton);
    runtime.dom.audioButton.addEventListener("click", showAudioModal);
    runtime.dom.helpButton.addEventListener("click", showHelpModal);
    runtime.dom.modalCloseButton.addEventListener("click", closeModal);
  }

  async function loadJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`${url} returned ${response.status}`);
    }
    return response.json();
  }

  function collectManifestImages(node, prefix = [], entries = []) {
    if (!node || typeof node !== "object") {
      return entries;
    }
    if (typeof node.src === "string" && node.src) {
      entries.push({ key: prefix.join("."), src: node.src });
      return entries;
    }
    Object.keys(node).forEach((key) => collectManifestImages(node[key], [...prefix, key], entries));
    return entries;
  }

  function collectManifestAudio(node, prefix = [], entries = []) {
    if (!node || typeof node !== "object") {
      return entries;
    }
    if (typeof node.src === "string" && node.src) {
      entries.push({ key: prefix.join("."), src: node.src });
      return entries;
    }
    Object.keys(node).forEach((key) => collectManifestAudio(node[key], [...prefix, key], entries));
    return entries;
  }

  async function loadManifestImages(manifest) {
    const imageAssets = new Map();
    const basePath = manifest && manifest.basePath ? manifest.basePath : "assets/";
    const entries = collectManifestImages(manifest && manifest.images ? manifest.images : {});
    await Promise.all(entries.map((entry) => new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        imageAssets.set(entry.key, image);
        resolve();
      };
      image.onerror = () => {
        console.warn("[Assets]", `Could not load image asset ${entry.key}: ${entry.src}`);
        resolve();
      };
      image.src = `${basePath}${entry.src}`;
    })));
    return imageAssets;
  }

  function loadManifestAudio(manifest) {
    const audioAssets = new Map();
    const basePath = manifest && manifest.basePath ? manifest.basePath : "assets/";
    const entries = collectManifestAudio(manifest && manifest.audio ? manifest.audio : {});
    entries.forEach((entry) => {
      const audio = new Audio(`${basePath}${entry.src}`);
      audio.preload = "auto";
      if (entry.key.startsWith("bgm.")) {
        audio.loop = true;
      }
      audioAssets.set(entry.key, audio);
    });
    return audioAssets;
  }

  function getImageAsset(assetKey) {
    if (!assetKey || !runtime.imageAssets) {
      return null;
    }
    return runtime.imageAssets.get(assetKey) || null;
  }

  function getManifestAssetSrc(assetKey) {
    if (!assetKey || !runtime.manifest || !runtime.manifest.images) {
      return "";
    }
    const entry = assetKey.split(".").reduce((node, key) => (node && node[key] ? node[key] : null), runtime.manifest.images);
    if (!entry || !entry.src) {
      return "";
    }
    return `${runtime.manifest.basePath || "assets/"}${entry.src}`;
  }

  function getAudioAsset(audioKey) {
    if (!audioKey || !runtime.audioAssets) {
      return null;
    }
    return runtime.audioAssets.get(audioKey) || null;
  }

  function drawImageAsset(ctx, assetKey, centerX, centerY, width, height) {
    const image = getImageAsset(assetKey);
    if (!image) {
      return false;
    }
    ctx.drawImage(image, centerX - width / 2, centerY - height / 2, width, height);
    return true;
  }

  function drawImageAssetInRect(ctx, assetKey, rect) {
    const image = getImageAsset(assetKey);
    if (!image) {
      return false;
    }
    ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
    return true;
  }

  function getTownMapDrawRect(canvas) {
    const image = getImageAsset("town.background");
    const imageWidth = image && image.naturalWidth ? image.naturalWidth : 1;
    const imageHeight = image && image.naturalHeight ? image.naturalHeight : 1;
    const scale = Math.max(canvas.width / imageWidth, canvas.height / imageHeight);
    const width = imageWidth * scale;
    const height = imageHeight * scale;
    return {
      x: (canvas.width - width) / 2,
      y: (canvas.height - height) / 2,
      width,
      height
    };
  }

  function startRenderLoop() {
    cancelAnimationFrame(runtime.animationFrame);
    const tick = () => {
      draw();
      runtime.animationFrame = requestAnimationFrame(tick);
    };
    runtime.animationFrame = requestAnimationFrame(tick);
  }

  function changeState(nextState) {
    runtime.previousState = runtime.state;
    runtime.state = nextState;
    if (window.getGameSetting("DEBUG.shouldLogStateChanges", false)) {
      console.info("[State]", runtime.previousState, "->", nextState);
    }
    updateOverlay();
    updateInterface();
  }

  function updateOverlay() {
    const overlay = runtime.dom.stateOverlay;
    if (!overlay) {
      return;
    }
    if (runtime.state === GAME_STATES.TOWN) {
      overlay.classList.add("hidden");
      return;
    }
    if (runtime.state === GAME_STATES.BOOT) {
      overlay.classList.remove("hidden");
      runtime.dom.overlayTitle.textContent = "Packing Your Bag";
      runtime.dom.overlayBody.textContent = "Loading settings, floors, and tower spirit notes.";
      runtime.dom.overlayStartButton.textContent = "Please wait";
      return;
    }
    overlay.classList.add("hidden");
  }

  function startNewRun() {
    ensureAudio();
    const seed = createRunSeed();
    runtime.floatingTexts = [];
    runtime.run = {
      floorNumber: 1,
      floorDefinition: null,
      floor: null,
      seed,
      seedLabel: formatRunSeed(seed),
      generatedFloors: null,
      blessings: [],
      player: createPlayerFromSave(),
      shopTrainingBought: {},
      log: [],
      pendingMetaRewards: {
        coins: 0,
        starlightShards: 0,
        furnitureBlueprints: []
      },
      stats: {
        enemiesDefeated: 0,
        doorsOpened: 0,
        pickupsCollected: 0,
        chestsOpened: 0,
        eventsResolved: 0,
        shopsVisited: 0,
        attackGains: 0,
        blessingsChosen: 0,
        luckyEventBonuses: 0,
        routeTypesSeen: []
      }
    };
    runtime.run.generatedFloors = generateRunFloors();
    addRunLog(`You shoulder your little pack and step into today's tower. Run ID: ${runtime.run.seedLabel}.`);
    loadFloor(1);
    changeState(GAME_STATES.RUNNING);
    startBgm("tower");
    playSfx("start");
  }

  function createRunSeed() {
    const saveRuns = runtime.save && runtime.save.stats ? runtime.save.stats.runsStarted : 0;
    const source = `${Date.now()}-${Math.floor(Math.random() * 0xffffffff)}-${saveRuns}`;
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
      hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
    }
    return (hash >>> 0) || 1;
  }

  function formatRunSeed(seed) {
    return seed.toString(36).toUpperCase().padStart(6, "0").slice(-6);
  }

  function runRandom() {
    if (!runtime.run) {
      return Math.random();
    }
    runtime.run.seed = (Math.imul(runtime.run.seed, 1664525) + 1013904223) >>> 0;
    return runtime.run.seed / 4294967296;
  }

  function chooseRunRandom(items) {
    return items[Math.floor(runRandom() * items.length)];
  }

  function generateRunFloors() {
    const sourceFloors = runtime.levels.floors || [];
    if (!window.getGameSetting("TOWER_GENERATION.isEnabled", true)) {
      return sourceFloors.map(cloneJson);
    }
    return sourceFloors.map((floor) => generateFloorDefinition(floor));
  }

  function generateFloorDefinition(baseFloor) {
    const floor = cloneJson(baseFloor);
    floor.placements = (floor.placements || []).map((placement) => ({
      ...placement,
      routeType: placement.routeType || inferPlacementRouteType(placement)
    }));
    floor.generatedNotes = [];
    if (floor.isBossFloor) {
      return floor;
    }

    maybeMoveOptionalPlacements(floor);
    const band = getFloorDifficultyBand(floor.floor);
    const maxExtra = window.getGameSetting("TOWER_GENERATION.maxExtraPlacementsPerFloor", 3);
    let extras = 0;
    const enemyBudget = (window.getGameSetting("TOWER_GENERATION.enemyBudgetByBand", [0, 1, 1, 2])[band] || 0);
    for (let index = 0; index < enemyBudget && extras < maxExtra; index += 1) {
      if (tryAddGeneratedPlacement(floor, createGeneratedEnemyPlacement(floor))) {
        extras += 1;
      }
    }

    const rewardBudget = (window.getGameSetting("TOWER_GENERATION.rewardBudgetByBand", [1, 1, 2, 2])[band] || 0);
    for (let index = 0; index < rewardBudget && extras < maxExtra; index += 1) {
      if (tryAddGeneratedPlacement(floor, createGeneratedRewardPlacement(floor, band))) {
        extras += 1;
      }
    }

    if (extras < maxExtra && runRandom() < (window.getGameSetting("TOWER_GENERATION.eventChanceByBand", [0, 0.18, 0.3, 0.42])[band] || 0)) {
      if (tryAddGeneratedPlacement(floor, createGeneratedEventPlacement())) {
        extras += 1;
      }
    }

    ensureRouteTypeTags(floor);
    if (!floor.generatedNotes.length) {
      floor.generatedNotes.push("Kept a stable route layout this floor");
    }
    return floor;
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getFloorDifficultyBand(floorNumber) {
    if (floorNumber <= 2) {
      return 0;
    }
    if (floorNumber <= 4) {
      return 1;
    }
    if (floorNumber <= 7) {
      return 2;
    }
    return 3;
  }

  function maybeMoveOptionalPlacements(floor) {
    const chance = window.getGameSetting("TOWER_GENERATION.moveOptionalPlacementChance", 0.45);
    if (runRandom() >= chance) {
      return;
    }
    const movable = floor.placements.filter((placement) => {
      if (placement.role === "main_gate" || placement.type === OCCUPANT.BOSS || placement.type === OCCUPANT.SHOP) {
        return false;
      }
      return [OCCUPANT.ENEMY, OCCUPANT.PICKUP, OCCUPANT.CHEST, OCCUPANT.EVENT].includes(placement.type);
    });
    if (!movable.length) {
      return;
    }
    const placement = chooseRunRandom(movable);
    const cell = chooseOpenPlacementCell(floor);
    if (!cell) {
      return;
    }
    placement.x = cell.x;
    placement.y = cell.y;
    placement.routeType = placement.routeType || inferPlacementRouteType(placement);
    floor.generatedNotes.push(`Moved one ${getPlacementTypeText(placement.type)}`);
  }

  function tryAddGeneratedPlacement(floor, placement) {
    const cell = chooseOpenPlacementCell(floor);
    if (!cell || !placement) {
      return false;
    }
    floor.placements.push({
      ...placement,
      x: cell.x,
      y: cell.y,
      generated: true,
      routeType: placement.routeType || inferPlacementRouteType(placement)
    });
    floor.generatedNotes.push(placement.note);
    return true;
  }

  function chooseOpenPlacementCell(floor) {
    const occupied = new Set((floor.placements || []).map((placement) => `${placement.x},${placement.y}`));
    const walls = new Set((TEMPLATE_WALLS[floor.template] || []).map(([x, y]) => `${x},${y}`));
    const stairs = floor.isBossFloor ? "3,1" : "5,1";
    const candidates = [];
    const roomSize = window.getGameSetting("CORE_RULES.roomSize", 7);
    for (let y = 1; y < roomSize - 1; y += 1) {
      for (let x = 1; x < roomSize - 1; x += 1) {
        const key = `${x},${y}`;
        if (key === "1,5" || key === stairs || walls.has(key) || occupied.has(key)) {
          continue;
        }
        candidates.push({ x, y });
      }
    }
    return candidates.length ? chooseRunRandom(candidates) : null;
  }

  function createGeneratedEnemyPlacement(floor) {
    const enemyPool = floor.enemyPool && floor.enemyPool.length
      ? floor.enemyPool
      : Object.keys(runtime.entities.enemies || {});
    const id = chooseRunRandom(enemyPool);
    const enemy = runtime.entities.enemies[id];
    return {
      type: OCCUPANT.ENEMY,
      id,
      routeType: "combat_growth",
      note: `Added a ${enemy ? enemy.name : "Tower Spirit"} route`
    };
  }

  function createGeneratedRewardPlacement(floor, band) {
    const chestChance = window.getGameSetting("TOWER_GENERATION.chestChanceByBand", [0, 0.18, 0.35, 0.5])[band] || 0;
    if (runRandom() < chestChance) {
      const chestIds = Object.keys(runtime.entities.chests || {});
      const id = chooseRunRandom(chestIds);
      const chest = runtime.entities.chests[id];
      return {
        type: OCCUPANT.CHEST,
        id,
        routeType: "risk_chest",
        note: `Added ${chest ? chest.name : "a Chest"}`
      };
    }
    const pools = [
      ["small_heart", "yellow_key", "coin_bag"],
      ["small_heart", "attack_flower", "defense_leaf", "yellow_key", "coin_bag"],
      ["big_heart", "attack_flower", "defense_leaf", "blue_key", "coin_bag"],
      ["big_heart", "attack_flower", "defense_leaf", "blue_key", "coin_bag"]
    ];
    const id = chooseRunRandom(pools[band] || pools[0]);
    const pickup = runtime.entities.pickups[id];
    return {
      type: OCCUPANT.PICKUP,
      id,
      routeType: id.includes("key") ? "key_shortcut" : "combat_growth",
      note: `Refreshed ${pickup ? pickup.name : "a reward"}`
    };
  }

  function createGeneratedEventPlacement() {
    const eventIds = Object.keys(runtime.entities.events || {});
    const id = chooseWeightedEventVariant(eventIds);
    const eventDefinition = runtime.entities.events[id];
    return {
      type: OCCUPANT.EVENT,
      id,
      routeType: "risk_chest",
      note: `Added ${eventDefinition ? eventDefinition.name : "a random event"}`
    };
  }

  function ensureRouteTypeTags(floor) {
    const routeTypes = new Set(floor.routeTypes || []);
    floor.placements.forEach((placement) => {
      if (!placement.routeType) {
        placement.routeType = inferPlacementRouteType(placement);
      }
      if (placement.routeType) {
        routeTypes.add(placement.routeType);
      }
    });
    floor.routeTypes = Array.from(routeTypes);
  }

  function inferPlacementRouteType(placement) {
    if (!placement) {
      return "";
    }
    if (placement.type === OCCUPANT.ENEMY || placement.type === OCCUPANT.PICKUP) {
      return "combat_growth";
    }
    if (placement.type === OCCUPANT.CHEST || placement.type === OCCUPANT.EVENT) {
      return "risk_chest";
    }
    if (placement.type === OCCUPANT.DOOR) {
      if (placement.role === "shortcut_gate") {
        return "key_shortcut";
      }
      if (placement.role === "treasure_gate") {
        return "risk_chest";
      }
      return "safe_stairs";
    }
    return "";
  }

  function getPlacementTypeText(type) {
    const labels = {
      [OCCUPANT.ENEMY]: "Spirit",
      [OCCUPANT.PICKUP]: "pickup",
      [OCCUPANT.CHEST]: "chest",
      [OCCUPANT.EVENT]: "event"
    };
    return labels[type] || "content";
  }

  function handleStartButton() {
    if (runtime.state === GAME_STATES.RUNNING) {
      showRunMenu();
      return;
    }
    startNewRun();
  }

  function showRunMenu() {
    if (!runtime.run) {
      return;
    }
    showModal("Adventure Menu", "Keep exploring, restart, or head back to town for a rest. Returning to town ends the run but keeps part of your resources.", [
      {
        label: "Keep Exploring",
        detail: "Close the menu and return to this floor",
        onClick: closeModal
      },
      {
        label: "Restart Today's Tower",
        detail: "Abandon this run without banking its resources",
        onClick: () => {
          closeModal();
          startNewRun();
        }
      },
      {
        label: "Return to Town",
        detail: "End the run and keep some Bells and Starlight Shards",
        onClick: () => {
          closeModal();
          finishRun(false, "You are worn out for today and are brought back to town to rest.");
        }
      },
      {
        label: "How to Play",
        detail: "Review movement, combat forecasts, doors, and keys",
        onClick: showHelpModal
      }
    ], "Close");
  }

  function createPlayerFromSave() {
    const facilities = runtime.save.facilities;
    const metaSettings = window.getGameSetting("META.facilities", {});
    const cottageLevel = facilities.cottage || 0;
    const stumpLevel = facilities.trainingStump || 0;
    const leafLevel = facilities.guardianLeaf || 0;
    const keyShopLevel = facilities.keyShop || 0;
    const hpBonus = cottageLevel * (metaSettings.cottage.hpPerLevel || 0);
    const attackBonus = stumpLevel * (metaSettings.trainingStump.attackPerLevel || 0);
    const shieldBonus = leafLevel * (metaSettings.guardianLeaf.shieldPerLevel || 0);
    const keyBonus = keyShopLevel >= 1 ? metaSettings.keyShop.yellowKeysAtLevelOne || 0 : 0;

    return {
      hp: window.getGameSetting("PLAYER.baseHp", 120) + hpBonus,
      maxHp: window.getGameSetting("PLAYER.baseHp", 120) + hpBonus,
      attack: window.getGameSetting("PLAYER.baseAttack", 12) + attackBonus,
      shield: shieldBonus,
      coins: window.getGameSetting("PLAYER.baseCoins", 0),
      yellowKeys: window.getGameSetting("PLAYER.baseYellowKeys", 1) + keyBonus,
      blueKeys: window.getGameSetting("PLAYER.baseBlueKeys", 0),
      redKeys: window.getGameSetting("PLAYER.baseRedKeys", 0),
      x: 1,
      y: 5
    };
  }

  function loadFloor(floorNumber) {
    const floorSource = runtime.run && runtime.run.generatedFloors ? runtime.run.generatedFloors : runtime.levels.floors;
    const floorDefinition = floorSource.find((floor) => floor.floor === floorNumber);
    if (!floorDefinition) {
      finishRun(true, "You found the secret balcony at the top of the tower.");
      return;
    }
    runtime.run.floorNumber = floorNumber;
    runtime.run.floorDefinition = floorDefinition;
    runtime.run.floor = createFloor(floorDefinition);
    (floorDefinition.routeTypes || []).forEach((routeType) => {
      if (!runtime.run.stats.routeTypesSeen.includes(routeType)) {
        runtime.run.stats.routeTypesSeen.push(routeType);
      }
    });
    runtime.run.player.x = 1;
    runtime.run.player.y = 5;

    if (floorNumber > 1 && hasBlessing("petal_sword")) {
      const loss = window.getGameSetting("COMBAT.petalSwordFloorHpLoss", 2);
      runtime.run.player.hp = Math.max(1, runtime.run.player.hp - loss);
      addRunLog(`Petal Sword glows softly. You lose ${loss} HP at the start of this floor.`);
    }

    const floorHeal = getBlessingEffectTotal("floorStartHeal");
    if (floorNumber > 1 && floorHeal > 0) {
      runtime.run.player.hp = Math.min(runtime.run.player.maxHp, runtime.run.player.hp + floorHeal);
      addRunLog(`A cozy blessing restores ${floorHeal} HP.`);
    }

    if (floorNumber > 1 && hasBlessing("star_key")) {
      const chance = window.getGameSetting("TOWER.starKeyChance", 0.3);
      if (Math.random() < chance) {
        runtime.run.player.yellowKeys += 1;
        addRunLog("Starlight Key flashes. You gain 1 Yellow Key.");
      }
    }

    if (floorDefinition.isBossFloor) {
      playSfx("boss");
    }

    addRunLog(`Reached Floor ${floorNumber}: ${floorDefinition.name}`);
    if (floorDefinition.generatedNotes && floorDefinition.generatedNotes.length) {
      addRunLog(`Floor changes: ${floorDefinition.generatedNotes.join("; ")}.`);
    }
    addTutorialForFloor(floorDefinition);
    runtime.selectedCell = null;
    updateInterface();
  }

  function addTutorialForFloor(floorDefinition) {
    if (!floorDefinition || runtime.save.stats.runsStarted > 0) {
      return;
    }
    const tutorialByFloor = {
      1: "Tutorial: Honeywood Doors matter. Opening one usually trades a key for a route, reward, or stair access.",
      2: "Tutorial: check the forecast before acting. Fighting costs HP, but can earn keys, Bells, or growth.",
      3: "Tutorial: after this floor, choose a Blessing. Blessings last only for this run, so patch your current weakness."
    };
    if (tutorialByFloor[floorDefinition.floor]) {
      addRunLog(tutorialByFloor[floorDefinition.floor]);
    }
  }

  function createFloor(floorDefinition) {
    const roomSize = window.getGameSetting("CORE_RULES.roomSize", 7);
    const cells = [];
    for (let y = 0; y < roomSize; y += 1) {
      const row = [];
      for (let x = 0; x < roomSize; x += 1) {
        row.push({
          x,
          y,
          terrain: x === 0 || y === 0 || x === roomSize - 1 || y === roomSize - 1 ? TERRAIN.WALL : TERRAIN.FLOOR,
          occupant: null,
          isCleared: false
        });
      }
      cells.push(row);
    }

    (TEMPLATE_WALLS[floorDefinition.template] || []).forEach(([x, y]) => {
      cells[y][x].terrain = TERRAIN.WALL;
    });

    cells[5][1].terrain = TERRAIN.ENTRANCE;
    if (floorDefinition.isBossFloor) {
      cells[1][3].terrain = TERRAIN.STAIRS;
    } else {
      cells[1][5].terrain = TERRAIN.STAIRS;
    }

    floorDefinition.placements.forEach((placement) => {
      const resolvedPlacement = resolvePlacementVariant(placement);
      const cell = cells[placement.y] && cells[placement.y][placement.x];
      if (!cell || cell.terrain === TERRAIN.WALL) {
        console.warn("[Level]", `Skipped invalid placement on floor ${floorDefinition.floor}`, placement);
        return;
      }
      cell.occupant = {
        ...resolvedPlacement,
        isCleared: false
      };
    });

    return { cells };
  }

  function resolvePlacementVariant(placement) {
    const resolved = { ...placement };
    if (!window.getGameSetting("TOWER.enableFloorVariants", true)) {
      return resolved;
    }
    if (!Array.isArray(placement.randomFrom) || placement.randomFrom.length < 2) {
      return resolved;
    }
    const chance = typeof placement.randomChance === "number" ? placement.randomChance : getPlacementVariantChance(placement.type);
    if (runRandom() > chance) {
      return resolved;
    }
    resolved.baseId = placement.id;
    resolved.id = placement.type === OCCUPANT.EVENT
      ? chooseWeightedEventVariant(placement.randomFrom)
      : chooseRunRandom(placement.randomFrom);
    return resolved;
  }

  function getPlacementVariantChance(type) {
    if (type === OCCUPANT.ENEMY) {
      return window.getGameSetting("TOWER.enemyVariantChance", 0.35);
    }
    if (type === OCCUPANT.EVENT) {
      return window.getGameSetting("TOWER.eventVariantChance", 1);
    }
    if (type === OCCUPANT.PICKUP || type === OCCUPANT.CHEST) {
      return window.getGameSetting("TOWER.rewardVariantChance", 0.55);
    }
    return 0;
  }

  function chooseWeightedEventVariant(eventIds) {
    const windChimeLevel = runtime.save && runtime.save.facilities ? runtime.save.facilities.luckyWindChime || 0 : 0;
    const bonusPerLevel = window.getGameSetting("META.facilities.luckyWindChime.goodEventWeightPerLevel", 0.05);
    const weighted = eventIds.map((eventId) => {
      const eventDefinition = runtime.entities.events[eventId] || {};
      const luckWeight = Number(eventDefinition.luckWeight) || 1;
      const facilityBoost = 1 + Math.max(0, luckWeight - 1) * windChimeLevel * (1 + bonusPerLevel * 10);
      return { eventId, weight: Math.max(0.1, facilityBoost) };
    });
    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
    let roll = runRandom() * totalWeight;
    for (const item of weighted) {
      roll -= item.weight;
      if (roll <= 0) {
        return item.eventId;
      }
    }
    return weighted[weighted.length - 1].eventId;
  }

  function handleAction(action) {
    if (runtime.state === GAME_STATES.MODAL) {
      if (action === ACTIONS.CANCEL) {
        closeModal();
      }
      return;
    }
    if (runtime.state !== GAME_STATES.RUNNING) {
      if (action === ACTIONS.CONFIRM) {
        startNewRun();
      }
      return;
    }
    if (action === ACTIONS.CANCEL || action === ACTIONS.OPEN_MENU) {
      showRunMenu();
      return;
    }
    const deltaByAction = {
      [ACTIONS.MOVE_UP]: [0, -1],
      [ACTIONS.MOVE_DOWN]: [0, 1],
      [ACTIONS.MOVE_LEFT]: [-1, 0],
      [ACTIONS.MOVE_RIGHT]: [1, 0]
    };
    const delta = deltaByAction[action];
    if (delta) {
      moveByDelta(delta[0], delta[1]);
    }
  }

  function moveByDelta(dx, dy) {
    const player = runtime.run.player;
    const target = getCell(player.x + dx, player.y + dy);
    if (!target) {
      return;
    }
    resolveTargetCell(target);
    updateInterface();
  }

  function resolveTargetCell(cell) {
    if (cell.terrain === TERRAIN.WALL) {
      addRunLog("A soft toy wall blocks the way.");
      playSfx("blocked");
      return;
    }

    const occupant = cell.occupant;
    if (occupant && !occupant.isCleared) {
      const handled = resolveOccupant(cell, occupant);
      if (!handled) {
        return;
      }
    }

    runtime.run.player.x = cell.x;
    runtime.run.player.y = cell.y;
    playSfx("move");

    if (cell.terrain === TERRAIN.STAIRS) {
      handleStairs();
      return;
    }
    checkForRestState();
  }

  function resolveOccupant(cell, occupant) {
    if (occupant.type === OCCUPANT.DOOR) {
      return resolveDoor(cell, occupant);
    }
    if (occupant.type === OCCUPANT.PICKUP) {
      return resolvePickup(cell, occupant);
    }
    if (occupant.type === OCCUPANT.CHEST) {
      return resolveChest(cell, occupant);
    }
    if (occupant.type === OCCUPANT.ENEMY || occupant.type === OCCUPANT.BOSS) {
      return resolveCombat(cell, occupant);
    }
    if (occupant.type === OCCUPANT.EVENT) {
      showEventModal(cell, occupant.id);
      return false;
    }
    if (occupant.type === OCCUPANT.SHOP) {
      runtime.run.stats.shopsVisited += 1;
      showShopModal(occupant.id);
      return false;
    }
    return true;
  }

  function resolveDoor(cell, occupant) {
    const door = runtime.entities.doors[occupant.id];
    const keyType = door.keyType;
    const keyCost = door.keyCost;
    if (runtime.run.player[keyType] < keyCost) {
      addRunLog(`Missing ${door.keyName}; ${door.name} stays closed.`);
      playSfx("blocked");
      return false;
    }
    runtime.run.player[keyType] -= keyCost;
    cell.occupant = null;
    runtime.run.stats.doorsOpened += 1;
    addRunLog(`Opened ${door.name}. The path is clear now.`);
    setActionNotice(`Open ${door.name}: ${door.keyName} -${keyCost}`, "safe");
    addFloatingText(cell.x, cell.y, `-${keyCost} Key`, "#dba90e");
    const refundChance = getBlessingEffectTotal("doorRefundChance");
    if (refundChance > 0 && runRandom() < refundChance) {
      runtime.run.player[keyType] += keyCost;
      addRunLog(`Ribbon Keyring jingles and refunds ${keyCost} ${door.keyName}.`);
    }
    if (hasBlessing("shell_backpack")) {
      const heal = window.getGameSetting("TOWER.shellBackpackDoorHeal", 4);
      runtime.run.player.hp = Math.min(runtime.run.player.maxHp, runtime.run.player.hp + heal);
      addRunLog(`Shell Backpack restores ${heal} HP.`);
    }
    playSfx("door");
    return true;
  }

  function resolvePickup(cell, occupant) {
    const pickup = runtime.entities.pickups[occupant.id];
    const effect = getScaledPickupEffect(occupant.id);
    applyReward(effect);
    cell.occupant = null;
    runtime.run.stats.pickupsCollected += 1;
    addRunLog(`Picked up ${pickup.name}.`);
    setActionNotice(`Pick up ${pickup.name}: ${describeBundle(effect)}`, "safe");
    addFloatingText(cell.x, cell.y, describeBundle(effect), pickup.color || "#6fba2c");
    playSfx("pickup");
    return true;
  }

  function resolveChest(cell, occupant) {
    const chest = runtime.entities.chests[occupant.id];
    applyReward(chest.reward || {});
    cell.occupant = null;
    runtime.run.stats.chestsOpened += 1;
    addRunLog(`Opened ${chest.name} and gained ${describeBundle(chest.reward)}.`);
    setActionNotice(`Open ${chest.name}: ${describeReward(chest.reward).replace(/^Reward: /, "")}`, "safe");
    addFloatingText(cell.x, cell.y, "Chest +" + describeBundle(chest.reward), chest.color || "#b77dee");
    playSfx("chest");
    return true;
  }

  function resolveCombat(cell, occupant) {
    const forecast = getCombatForecast(occupant);
    if (!forecast.canFight) {
      addRunLog(`Hitting ${forecast.name} is too risky right now. It would counter for ${forecast.incomingDamage} from its pre-hit HP ${forecast.enemyHpBefore}.`);
      playSfx("blocked");
      return false;
    }

    const hpBefore = runtime.run.player.hp;
    const shieldBefore = runtime.run.player.shield || 0;
    runtime.run.player.shield = Math.max(0, shieldBefore - forecast.shieldLoss);
    runtime.run.player.hp -= forecast.hpLoss;

    const counterText = `counter ${forecast.incomingDamage} from pre-hit HP ${forecast.enemyHpBefore}, Shield blocks ${forecast.shieldLoss}, HP ${hpBefore} -> ${runtime.run.player.hp}`;
    const combatNotice = `1 hit at ⚔ ${forecast.playerDamage}, enemy HP ${forecast.enemyHpBefore} -> ${forecast.enemyHpAfter}, ${counterText}`;
    addFloatingText(cell.x, cell.y, `-${forecast.damageDealt} enemy HP`, "#794f27");
    addFloatingText(cell.x, cell.y, forecast.hpLoss > 0 ? `-${forecast.hpLoss} HP` : forecast.shieldLoss > 0 ? `-${forecast.shieldLoss} Shield` : "No loss", forecast.hpLoss > 0 ? "#e05a5a" : forecast.shieldLoss > 0 ? "#19c8b9" : "#6fba2c");
    if (forecast.hpLoss > 0) {
      triggerDamageFeedback(forecast.hpLoss);
    }
    playSfx("combat");

    if (forecast.enemyHpAfter > 0) {
      occupant.currentHp = forecast.enemyHpAfter;
      addRunLog(`Hit ${forecast.name}: ${combatNotice}.`);
      setActionNotice(`Hit ${forecast.name}: ${combatNotice}`, forecast.hpLoss > 0 ? "danger" : "safe");
      return false;
    }

    applyReward(forecast.reward);
    cell.occupant = null;
    runtime.run.stats.enemiesDefeated += 1;
    const rewardText = getRewardText(forecast.reward);
    const rewardNotice = rewardText ? `, gained ${rewardText}` : "";
    addRunLog(`Calmed ${forecast.name}: ${combatNotice}${rewardNotice}.`);
    setActionNotice(`Calm ${forecast.name}: ${combatNotice}${rewardNotice}`, forecast.hpLoss > 0 ? "danger" : "safe");
    if (rewardText) {
      addFloatingText(cell.x, cell.y, `+${rewardText}`, "#6fba2c");
    }

    if (hasBlessing("mushroom_friend")) {
      const chance = window.getGameSetting("TOWER.mushroomFriendCoinChance", 0.25);
      if (Math.random() < chance) {
        const bonus = window.getGameSetting("TOWER.mushroomFriendCoinBonus", 2);
        runtime.run.player.coins += bonus;
        addRunLog(`Mushroom Buddy brings ${bonus} Bells.`);
      }
    }

    if (forecast.reward && forecast.reward.blessingChoice) {
      showBlessingChoice(null, "Drowsy Little Ghost offers a Blessing choice.");
    }

    if (occupant.type === OCCUPANT.BOSS) {
      finishRun(true, "The Drowsy Tree Spirit wakes up and relights the tower top.");
      return true;
    }
    return true;
  }

  function handleStairs() {
    const floorDefinition = runtime.run.floorDefinition;
    const nextFloor = runtime.run.floorNumber + 1;
    if (floorDefinition.isBossFloor) {
      finishRun(true, "You reach the top and see the town lights coming on one by one.");
      return;
    }
    if (floorDefinition.grantBlessingAfterClear) {
      showBlessingChoice(() => loadFloor(nextFloor), `Floor ${floorDefinition.floor} cleared. Choose a Blessing before climbing on.`);
      return;
    }
    loadFloor(nextFloor);
  }

  function getCombatForecast(occupant) {
    const table = occupant.type === OCCUPANT.BOSS ? runtime.entities.bosses : runtime.entities.enemies;
    const entity = table[occupant.id];
    const scaledEnemy = getScaledEnemyStats(entity, occupant.type);
    const enemyMaxHp = scaledEnemy.hp;
    const enemyHpBefore = typeof occupant.currentHp === "number" ? occupant.currentHp : enemyMaxHp;
    const enemyAttack = scaledEnemy.attack;
    const enemyDefense = scaledEnemy.defense;
    const playerAttack = getEffectiveAttack();
    const playerDamage = Math.max(window.getGameSetting("COMBAT.minimumDamage", 1), playerAttack);
    const damageDealt = Math.min(enemyHpBefore, playerDamage);
    const enemyHpAfter = Math.max(0, enemyHpBefore - damageDealt);
    let incomingDamage = enemyHpBefore;

    if (hasBlessing("honey_shield") && incomingDamage > 0) {
      incomingDamage = Math.max(0, incomingDamage - window.getGameSetting("COMBAT.honeyShieldReduction", 5));
    }
    incomingDamage = Math.max(0, incomingDamage - getBlessingEffectTotal("combatHpLossReduction"));
    const shieldBefore = runtime.run.player.shield || 0;
    const shieldLoss = Math.min(shieldBefore, incomingDamage);
    const hpLoss = Math.max(0, incomingDamage - shieldLoss);

    const canFight = window.getGameSetting("CORE_RULES.isLethalCombatAllowed", false) || runtime.run.player.hp > hpLoss;
    return {
      name: entity.name,
      hpLoss,
      shieldLoss,
      incomingDamage,
      turns: 1,
      playerDamage,
      damageDealt,
      enemyDamage: enemyHpBefore,
      enemyHp: enemyHpBefore,
      enemyHpBefore,
      enemyHpAfter,
      enemyMaxHp,
      enemyAttack,
      enemyDefense,
      playerHpBefore: runtime.run.player.hp,
      playerHpAfter: runtime.run.player.hp - hpLoss,
      playerShieldBefore: shieldBefore,
      playerShieldAfter: shieldBefore - shieldLoss,
      reward: entity.reward || {},
      canFight,
      type: occupant.type
    };
  }

  function getScaledEnemyStats(entity, occupantType) {
    if (occupantType === OCCUPANT.BOSS) {
      return {
        hp: Math.round(entity.hp * window.getGameSetting("TOWER.enemyHpMultiplier", 1)),
        attack: Math.round(entity.attack * window.getGameSetting("TOWER.enemyAttackMultiplier", 1)),
        defense: Math.round((entity.defense || 0) * window.getGameSetting("TOWER.enemyDefenseMultiplier", 1))
      };
    }
    const floorIndex = Math.max(0, (runtime.run ? runtime.run.floorNumber : 1) - 1);
    return {
      hp: Math.round((entity.hp + floorIndex * (entity.hpGrowth || 0)) * window.getGameSetting("TOWER.enemyHpMultiplier", 1)),
      attack: Math.round((entity.attack + floorIndex * (entity.attackGrowth || 0)) * window.getGameSetting("TOWER.enemyAttackMultiplier", 1)),
      defense: 0
    };
  }

  function checkForRestState() {
    if (!runtime.run || runtime.state !== GAME_STATES.RUNNING || window.getGameSetting("CORE_RULES.disableAutoRestCheck", false)) {
      return;
    }
    if (hasAnyReachableProgressAction()) {
      return;
    }
    addRunLog("No safe route is available. This is a good time to return to town.");
    showModal("Rest for Today", "There is no safe route forward. You will return to town and keep some resources under the failed-run rules.", [
      {
        label: "Return to Town",
        detail: "Keep some Bells and Starlight Shards",
        onClick: () => {
          closeModal();
          finishRun(false, "You are worn out for today and are brought back to town to rest.");
        }
      }
    ], "Look Around");
  }

  function hasAnyReachableProgressAction() {
    const reachable = getReachableCellsForProgress();
    for (const cell of reachable) {
      if (cell.terrain === TERRAIN.STAIRS) {
        return true;
      }
      const occupant = cell.occupant;
      if (occupant && [OCCUPANT.PICKUP, OCCUPANT.CHEST, OCCUPANT.EVENT, OCCUPANT.SHOP].includes(occupant.type)) {
        return true;
      }
      const neighbors = getNeighborCells(cell);
      for (const neighbor of neighbors) {
        if (!neighbor.occupant) {
          continue;
        }
        const target = neighbor.occupant;
        if (target.type === OCCUPANT.DOOR && canOpenDoor(target)) {
          return true;
        }
        if (target.type === OCCUPANT.ENEMY || target.type === OCCUPANT.BOSS) {
          return true;
        }
      }
    }
    return false;
  }

  function getReachableCellsForProgress() {
    const start = getCell(runtime.run.player.x, runtime.run.player.y);
    const queue = [start];
    const seen = new Set([`${start.x},${start.y}`]);
    const reachable = [];
    while (queue.length) {
      const cell = queue.shift();
      reachable.push(cell);
      getNeighborCells(cell).forEach((neighbor) => {
        const key = `${neighbor.x},${neighbor.y}`;
        if (seen.has(key) || neighbor.terrain === TERRAIN.WALL || isBlockingProgressOccupant(neighbor.occupant)) {
          return;
        }
        seen.add(key);
        queue.push(neighbor);
      });
    }
    return reachable;
  }

  function getNeighborCells(cell) {
    return [
      getCell(cell.x, cell.y - 1),
      getCell(cell.x, cell.y + 1),
      getCell(cell.x - 1, cell.y),
      getCell(cell.x + 1, cell.y)
    ].filter(Boolean);
  }

  function isBlockingProgressOccupant(occupant) {
    return !!occupant && [OCCUPANT.DOOR, OCCUPANT.ENEMY, OCCUPANT.BOSS].includes(occupant.type);
  }

  function canOpenDoor(occupant) {
    const door = runtime.entities.doors[occupant.id];
    return runtime.run.player[door.keyType] >= door.keyCost;
  }

  function getEffectiveAttack() {
    const petalBonus = hasBlessing("petal_sword") ? window.getGameSetting("COMBAT.petalSwordAttackBonus", 3) : 0;
    const lowHpBonus = runtime.run.player.hp <= runtime.run.player.maxHp * 0.5 ? getBlessingEffectTotal("lowHpAttackBonus") : 0;
    return runtime.run.player.attack + petalBonus + getBlessingEffectTotal("attackBonus") + lowHpBonus;
  }

  function getEffectiveDefense() {
    return runtime.run.player.shield || 0;
  }

  function getBlessingEffectTotal(key) {
    if (!runtime.run || !runtime.entities || !runtime.entities.blessings) {
      return 0;
    }
    return runtime.run.blessings.reduce((sum, blessingId) => {
      const blessing = runtime.entities.blessings[blessingId];
      const value = blessing && blessing.effects ? blessing.effects[key] : 0;
      return sum + (typeof value === "number" ? value : 0);
    }, 0);
  }

  function applyBlessingImmediate(blessingId) {
    const blessing = runtime.entities.blessings[blessingId];
    if (!blessing || !blessing.effects) {
      return;
    }
    if (blessing.effects.maxHpBonus) {
      runtime.run.player.maxHp += blessing.effects.maxHpBonus;
      runtime.run.player.hp += blessing.effects.maxHpBonus;
      addRunLog(`${blessing.name} gives Max HP +${blessing.effects.maxHpBonus} this run.`);
    }
    if (blessing.effects.shieldBonus) {
      runtime.run.player.shield = (runtime.run.player.shield || 0) + blessing.effects.shieldBonus;
      addRunLog(`${blessing.name} gives Shield +${blessing.effects.shieldBonus}.`);
    }
  }

  function applyReward(reward) {
    Object.keys(reward || {}).forEach((key) => {
      let value = reward[key];
      if (key === "hp") {
        value += getBlessingEffectTotal("hpRewardBonus");
        runtime.run.player.hp = Math.min(runtime.run.player.maxHp, runtime.run.player.hp + value);
        return;
      }
      if (key === "shield" || key === "defense") {
        runtime.run.player.shield = Math.max(0, (runtime.run.player.shield || 0) + value);
        return;
      }
      if (key === "furnitureBlueprints") {
        value.forEach((blueprintId) => {
          if (!runtime.run.pendingMetaRewards.furnitureBlueprints.includes(blueprintId)) {
            runtime.run.pendingMetaRewards.furnitureBlueprints.push(blueprintId);
          }
        });
        return;
      }
      if (key === "starlightShards") {
        runtime.run.pendingMetaRewards.starlightShards += value;
        return;
      }
      if (key === "blessingChoice" || key === "rareBlessing") {
        return;
      }
      if (typeof runtime.run.player[key] === "number") {
        if (key === "coins") {
          value += getBlessingEffectTotal("coinRewardBonus");
        }
        runtime.run.player[key] += value;
        if (key === "attack" && value > 0) {
          runtime.run.stats.attackGains += value;
        }
      }
    });
  }

  function getScaledPickupEffect(pickupId) {
    const pickup = runtime.entities.pickups[pickupId];
    const effect = { ...(pickup.effect || {}) };
    if (!pickup.scalesWithFloor) {
      return effect;
    }
    const floorIndex = Math.max(0, (runtime.run ? runtime.run.floorNumber : 1) - 1);
    if (pickup.scaleKey === "smallHeart") {
      effect.hp = window.getGameSetting("TOWER.smallHeartBase", 5) + floorIndex * window.getGameSetting("TOWER.smallHeartGrowthPerFloor", 4);
    }
    if (pickup.scaleKey === "bigHeart") {
      effect.hp = window.getGameSetting("TOWER.bigHeartBase", 15) + floorIndex * window.getGameSetting("TOWER.bigHeartGrowthPerFloor", 8);
    }
    if (pickup.scaleKey === "defenseLeaf") {
      effect.shield = window.getGameSetting("TOWER.defenseLeafBaseShield", 10) + (floorIndex + 1) * window.getGameSetting("TOWER.defenseLeafShieldGrowthPerFloor", 2);
      delete effect.defense;
    }
    return effect;
  }

  function applyCost(cost) {
    Object.keys(cost || {}).forEach((key) => {
      runtime.run.player[key] -= cost[key];
    });
  }

  function canAffordRunCost(cost) {
    return Object.keys(cost || {}).every((key) => {
      if (key === "hp") {
        return runtime.run.player.hp > cost[key];
      }
      return runtime.run.player[key] >= cost[key];
    });
  }

  function showBlessingChoice(afterChoice, body) {
    const available = getAvailableBlessings().filter((blessingId) => !hasBlessing(blessingId));
    const options = shuffle(available).slice(0, 3).map((blessingId) => {
      const blessing = runtime.entities.blessings[blessingId];
      return {
        label: blessing.name,
        detail: blessing.description,
        iconSrc: getManifestAssetSrc(blessing.assetKey),
        onClick: () => {
          runtime.run.blessings.push(blessingId);
          applyBlessingImmediate(blessingId);
          runtime.run.stats.blessingsChosen += 1;
          addRunLog(`Blessing gained: ${blessing.name}`);
          playSfx("blessing");
          closeModal();
          if (afterChoice) {
            afterChoice();
          } else {
            updateInterface();
          }
        }
      };
    });

    if (!options.length) {
      if (afterChoice) {
        afterChoice();
      }
      return;
    }

    showModal("Choose a Blessing", body || "Choose one Blessing for this run.", options, null);
  }

  function getAvailableBlessings() {
    const all = Object.keys(runtime.entities.blessings);
    const unlocked = new Set(["star_key", "honey_shield", "shell_backpack", ...(runtime.save.unlocks.blessings || [])]);
    return all.filter((id) => unlocked.has(id) || runtime.entities.blessings[id].unlock === "default");
  }

  function hasBlessing(blessingId) {
    return !!runtime.run && runtime.run.blessings.includes(blessingId);
  }

  function showEventModal(cell, eventId) {
    const eventDefinition = runtime.entities.events[eventId];
    const options = eventDefinition.choices.map((choice) => {
      const disabled = !canAffordRunCost(choice.cost || {});
      return {
        label: choice.label,
        detail: disabled ? "Not enough resources" : describeChoice(choice),
        disabled,
        onClick: () => {
          applyCost(choice.cost || {});
          if (choice.randomReward) {
            applyRandomEventReward(choice.randomReward, choice);
          }
          applyReward(choice.reward || {});
          if (choice.reward && choice.reward.rareBlessing) {
            const rare = ["petal_sword", "mushroom_friend", "wind_chime_sense"].find((id) => !hasBlessing(id));
            if (rare) {
              runtime.run.blessings.push(rare);
              applyBlessingImmediate(rare);
              runtime.run.stats.blessingsChosen += 1;
              addRunLog(`The hollow sends a rare Blessing: ${runtime.entities.blessings[rare].name}`);
            }
          }
          applyLuckyEventBonus(choice);
          cell.occupant = null;
          runtime.run.stats.eventsResolved += 1;
          addRunLog(`Event complete: ${eventDefinition.name}`);
          playSfx("event");
          closeModal();
          updateInterface();
          checkForRestState();
        }
      };
    });
    showModal(eventDefinition.name, eventDefinition.description, options, "Leave for Now");
  }

  function describeChoice(choice) {
    const parts = [];
    if (choice.cost && Object.keys(choice.cost).length) {
      parts.push(`Spend ${describeBundle(choice.cost)}`);
    }
    if (choice.reward && Object.keys(choice.reward).length) {
      parts.push(`Gain ${describeReward(choice.reward).replace(/^Reward: /, "")}`);
    }
    if (choice.randomReward) {
      parts.push("Gain random growth");
    }
    if (choice.outcomeTier === "good" && (runtime.save.facilities.luckyWindChime || 0) > 0) {
      parts.push("Lucky Chime may add a good bonus");
    }
    return parts.join("; ") || "Nothing happens";
  }

  function applyRandomEventReward(pool, choice) {
    const rewardKey = chooseWeightedRandomEventReward(pool, choice);
    const values = {
      hp: 20,
      attack: 1,
      shield: 8,
      yellowKeys: 1,
      coins: 5
    };
    const reward = { [rewardKey]: values[rewardKey] || 1 };
    applyReward(reward);
    addRunLog(`The hollow gives back ${describeBundle(reward)}.`);
  }

  function chooseWeightedRandomEventReward(pool, choice) {
    const windChimeLevel = runtime.save.facilities.luckyWindChime || 0;
    const goodKeys = new Set(window.getGameSetting("TOWER.eventGoodRewardKeys", []));
    const goodWeightBonus = window.getGameSetting("TOWER.eventGoodRandomRewardWeightPerWindChimeLevel", 0.35);
    const weighted = pool.map((key) => ({
      key,
      weight: 1 + (choice && choice.outcomeTier === "good" && goodKeys.has(key) ? windChimeLevel * goodWeightBonus : 0)
    }));
    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
    let roll = runRandom() * totalWeight;
    for (const item of weighted) {
      roll -= item.weight;
      if (roll <= 0) {
        return item.key;
      }
    }
    return weighted[weighted.length - 1].key;
  }

  function applyLuckyEventBonus(choice) {
    const windChimeLevel = runtime.save.facilities.luckyWindChime || 0;
    if (!choice || choice.outcomeTier !== "good" || !choice.luckyBonus || windChimeLevel <= 0) {
      return;
    }
    const chance = Math.min(0.75, windChimeLevel * window.getGameSetting("TOWER.eventGoodBonusChancePerWindChimeLevel", 0.12));
    if (runRandom() >= chance) {
      return;
    }
    applyReward(choice.luckyBonus);
    runtime.run.stats.luckyEventBonuses += 1;
    addRunLog(`Lucky Chime rings softly, adding ${describeBundle(choice.luckyBonus)}.`);
  }

  function showShopModal(shopId) {
    const shop = runtime.entities.shops[shopId];
    const discount = (runtime.save.facilities.keyShop || 0) >= 2 ? window.getGameSetting("META.facilities.keyShop.keyDiscountAtLevelTwo", 0.15) : 0;
    const options = shop.items.map((item) => {
      const pickup = runtime.entities.pickups[item.pickupId];
      const isKey = item.pickupId.includes("key");
      const price = Math.max(1, Math.round(item.price * window.getGameSetting("TOWER.shopPriceMultiplier", 1) * (isKey ? 1 - discount : 1)));
      const effect = getScaledPickupEffect(item.pickupId);
      return {
        label: `${pickup.name} - ${price} Bells`,
        detail: describeBundle(effect),
        disabled: runtime.run.player.coins < price,
        onClick: () => {
          runtime.run.player.coins -= price;
          applyReward(effect);
          addRunLog(`Bought ${pickup.name} from the Tanuki Merchant.`);
          playSfx("buy");
          showShopModal(shopId);
          updateInterface();
        }
      };
    });
    const trainingKey = `${shopId}:${runtime.run.floorNumber}`;
    const trained = !!runtime.run.shopTrainingBought[trainingKey];
    const trainingPrice = getShopAttackTrainingPrice();
    options.push({
      label: `Train Once - ${trainingPrice} Bells`,
      detail: trained ? "Already trained at this shop floor" : "Attack +1, once per shop floor",
      disabled: trained || runtime.run.player.coins < trainingPrice,
      onClick: () => {
        runtime.run.player.coins -= trainingPrice;
        runtime.run.player.attack += 1;
        runtime.run.shopTrainingBought[trainingKey] = true;
        runtime.run.stats.attackGains += 1;
        addRunLog("Trained once with the Tanuki Merchant. Attack +1.");
        setActionNotice("Training complete: Attack +1", "safe");
        playSfx("buy");
        showShopModal(shopId);
        updateInterface();
      }
    });
    showModal(shop.name, shop.description, options, "Leave Shop");
  }

  function getShopAttackTrainingPrice() {
    const floorIndex = Math.max(0, runtime.run.floorNumber - 1);
    return Math.max(1, Math.round(
      window.getGameSetting("TOWER.shopAttackTrainingBasePrice", 10) +
      floorIndex * window.getGameSetting("TOWER.shopAttackTrainingPriceGrowthPerFloor", 3)
    ));
  }

  function handleTownButton() {
    if (runtime.state === GAME_STATES.RUNNING) {
      showModal("Return to Town?", "Returning now will end the run, but it is not a death. You are simply worn out for today.", [
        {
          label: "Return to Town",
          detail: "Keep some Bells and Starlight Shards",
          onClick: () => {
            closeModal();
            finishRun(false, "You are worn out for today and are brought back to town to rest.");
          }
        }
      ], "Keep Exploring");
      return;
    }
    runtime.run = null;
    runtime.selectedTownSpot = null;
    changeState(GAME_STATES.TOWN);
    startBgm("town");
    updateTownForecast(null);
  }

  function handleTownSpotClick(spot) {
    if (spot.kind === "tower") {
      startNewRun();
      return;
    }
    if (spot.id === "furnitureCorner") {
      showFurnitureModal();
      return;
    }
    showFacilityModal(spot.id);
  }

  function showFacilityModal(facilityId) {
    const facility = runtime.entities.townFacilities[facilityId];
    const level = runtime.save.facilities[facilityId] || 0;
    const maxLevel = window.getGameSetting(`META.facilities.${facilityId}.maxLevel`, 0);
    const isMaxed = level >= maxLevel;
    const cost = getFacilityUpgradeCost(facilityId, level);
    const options = [];
    if (!isMaxed) {
      options.push({
        label: `Upgrade ${facility.name}`,
        detail: canAffordMetaCost(cost) ? `Cost ${describeMetaCost(cost)}` : `Missing: ${describeMissingMetaCost(cost)}`,
        disabled: !canAffordMetaCost(cost),
        onClick: () => {
          spendMetaCost(cost);
          runtime.save.facilities[facilityId] = level + 1;
          saveGame();
          addSystemLog(`${facility.name} reached Lv.${level + 1}.`);
          playSfx("buy");
          closeModal();
          showFacilityModal(facilityId);
          updateInterface();
        }
      });
    }
    showModal(
      `${facility.name} Lv.${level}/${maxLevel}`,
      `${facility.description}\n${getFacilityEffectText(facilityId, level)}${isMaxed ? "\nStatus: max level reached." : `\nNext: ${getFacilityEffectText(facilityId, level + 1)}\n${facility.nextLevelTemplate}\nNext-run preview after upgrade: ${getNextRunPreviewText(facilityId, level + 1)}`}`,
      options,
      "Back to Town"
    );
  }

  function showTownModal() {
    const save = runtime.save;
    const resources = save.resources;
    const options = [];
    Object.keys(runtime.entities.townFacilities).forEach((facilityId) => {
      if (facilityId === "furnitureCorner") {
        options.push({
          label: "Furniture Corner",
          detail: `${save.furnitureBlueprints.length} furniture blueprints. Collection display only; no combat stats.`,
          onClick: showFurnitureModal
        });
        return;
      }
      const facility = runtime.entities.townFacilities[facilityId];
      const level = save.facilities[facilityId] || 0;
      const maxLevel = window.getGameSetting(`META.facilities.${facilityId}.maxLevel`, 0);
      const cost = getFacilityUpgradeCost(facilityId, level);
      const isMaxed = level >= maxLevel;
      options.push({
        label: `${facility.name} Lv.${level}/${maxLevel}`,
        detail: isMaxed ? "Max Level" : `${facility.description} Upgrade cost: ${describeMetaCost(cost)}`,
        disabled: isMaxed || !canAffordMetaCost(cost),
        onClick: () => {
          spendMetaCost(cost);
          save.facilities[facilityId] = level + 1;
          saveGame();
          addSystemLog(`${facility.name} reached Lv.${level + 1}.`);
          showTownModal();
          updateInterface();
        }
      });
    });

    const unlockOptions = getBlessingUnlockOptions();
    unlockOptions.forEach((option) => options.push(option));

    showModal(
      "Town Square",
      `Bells ${resources.coins} | Starlight Shards ${resources.starlightShards}. Upgrades stay light so tower strategy still matters.`,
      options,
      "Close"
    );
  }

  function getBlessingUnlockOptions() {
    const unlocks = [
      { id: "petal_sword", cost: { coins: 60, starlightShards: 1 } },
      { id: "mushroom_friend", cost: { coins: 80, starlightShards: 1 } },
      { id: "wind_chime_sense", cost: { coins: 120, starlightShards: 2 } }
    ];
    return unlocks
      .filter((unlock) => !runtime.save.unlocks.blessings.includes(unlock.id))
      .map((unlock) => {
        const blessing = runtime.entities.blessings[unlock.id];
        return {
          label: `Unlock Blessing: ${blessing.name}`,
          detail: `${blessing.description} Requires ${describeMetaCost(unlock.cost)}`,
          disabled: !canAffordMetaCost(unlock.cost),
          onClick: () => {
            spendMetaCost(unlock.cost);
            runtime.save.unlocks.blessings.push(unlock.id);
            saveGame();
            addSystemLog(`Town remembers a new Blessing: ${blessing.name}.`);
            showTownModal();
          }
        };
      });
  }

  function showFurnitureModal() {
    const blueprints = runtime.save.furnitureBlueprints;
    const cards = blueprints.map((id) => {
      const blueprint = runtime.entities.furnitureBlueprints[id];
      if (!blueprint) {
        return `<article class="furniture-card"><div class="furniture-icon locked">?</div><strong>${escapeHtml(id)}</strong><small>Unknown Blueprint</small></article>`;
      }
      const asset = getManifestAssetSrc(blueprint.assetKey);
      const image = asset ? `<img src="${escapeHtml(asset)}" alt="" />` : `<div class="furniture-icon">Keepsake</div>`;
      return `<article class="furniture-card">${image}<strong>${escapeHtml(blueprint.name)}</strong><small>${escapeHtml(blueprint.description)}</small></article>`;
    });
    if (!cards.length) {
      cards.push('<article class="furniture-card locked"><div class="furniture-icon locked">?</div><strong>Empty Display Slot</strong><small>Clear the storybook tower to earn your first keepsake furniture.</small></article>');
    }
    showModal("Furniture Corner", "Furniture is collection-only and grants no combat stats.", [], "Back to Town");
    runtime.dom.modalBody.innerHTML = `<p>Furniture is collection-only and grants no combat stats.</p><div class="furniture-wall">${cards.join("")}</div>`;
  }

  function getFacilityUpgradeCost(facilityId, level) {
    const costs = window.getGameSetting(`META.facilities.${facilityId}.costs`, []);
    const cost = costs[level];
    if (typeof cost === "number") {
      return { coins: cost, starlightShards: 0 };
    }
    return cost || { coins: 0, starlightShards: 0 };
  }

  function getFacilityEffectText(facilityId, level) {
    const meta = window.getGameSetting(`META.facilities.${facilityId}`, {});
    if (facilityId === "cottage") {
      return `Starting HP +${level * (meta.hpPerLevel || 0)}`;
    }
    if (facilityId === "trainingStump") {
      return `Starting Attack +${level * (meta.attackPerLevel || 0)}`;
    }
    if (facilityId === "guardianLeaf") {
      return `Starting Shield +${level * (meta.shieldPerLevel || 0)}`;
    }
    if (facilityId === "keyShop") {
      if (level <= 0) {
        return "No starting key bonus yet";
      }
      return level >= 2 ? "Starting Yellow Key +1, shop keys -15%" : "Starting Yellow Key +1";
    }
    if (facilityId === "luckyWindChime") {
      return level > 0 ? `Good event weight increased; lucky bonus up to ${Math.round(level * window.getGameSetting("TOWER.eventGoodBonusChancePerWindChimeLevel", 0.12) * 100)}%` : "No event outcome bonus yet";
    }
    return "Collection display only; no combat stats";
  }

  function getNextRunPreviewText(overrideFacilityId, overrideLevel) {
    const savedFacilities = runtime.save.facilities;
    const facilities = { ...savedFacilities, [overrideFacilityId]: overrideLevel };
    const metaSettings = window.getGameSetting("META.facilities", {});
    const hp = window.getGameSetting("PLAYER.baseHp", 120) + (facilities.cottage || 0) * (metaSettings.cottage.hpPerLevel || 0);
    const attack = window.getGameSetting("PLAYER.baseAttack", 12) + (facilities.trainingStump || 0) * (metaSettings.trainingStump.attackPerLevel || 0);
    const shield = (facilities.guardianLeaf || 0) * (metaSettings.guardianLeaf.shieldPerLevel || 0);
    const yellowKeys = window.getGameSetting("PLAYER.baseYellowKeys", 1) + ((facilities.keyShop || 0) >= 1 ? metaSettings.keyShop.yellowKeysAtLevelOne || 0 : 0);
    return `HP ${hp} / ⚔️ ${attack} / Shield ${shield} / Yellow Key ${yellowKeys}`;
  }

  function canAffordMetaCost(cost) {
    return runtime.save.resources.coins >= (cost.coins || 0) && runtime.save.resources.starlightShards >= (cost.starlightShards || 0);
  }

  function spendMetaCost(cost) {
    runtime.save.resources.coins -= cost.coins || 0;
    runtime.save.resources.starlightShards -= cost.starlightShards || 0;
  }

  function finishRun(isVictory, message) {
    if (!runtime.run) {
      return;
    }
    const keepCoinRatio = isVictory ? 1 : window.getGameSetting("CORE_RULES.failureCoinKeepRatio", 0.5);
    const keepShardRatio = isVictory ? 1 : window.getGameSetting("CORE_RULES.failureShardKeepRatio", 0.5);
    const keptCoins = Math.floor(runtime.run.player.coins * keepCoinRatio) + runtime.run.pendingMetaRewards.coins;
    const keptShards = Math.floor(runtime.run.pendingMetaRewards.starlightShards * keepShardRatio);
    runtime.save.resources.coins += keptCoins;
    runtime.save.resources.starlightShards += keptShards;
    runtime.run.pendingMetaRewards.furnitureBlueprints.forEach((blueprintId) => {
      if (!runtime.save.furnitureBlueprints.includes(blueprintId)) {
        runtime.save.furnitureBlueprints.push(blueprintId);
      }
    });
    runtime.save.stats.runsStarted += 1;
    runtime.save.stats.bestFloor = Math.max(runtime.save.stats.bestFloor, runtime.run.floorNumber);
    runtime.save.stats.bestCoins = Math.max(runtime.save.stats.bestCoins, runtime.run.player.coins);
    if (isVictory) {
      runtime.save.stats.runsCleared += 1;
    }
    saveGame();
    changeState(GAME_STATES.SETTLEMENT);
    playSfx(isVictory ? "win" : "rest");
    const statLine = getSettlementSummary(keptCoins, keptShards);
    showModal(isVictory ? "Tower Cleared!" : "Back to Town", `${message}\n\n${statLine}`, [
      {
        label: "Return to Town Square",
        detail: "Check facilities and collections",
        onClick: () => {
          runtime.run = null;
          closeModal();
          changeState(GAME_STATES.TOWN);
          startBgm("town");
        }
      },
      {
        label: "Run Again",
        detail: "Jump straight into today's tower",
        onClick: () => {
          closeModal();
          startNewRun();
        }
      }
    ], null);
  }

  function getSettlementSummary(keptCoins, keptShards) {
    const stats = runtime.run.stats;
    const blessingNames = runtime.run.blessings
      .map((id) => runtime.entities.blessings[id] && runtime.entities.blessings[id].name)
      .filter(Boolean);
    const routeText = stats.routeTypesSeen
      .map(getRouteTypeText)
      .filter(Boolean)
      .join(", ") || "basic route";
    const blessingText = blessingNames.length ? blessingNames.join(", ") : "No Blessing chosen";
    return [
      `Brought back: ${keptCoins} Bells, ${keptShards} Starlight Shards, ${runtime.run.pendingMetaRewards.furnitureBlueprints.length} furniture blueprints.`,
      `Progress: reached ${runtime.run.floorNumber}F. Run ID: ${runtime.run.seedLabel}.`,
      `Run stats: calmed ${stats.enemiesDefeated} spirits, opened ${stats.doorsOpened} doors, opened ${stats.chestsOpened} chests, completed ${stats.eventsResolved} events, visited ${stats.shopsVisited} shops, gained ${stats.attackGains || 0} Attack.`,
      `Blessings: ${blessingText}.`,
      `Routes: ${routeText}.${stats.luckyEventBonuses ? ` Lucky Chime triggered ${stats.luckyEventBonuses} times.` : ""}`
    ].join("\n");
  }

  function getRouteTypeText(routeType) {
    const labels = {
      combat_growth: "Combat Growth",
      key_shortcut: "Key Shortcut",
      risk_chest: "High-Risk Chest",
      safe_stairs: "Safe Stairs",
      boss_route: "Boss Challenge"
    };
    return labels[routeType] || "";
  }

  function loadSave() {
    const fallback = createDefaultSave();
    try {
      const raw = localStorage.getItem(window.getGameSetting("CORE_RULES.saveKey", "towerville_save_v1"));
      if (!raw) {
        return fallback;
      }
      return mergeSave(fallback, JSON.parse(raw));
    } catch (error) {
      console.warn("[Save] Failed to read save. Using defaults.", error);
      return fallback;
    }
  }

  function createDefaultSave() {
    return {
      version: 1,
      resources: { coins: 0, starlightShards: 0 },
      facilities: {
        cottage: 0,
        trainingStump: 0,
        guardianLeaf: 0,
        keyShop: 0,
        luckyWindChime: 0
      },
      unlocks: {
        blessings: [],
        towerThemes: [],
        characterSkins: []
      },
      furnitureBlueprints: [],
      stats: {
        runsStarted: 0,
        runsCleared: 0,
        bestFloor: 0,
        bestCoins: 0
      }
    };
  }

  function mergeSave(base, incoming) {
    const output = typeof structuredClone === "function" ? structuredClone(base) : JSON.parse(JSON.stringify(base));
    Object.keys(incoming || {}).forEach((key) => {
      if (incoming[key] && typeof incoming[key] === "object" && !Array.isArray(incoming[key])) {
        output[key] = { ...(output[key] || {}), ...incoming[key] };
      } else {
        output[key] = incoming[key];
      }
    });
    return output;
  }

  function saveGame() {
    try {
      localStorage.setItem(window.getGameSetting("CORE_RULES.saveKey", "towerville_save_v1"), JSON.stringify(runtime.save));
    } catch (error) {
      console.warn("[Save] Failed to write save.", error);
    }
  }

  function updateInterface() {
    if (!runtime.dom.floorLabel) {
      return;
    }
    updateAudioButton();
    const run = runtime.run;
    runtime.dom.floorLabel.textContent = run ? `${run.floorNumber}F` : "Town";
    runtime.dom.stateLabel.textContent = getStateText(runtime.state);

    if (run) {
      runtime.dom.hpValue.textContent = `${run.player.hp}/${run.player.maxHp}`;
      runtime.dom.attackValue.textContent = String(getEffectiveAttack());
      runtime.dom.defenseValue.textContent = String(getEffectiveDefense());
      runtime.dom.coinsValue.textContent = String(run.player.coins);
      runtime.dom.yellowKeysValue.textContent = String(run.player.yellowKeys);
      runtime.dom.blueKeysValue.textContent = String(run.player.blueKeys);
      runtime.dom.goalPanel.textContent = getFloorGoalText();
      updateBlessingList();
      updateLogPanel(run.log);
      updateForecastForCell(runtime.selectedCell);
      return;
    }

    runtime.dom.hpValue.textContent = "-";
    runtime.dom.attackValue.textContent = "-";
    runtime.dom.defenseValue.textContent = "-";
    runtime.dom.coinsValue.textContent = runtime.save ? String(runtime.save.resources.coins) : "-";
    runtime.dom.yellowKeysValue.textContent = "-";
    runtime.dom.blueKeysValue.textContent = runtime.save ? `Starlight ${runtime.save.resources.starlightShards}` : "-";
    runtime.dom.goalPanel.textContent = "Upgrade town facilities, or enter today's tower.";
    runtime.dom.blessingList.textContent = "Choose Blessings on Floors 3, 6, and 9 after entering the tower.";
    updateLogPanel(getSystemLog());
    updateTownForecast(runtime.selectedTownSpot);
  }

  function getStateText(state) {
    const labels = {
      [GAME_STATES.BOOT]: "Loading",
      [GAME_STATES.TOWN]: "Town",
      [GAME_STATES.RUNNING]: "Exploring",
      [GAME_STATES.MODAL]: "Choosing",
      [GAME_STATES.SETTLEMENT]: "Settlement"
    };
    return labels[state] || state;
  }

  function getFloorGoalText() {
    if (!runtime.run || !runtime.run.floorDefinition) {
      return "Shown after entering the tower.";
    }
    const floor = runtime.run.floorDefinition;
    if (floor.isBossFloor) {
      return "Goal: challenge the Drowsy Tree Spirit.\nTip: collect this floor's Hearts, then preview the Boss damage.";
    }
    const parts = [`Goal: find the stairs and reach Floor ${runtime.run.floorNumber + 1}.`];
    const routeText = (floor.routeTypes || []).map(getRouteTypeText).filter(Boolean).join(", ");
    if (routeText) {
      parts.push(`Routes: ${routeText}. Tile tags show CMB / CUT / RISK / SAFE.`);
    }
    if (floor.grantBlessingAfterClear) {
      parts.push("Reward: clearing this floor grants a Blessing choice.");
    }
    if ((floor.placements || []).some((placement) => placement.type === "shop")) {
      parts.push("Tip: this floor has a Tanuki Merchant. Spend Bells to refill resources.");
    }
    if ((floor.placements || []).some((placement) => placement.type === "event")) {
      parts.push("Tip: this floor has a random event that may trade into keys or growth.");
    }
    if (runtime.run.seedLabel) {
      parts.push(`Run ID: ${runtime.run.seedLabel}`);
    }
    return parts.join("\n");
  }

  function updateTownForecast(spot) {
    const panel = runtime.dom.forecastPanel;
    if (!panel) {
      return;
    }
    panel.className = "forecast-panel safe";
    if (!spot) {
      panel.textContent = "Town Square\nInspect: hover facilities to see effects and upgrade costs.\nAction: click a facility to upgrade it, or the tower entrance to start a run.";
      return;
    }
    if (spot.kind === "tower") {
      panel.textContent = "Tower Entrance\nAction: click to start today's 10-floor storybook tower.\nTip: choose Blessings on Floors 3, 6, and 9. Challenge the Drowsy Tree Spirit on Floor 10.";
      return;
    }
    if (spot.id === "furnitureCorner") {
      panel.textContent = `Furniture Corner\nBlueprints: ${runtime.save.furnitureBlueprints.length}.\nUse: displays blueprints brought back from clears. No combat stats.\nAction: click to view the collection.`;
      return;
    }
    panel.textContent = getFacilityForecastText(spot.id);
  }

  function getFacilityForecastText(facilityId) {
    const facility = runtime.entities.townFacilities[facilityId];
    const level = runtime.save.facilities[facilityId] || 0;
    const maxLevel = window.getGameSetting(`META.facilities.${facilityId}.maxLevel`, 0);
    const cost = getFacilityUpgradeCost(facilityId, level);
    if (level >= maxLevel) {
      return `${facility.name} Lv.${level}/${maxLevel}\n${facility.description}\nCurrent: ${getFacilityEffectText(facilityId, level)}\nStatus: max level.`;
    }
    const affordText = canAffordMetaCost(cost) ? `Can upgrade: ${describeMetaCost(cost)}` : `Missing: ${describeMissingMetaCost(cost)}`;
    return `${facility.name} Lv.${level}/${maxLevel}\n${facility.description}\nCurrent: ${getFacilityEffectText(facilityId, level)}\nNext: ${getFacilityEffectText(facilityId, level + 1)}\nNext run: ${getNextRunPreviewText(facilityId, level + 1)}\n${affordText}\nAction: click to open upgrades.`;
  }

  function updateBlessingList() {
    const blessings = runtime.run.blessings;
    if (!blessings.length) {
      runtime.dom.blessingList.textContent = "No blessings yet this run.";
      return;
    }
    runtime.dom.blessingList.innerHTML = blessings
      .map((id) => {
        const blessing = runtime.entities.blessings[id];
        const asset = getManifestAssetSrc(blessing.assetKey);
        const icon = asset ? `<img src="${escapeHtml(asset)}" alt="" />` : "";
        return `<span class="blessing-chip">${icon}${escapeHtml(blessing.name)}</span>`;
      })
      .join("");
  }

  function updateLogPanel(items) {
    runtime.dom.logPanel.innerHTML = (items || [])
      .slice(-8)
      .reverse()
      .map((item) => `<div class="log-item">${escapeHtml(item)}</div>`)
      .join("");
  }

  function updateForecastForCell(cell) {
    if (!runtime.run || runtime.state !== GAME_STATES.RUNNING) {
      return;
    }
    const panel = runtime.dom.forecastPanel;
    panel.className = "forecast-panel";
    if (!cell) {
      panel.textContent = hasBlessing("wind_chime_sense") ? getFloorEnemyForecastSummary() : "Move next to a tile to preview the result.";
      return;
    }
    const player = runtime.run.player;
    const distance = Math.abs(cell.x - player.x) + Math.abs(cell.y - player.y);
    const text = getCellForecastText(cell);
    const routeType = getCellRouteType(cell);
    const routeLine = routeType ? `\nRoute type: ${getRouteTypeText(routeType)}.` : "";
    const actionHint = getActionHint(distance, cell);
    panel.textContent = `${text.message}${routeLine}${actionHint}`;
    if (text.tone) {
      panel.classList.add(text.tone);
    }
  }

  function getActionHint(distance, cell) {
    if (distance === 0) {
      return "\n\nCurrent tile: this is where you stand.";
    }
    if (distance === 1) {
      if (cell.terrain === TERRAIN.WALL) {
        return "\n\nAction: walls cannot be entered.";
      }
      return "\n\nAction: adjacent tile. Click or use movement keys to act.";
    }
    return "\n\nInspect: information only. Move next to it to act.";
  }

  function getCellForecastText(cell) {
    if (cell.terrain === TERRAIN.WALL) {
      return { message: "A toy wall blocks the way.", tone: "blocked" };
    }
    const occupant = cell.occupant;
    if (!occupant) {
      if (cell.terrain === TERRAIN.STAIRS) {
        return { message: "Stairs lead to the next floor.", tone: "safe" };
      }
      return { message: "You can move here.", tone: "safe" };
    }
    if (occupant.type === OCCUPANT.DOOR) {
      const door = runtime.entities.doors[occupant.id];
      const enough = runtime.run.player[door.keyType] >= door.keyCost;
      const roleText = getDoorRoleText(occupant.role);
      const hint = occupant.hint ? `\nBehind it: ${occupant.hint}` : "";
      const valueForecast = getDoorValueForecast(cell, occupant, door);
      const keyAfter = Math.max(0, runtime.run.player[door.keyType] - door.keyCost);
      const keyText = enough ? `\nKey stock: after opening, you will have ${keyAfter} ${door.keyName}.` : "";
      return {
        message: enough
          ? `${door.name}\nRole: ${roleText}\nUse: removes this door so the route, reward, or shortcut behind it becomes available.${hint}${valueForecast}${keyText}\nCost: ${door.keyCost} ${door.keyName}.${hasBlessing("shell_backpack") ? "\nShell Backpack: restore HP after opening a door." : ""}`
          : `${door.name}\nRole: ${roleText}\nThis door blocks the route behind it.${hint}${valueForecast}\nMissing: ${door.keyName}.`,
        tone: enough ? "safe" : "blocked"
      };
    }
    if (occupant.type === OCCUPANT.PICKUP) {
      const pickup = runtime.entities.pickups[occupant.id];
      return { message: `${pickup.name}: ${describeBundle(getScaledPickupEffect(occupant.id))}.`, tone: "safe" };
    }
    if (occupant.type === OCCUPANT.CHEST) {
      const chest = runtime.entities.chests[occupant.id];
      return { message: `${chest.name}\n${chest.description}\nOpen to get: ${describeBundle(chest.reward)}.`, tone: "safe" };
    }
    if (occupant.type === OCCUPANT.EVENT) {
      return { message: `${runtime.entities.events[occupant.id].name}: open an event choice.`, tone: "safe" };
    }
    if (occupant.type === OCCUPANT.SHOP) {
      return { message: "Tanuki Merchant: sells keys, Hearts, Attack Flowers, and Shield Leaves.", tone: "safe" };
    }
    if (occupant.type === OCCUPANT.ENEMY || occupant.type === OCCUPANT.BOSS) {
      const forecast = getCombatForecast(occupant);
      return {
        message: `${forecast.name}\nEnemy HP: ${forecast.enemyHpBefore}/${forecast.enemyMaxHp}\nThis hit: ⚔ ${forecast.playerDamage} damage, enemy HP ${forecast.enemyHpBefore} -> ${forecast.enemyHpAfter}.\nCounter rule: each hit takes counter damage equal to the enemy HP before that hit (${forecast.enemyHpBefore}).\nCurrent HP: ${forecast.playerHpBefore}/${runtime.run.player.maxHp} | Shield: ${forecast.playerShieldBefore}\nThis counter: ${forecast.incomingDamage}, Shield blocks ${forecast.shieldLoss}, HP loss ${forecast.hpLoss}.\nAfter hit HP: ${Math.max(0, forecast.playerHpAfter)}, Shield: ${forecast.playerShieldAfter}\n${forecast.enemyHpAfter <= 0 ? describeReward(forecast.reward) + "." : "Reward only drops on the final hit."} ${getRiskText(forecast)}`,
        tone: getRiskTone(forecast)
      };
    }
    return { message: "There is something here.", tone: "safe" };
  }

  function getDoorValueForecast(doorCell, occupant, door) {
    const scan = scanDoorArea(doorCell);
    const parts = [];
    if (Object.keys(scan.rewards).length) {
      parts.push(`Visible rewards: ${describeBundle(scan.rewards)}`);
    }
    if (scan.chests.length) {
      parts.push(`Chests: ${scan.chests.join(", ")}`);
    }
    if (scan.events.length) {
      parts.push(`Events: ${scan.events.join(", ")}`);
    }
    if (scan.hasStairs) {
      parts.push("Route: can approach the stairs");
    }
    if (scan.enemyLossSaved > 0) {
      parts.push(`May avoid about ${scan.enemyLossSaved} HP of combat pressure`);
    }
    const roleAdvice = getDoorRoleAdvice(occupant.role);
    if (roleAdvice) {
      parts.push(roleAdvice);
    }
    if (!parts.length) {
      return "\nValue read: no clear nearby reward yet; check whether this is a path gate.";
    }
    return `\nValue read: ${parts.join("; ")}.`;
  }

  function scanDoorArea(doorCell) {
    const queue = [{ cell: doorCell, distance: 0 }];
    const seen = new Set([`${doorCell.x},${doorCell.y}`]);
    const rewards = {};
    const chests = [];
    const events = [];
    let hasStairs = false;
    let enemyLossSaved = 0;
    while (queue.length) {
      const item = queue.shift();
      const cell = item.cell;
      if (item.distance > 0) {
        collectCellValue(cell, rewards, chests, events);
        if (cell.terrain === TERRAIN.STAIRS) {
          hasStairs = true;
        }
        if (cell.occupant && (cell.occupant.type === OCCUPANT.ENEMY || cell.occupant.type === OCCUPANT.BOSS)) {
          enemyLossSaved += getCombatForecast(cell.occupant).hpLoss;
        }
      }
      if (item.distance >= 4) {
        continue;
      }
      getNeighborCells(cell).forEach((neighbor) => {
        const key = `${neighbor.x},${neighbor.y}`;
        if (seen.has(key) || neighbor.terrain === TERRAIN.WALL) {
          return;
        }
        if (neighbor.occupant && neighbor.occupant.type === OCCUPANT.DOOR && neighbor !== doorCell) {
          return;
        }
        seen.add(key);
        queue.push({ cell: neighbor, distance: item.distance + 1 });
      });
    }
    return { rewards, chests, events, hasStairs, enemyLossSaved };
  }

  function collectCellValue(cell, rewards, chests, events) {
    const occupant = cell.occupant;
    if (!occupant) {
      return;
    }
    if (occupant.type === OCCUPANT.PICKUP) {
      mergeBundle(rewards, runtime.entities.pickups[occupant.id].effect || {});
    }
    if (occupant.type === OCCUPANT.CHEST) {
      const chest = runtime.entities.chests[occupant.id];
      chests.push(chest.name);
      mergeBundle(rewards, chest.reward || {});
    }
    if (occupant.type === OCCUPANT.EVENT) {
      events.push(runtime.entities.events[occupant.id].name);
    }
  }

  function mergeBundle(target, source) {
    Object.keys(source || {}).forEach((key) => {
      if (key === "furnitureBlueprints" || key === "blessingChoice" || key === "rareBlessing") {
        return;
      }
      if (typeof source[key] === "number") {
        target[key] = (target[key] || 0) + source[key];
      }
    });
    return target;
  }

  function getDoorRoleAdvice(role) {
    const advice = {
      main_gate: "Read: main gate, usually high priority",
      treasure_gate: "Read: treasure gate; compare against your key stock if resources are tight",
      shortcut_gate: "Read: shortcut gate; good for trading a key to save HP",
      boss_gate: "Read: Boss gate; refill before opening"
    };
    return advice[role] || "";
  }

  function getRiskText(forecast) {
    if (!forecast.canFight) {
      return " Cannot win.";
    }
    const ratio = forecast.hpLoss / Math.max(1, runtime.run.player.hp);
    if (ratio <= window.getGameSetting("COMBAT.safeLossRatio", 0.25)) {
      return " Safe.";
    }
    if (ratio <= window.getGameSetting("COMBAT.cautionLossRatio", 0.5)) {
      return " Hurts.";
    }
    return " High risk.";
  }

  function getRiskTone(forecast) {
    if (!forecast.canFight) {
      return "blocked";
    }
    const ratio = forecast.hpLoss / Math.max(1, runtime.run.player.hp);
    if (ratio <= window.getGameSetting("COMBAT.safeLossRatio", 0.25)) {
      return "safe";
    }
    if (ratio <= window.getGameSetting("COMBAT.cautionLossRatio", 0.5)) {
      return "caution";
    }
    return "danger";
  }

  function getDoorRoleText(role) {
    const labels = {
      main_gate: "Main gate, usually blocks stairs or a key route.",
      treasure_gate: "Treasure gate, should hide a clear reward.",
      shortcut_gate: "Shortcut gate, saves combat or avoids high-damage enemies.",
      boss_gate: "Boss gate, leads to a major challenge."
    };
    return labels[role] || "Normal door. Spend a key for access or rewards.";
  }

  function getFloorEnemyForecastSummary() {
    const summaries = [];
    runtime.run.floor.cells.flat().forEach((cell) => {
      if (cell.occupant && (cell.occupant.type === OCCUPANT.ENEMY || cell.occupant.type === OCCUPANT.BOSS)) {
        const forecast = getCombatForecast(cell.occupant);
        summaries.push(`${forecast.name} HP ${forecast.enemyHp} / loss ${forecast.hpLoss}`);
      }
    });
    return summaries.length ? `Wind Chime Sense: ${summaries.join(", ")}` : "No Tower Spirits remain on this floor.";
  }

  function draw() {
    const ctx = runtime.ctx;
    const canvas = runtime.canvas;
    if (!ctx || !canvas) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    applyDamageShake(ctx);
    drawBackground(ctx, canvas);
    if (runtime.run && runtime.run.floor) {
      drawFloor(ctx);
    } else {
      drawTownPreview(ctx, canvas);
    }
    ctx.restore();
    drawDamageFlash(ctx, canvas);
  }

  function drawBackground(ctx, canvas) {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#dff2d2");
    gradient.addColorStop(1, "#f7e7c8");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(255, 255, 255, 0.34)";
    for (let i = 0; i < 12; i += 1) {
      const x = 40 + i * 66;
      drawBlob(ctx, x, 70 + (i % 3) * 34, 28 + (i % 2) * 8, "#ffffff55");
    }
  }

  function triggerDamageFeedback(hpLoss) {
    runtime.damageFeedback = {
      createdAt: performance.now(),
      duration: 460,
      shake: clamp(4 + hpLoss * 0.08, 5, 14)
    };
  }

  function getDamageFeedbackProgress() {
    if (!runtime.damageFeedback) {
      return null;
    }
    const age = performance.now() - runtime.damageFeedback.createdAt;
    if (age >= runtime.damageFeedback.duration) {
      runtime.damageFeedback = null;
      return null;
    }
    return {
      age,
      progress: age / runtime.damageFeedback.duration,
      shake: runtime.damageFeedback.shake
    };
  }

  function applyDamageShake(ctx) {
    const feedback = getDamageFeedbackProgress();
    if (!feedback) {
      return;
    }
    const falloff = 1 - feedback.progress;
    const wave = Math.sin(feedback.age * 0.085);
    const x = wave * feedback.shake * falloff;
    const y = Math.cos(feedback.age * 0.067) * feedback.shake * 0.45 * falloff;
    ctx.translate(x, y);
  }

  function drawDamageFlash(ctx, canvas) {
    const feedback = getDamageFeedbackProgress();
    if (!feedback) {
      return;
    }
    const alpha = Math.max(0, 0.24 * (1 - feedback.progress));
    ctx.save();
    ctx.fillStyle = `rgba(224, 90, 90, ${alpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = `rgba(224, 90, 90, ${Math.min(0.72, alpha * 3)})`;
    ctx.lineWidth = 14;
    roundRect(ctx, 9, 9, canvas.width - 18, canvas.height - 18, 28);
    ctx.stroke();
    ctx.restore();
  }

  function drawTownPreview(ctx, canvas) {
    ctx.save();
    const usedMap = drawTownMapScene(ctx, canvas);
    if (!usedMap) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#794f27";
      ctx.font = "800 42px sans-serif";
      ctx.fillText("Town Square", canvas.width / 2, 92);
      ctx.font = "700 18px sans-serif";
      ctx.fillStyle = "#725d42";
      ctx.fillText("Upgrade facilities, or click the tower entrance to start today's climb", canvas.width / 2, 124);
      TOWN_SPOTS.forEach((spot) => drawTownSpot(ctx, spot));
    } else {
      drawTownMapHotspots(ctx);
    }
    drawTownResourceStrip(ctx, canvas, usedMap);
    ctx.restore();
  }

  function drawTownMapScene(ctx, canvas) {
    const rect = getTownMapDrawRect(canvas);
    const drewBackground = drawImageAssetInRect(ctx, "town.background", rect);
    if (!drewBackground) {
      return false;
    }
    return true;
  }

  function drawTownMapHotspots(ctx) {
    TOWN_SPOTS.forEach((spot) => {
      const isSelected = runtime.selectedTownSpot && runtime.selectedTownSpot.id === spot.id;
      if (isSelected) {
        ctx.save();
        ctx.fillStyle = "rgba(255, 245, 163, 0.18)";
        ctx.strokeStyle = "#ffcf33";
        ctx.lineWidth = 5;
        ctx.setLineDash([10, 7]);
        ctx.beginPath();
        ctx.arc(spot.x, spot.y, spot.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      drawTownSpotMapLabel(ctx, spot);
    });
  }

  function drawTownSpotMapLabel(ctx, spot) {
    const labelX = spot.labelX || spot.x;
    const labelY = spot.labelY || spot.y + spot.radius + 24;
    const labelWidth = spot.labelWidth || 108;
    const isSelected = runtime.selectedTownSpot && runtime.selectedTownSpot.id === spot.id;
    if (spot.kind === "tower") {
      drawTownSpotLabel(ctx, labelX, labelY, "Tower Entrance", "Start Run", isSelected, labelWidth);
      return;
    }
    const facility = runtime.entities.townFacilities[spot.id];
    const level = runtime.save && runtime.save.facilities[spot.id] !== undefined ? runtime.save.facilities[spot.id] : 0;
    const maxLevel = spot.id === "furnitureCorner" ? 0 : window.getGameSetting(`META.facilities.${spot.id}.maxLevel`, 0);
    const subtitle = spot.id === "furnitureCorner" ? `${runtime.save.furnitureBlueprints.length} blueprints` : `Lv.${level}/${maxLevel}`;
    drawTownSpotLabel(ctx, labelX, labelY, facility.shortName || facility.name, subtitle, isSelected, labelWidth);
  }

  function drawTownResourceStrip(ctx, canvas, compact) {
    const coins = runtime.save ? runtime.save.resources.coins : 0;
    const shards = runtime.save ? runtime.save.resources.starlightShards : 0;
    const blueprints = runtime.save ? runtime.save.furnitureBlueprints.length : 0;
    const clears = runtime.save ? runtime.save.stats.runsCleared : 0;
    const bestFloor = runtime.save ? runtime.save.stats.bestFloor : 0;
    const text = `Bells ${coins}   Starlight ${shards}   Blueprints ${blueprints}   Clears ${clears}   Best ${bestFloor}F`;
    const y = compact ? 16 : 145;
    ctx.fillStyle = "rgba(247, 243, 223, 0.92)";
    ctx.strokeStyle = "rgba(196, 184, 158, 0.9)";
    ctx.lineWidth = 3;
    roundRect(ctx, 118, y, canvas.width - 236, 42, 21);
    ctx.fill();
    ctx.stroke();
    drawCenteredText(ctx, text, canvas.width / 2, y + 22, 17, "#725d42");
  }

  function drawTownSpot(ctx, spot) {
    const isSelected = runtime.selectedTownSpot && runtime.selectedTownSpot.id === spot.id;
    if (spot.kind === "tower") {
      if (drawImageAsset(ctx, "ui.towerEntry", spot.x, spot.y - 4, spot.radius * 1.85, spot.radius * 1.85)) {
        drawTownSpotLabel(ctx, spot.x, spot.y + spot.radius + 24, "Tower Entrance", "Start Run", isSelected);
        return;
      }
      drawBlob(ctx, spot.x, spot.y, spot.radius, isSelected ? "#3dd4c6" : "#19c8b9");
      drawBlob(ctx, spot.x, spot.y - 16, spot.radius * 0.58, "#e6f9f6");
      drawCenteredText(ctx, "T", spot.x, spot.y - 14, 42, "#794f27");
      drawTownSpotLabel(ctx, spot.x, spot.y + spot.radius + 24, "Tower Entrance", "Start Run", isSelected);
      return;
    }
    const facility = runtime.entities.townFacilities[spot.id];
    const level = runtime.save && runtime.save.facilities[spot.id] !== undefined ? runtime.save.facilities[spot.id] : 0;
    const maxLevel = spot.id === "furnitureCorner" ? 0 : window.getGameSetting(`META.facilities.${spot.id}.maxLevel`, 0);
    if (drawImageAsset(ctx, facility.assetKey, spot.x, spot.y - 2, spot.radius * 1.55, spot.radius * 1.55)) {
      drawTownSpotLabel(ctx, spot.x, spot.y + spot.radius + 22, facility.shortName || facility.name, spot.id === "furnitureCorner" ? `${runtime.save.furnitureBlueprints.length} blueprints` : `Lv.${level}/${maxLevel}`, isSelected);
      return;
    }
    drawBlob(ctx, spot.x, spot.y, spot.radius, isSelected ? "#fff9e6" : facility.color);
    drawBlob(ctx, spot.x, spot.y - 6, spot.radius * 0.52, facility.color);
    drawCenteredText(ctx, facility.icon || facility.shortName.slice(0, 1), spot.x, spot.y - 4, 28, "#fff");
    drawTownSpotLabel(ctx, spot.x, spot.y + spot.radius + 22, facility.shortName || facility.name, spot.id === "furnitureCorner" ? `${runtime.save.furnitureBlueprints.length} blueprints` : `Lv.${level}/${maxLevel}`, isSelected);
  }

  function drawTownSpotLabel(ctx, x, y, title, subtitle, isSelected, preferredWidth) {
    const width = preferredWidth || 108;
    const height = 44;
    ctx.fillStyle = isSelected ? "#fffbdf" : "rgba(247, 243, 223, 0.92)";
    ctx.strokeStyle = isSelected ? "#ffcc00" : "rgba(196, 184, 158, 0.86)";
    ctx.lineWidth = 3;
    roundRect(ctx, x - width / 2, y - height / 2, width, height, 16);
    ctx.fill();
    ctx.stroke();
    drawCenteredText(ctx, title, x, y - 7, 15, "#794f27");
    drawCenteredText(ctx, subtitle, x, y + 11, 11, "#8a7b66");
  }

  function drawFloor(ctx) {
    const metrics = getGridMetrics();
    const cells = runtime.run.floor.cells;
    cells.flat().forEach((cell) => drawCell(ctx, cell, metrics));
    cells.flat().forEach((cell) => drawRouteMarker(ctx, cell, metrics));
    cells.flat().forEach((cell) => {
      if (cell.occupant) {
        drawOccupant(ctx, cell, metrics);
      }
    });
    drawPlayer(ctx, metrics);
    if (runtime.selectedCell) {
      drawSelection(ctx, runtime.selectedCell, metrics);
    }
    drawFloatingTexts(ctx, metrics);
    drawRunHud(ctx);
    drawActionNotice(ctx);
    drawRouteLegend(ctx);
  }

  function drawCell(ctx, cell, metrics) {
    const { x, y, size, gap } = getCellRect(cell, metrics);
    const radius = size * 0.18;
    let fill = "#f8f0d5";
    let stroke = "#d4c9b4";
    if (cell.terrain === TERRAIN.WALL) {
      fill = "#c9b58c";
      stroke = "#9a835a";
    }
    if (cell.terrain === TERRAIN.ENTRANCE) {
      fill = "#e6f9f6";
      stroke = "#19c8b9";
    }
    if (cell.terrain === TERRAIN.STAIRS) {
      fill = "#fff4b8";
      stroke = "#dba90e";
    }
    const terrainAssetKey = getTerrainAssetKey(cell.terrain);
    if (drawImageAsset(ctx, terrainAssetKey, x + size / 2, y + size / 2, size - gap * 2, size - gap * 2)) {
      return;
    }
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 3;
    roundRect(ctx, x + gap, y + gap, size - gap * 2, size - gap * 2, radius);
    ctx.fill();
    ctx.stroke();

    if (cell.terrain === TERRAIN.STAIRS) {
      ctx.fillStyle = "#a36f00";
      ctx.font = `${Math.round(size * 0.38)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("UP", x + size / 2, y + size / 2);
    }
  }

  function getTerrainAssetKey(terrain) {
    const keys = {
      [TERRAIN.FLOOR]: "map.floorTile",
      [TERRAIN.WALL]: "map.wallTile",
      [TERRAIN.ENTRANCE]: "map.entranceTile",
      [TERRAIN.STAIRS]: "map.stairsTile"
    };
    return keys[terrain];
  }

  function drawRouteMarker(ctx, cell, metrics) {
    const routeType = getCellRouteType(cell);
    if (!routeType) {
      return;
    }
    const { x, y, size, gap } = getCellRect(cell, metrics);
    const color = getRouteColor(routeType);
    ctx.save();
    ctx.globalAlpha = cell === runtime.selectedCell ? 0.32 : 0.2;
    ctx.fillStyle = color;
    roundRect(ctx, x + gap + 3, y + gap + 3, size - (gap + 3) * 2, size - (gap + 3) * 2, size * 0.16);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    roundRect(ctx, x + size * 0.08, y + size * 0.08, size * 0.25, size * 0.18, size * 0.07);
    ctx.fill();
    drawCenteredText(ctx, getRouteTypeShortText(routeType), x + size * 0.205, y + size * 0.17, size * 0.095, "#fff");
    ctx.restore();
  }

  function drawRouteLegend(ctx) {
    const routeTypes = runtime.run && runtime.run.floorDefinition ? runtime.run.floorDefinition.routeTypes || [] : [];
    if (!routeTypes.length) {
      return;
    }
    const labels = routeTypes.slice(0, 4).map((routeType) => ({
      routeType,
      label: getRouteTypeText(routeType)
    })).filter((item) => item.label);
    if (!labels.length) {
      return;
    }
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = "700 13px sans-serif";
    let x = 36;
    const y = 725;
    labels.forEach((item) => {
      const width = Math.max(74, ctx.measureText(item.label).width + 30);
      ctx.fillStyle = "rgba(247, 243, 223, 0.88)";
      ctx.strokeStyle = getRouteColor(item.routeType);
      ctx.lineWidth = 2;
      roundRect(ctx, x, y - 14, width, 28, 14);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = getRouteColor(item.routeType);
      ctx.beginPath();
      ctx.arc(x + 14, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#794f27";
      ctx.fillText(item.label, x + 24, y + 1);
      x += width + 8;
    });
    ctx.restore();
  }

  function drawRunHud(ctx) {
    if (!runtime.run || !runtime.run.player) {
      return;
    }
    const player = runtime.run.player;
    ctx.save();
    drawHudPanel(ctx, 24, 12, 712, 38, 19, "rgba(247, 243, 223, 0.94)", "rgba(121, 79, 39, 0.32)");
    drawHpMeter(ctx, 42, 22, 172, 18, player.hp, player.maxHp);
    drawHudText(ctx, `⚔️ ${getEffectiveAttack()}`, 232, 31, 15, "#794f27", "left");
    drawHudText(ctx, `Shield ${getEffectiveDefense()}`, 308, 31, 14, "#794f27", "left");
    drawHudText(ctx, `Bells ${player.coins}`, 386, 31, 14, "#794f27", "left");
    drawKeyChip(ctx, 458, 31, "#f7cd67", `Y ${player.yellowKeys}`);
    drawKeyChip(ctx, 536, 31, "#82d5bb", `B ${player.blueKeys}`);
    drawHudText(ctx, `${runtime.run.floorNumber}F`, 694, 31, 15, "#794f27", "right");
    drawPossessionStrip(ctx);
    ctx.restore();
  }

  function drawPossessionStrip(ctx) {
    const labels = getRunPossessionLabels();
    if (!labels.length) {
      return;
    }
    const text = truncateCanvasText(ctx, `Run: ${labels.join("  /  ")}`, 620, 14);
    drawHudPanel(ctx, 70, 666, 620, 32, 16, "rgba(247, 243, 223, 0.92)", "rgba(25, 200, 185, 0.42)");
    drawHudText(ctx, text, 88, 682, 14, "#725d42", "left");
  }

  function getRunPossessionLabels() {
    const player = runtime.run.player;
    const labels = [
      `HP ${player.hp}/${player.maxHp}`,
      `Shield ${player.shield || 0}`,
      `Yellow Key ${player.yellowKeys}`,
      `Blue Key ${player.blueKeys}`,
      `Bells ${player.coins}`
    ];
    runtime.run.blessings.slice(0, 4).forEach((blessingId) => {
      const blessing = runtime.entities.blessings[blessingId];
      if (blessing) {
        labels.push(blessing.name);
      }
    });
    if (runtime.run.blessings.length > 4) {
      labels.push(`Blessing +${runtime.run.blessings.length - 4}`);
    }
    return labels;
  }

  function drawHpMeter(ctx, x, y, width, height, hp, maxHp) {
    const ratio = clamp(hp / Math.max(1, maxHp), 0, 1);
    ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
    roundRect(ctx, x, y, width, height, height / 2);
    ctx.fill();
    ctx.fillStyle = ratio > 0.5 ? "#6fba2c" : ratio > 0.25 ? "#dba90e" : "#e05a5a";
    roundRect(ctx, x, y, width * ratio, height, height / 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(121, 79, 39, 0.45)";
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, width, height, height / 2);
    ctx.stroke();
    drawHudText(ctx, `HP ${hp}/${maxHp}`, x + width / 2, y + height / 2 + 1, 13, "#794f27", "center");
  }

  function drawKeyChip(ctx, x, y, color, label) {
    ctx.fillStyle = color;
    roundRect(ctx, x, y - 13, 66, 26, 13);
    ctx.fill();
    ctx.strokeStyle = "rgba(121, 79, 39, 0.28)";
    ctx.lineWidth = 2;
    roundRect(ctx, x, y - 13, 66, 26, 13);
    ctx.stroke();
    drawHudText(ctx, label, x + 33, y + 1, 14, "#794f27", "center");
  }

  function drawHudPanel(ctx, x, y, width, height, radius, fill, stroke) {
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, width, height, radius);
    ctx.fill();
    ctx.stroke();
  }

  function drawHudText(ctx, text, x, y, size, color, align) {
    ctx.fillStyle = color;
    ctx.font = `800 ${Math.round(size)}px sans-serif`;
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function truncateCanvasText(ctx, text, maxWidth, size) {
    ctx.font = `800 ${Math.round(size)}px sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) {
      return text;
    }
    let output = text;
    while (output.length > 4 && ctx.measureText(`${output}...`).width > maxWidth) {
      output = output.slice(0, -1);
    }
    return `${output}...`;
  }

  function drawActionNotice(ctx) {
    if (!runtime.run || !runtime.run.actionNotice) {
      return;
    }
    const age = performance.now() - runtime.run.actionNotice.createdAt;
    if (age > 2600) {
      return;
    }
    const alpha = age > 2000 ? 1 - (age - 2000) / 600 : 1;
    const color = runtime.run.actionNotice.tone === "danger" ? "#e05a5a" : "#19c8b9";
    ctx.save();
    ctx.globalAlpha = alpha;
    drawHudPanel(ctx, 80, 622, 600, 34, 17, "rgba(255, 249, 230, 0.94)", color);
    drawHudText(ctx, truncateCanvasText(ctx, runtime.run.actionNotice.text, 552, 15), 380, 640, 15, "#794f27", "center");
    ctx.restore();
  }

  function drawFloatingTexts(ctx, metrics) {
    const now = performance.now();
    runtime.floatingTexts = runtime.floatingTexts.filter((item) => now - item.createdAt < item.duration);
    runtime.floatingTexts.forEach((item) => {
      const age = now - item.createdAt;
      const progress = age / item.duration;
      const cell = getCell(item.x, item.y) || { x: item.x, y: item.y };
      const rect = getCellRect(cell, metrics);
      const x = rect.x + rect.size / 2;
      const y = rect.y + rect.size * 0.22 - progress * 34 - (item.lane || 0) * 30;
      ctx.save();
      ctx.globalAlpha = 1 - Math.max(0, progress - 0.65) / 0.35;
      drawHudPanel(ctx, x - 58, y - 16, 116, 28, 14, "rgba(255, 249, 230, 0.96)", item.color);
      drawHudText(ctx, truncateCanvasText(ctx, item.text, 100, 13), x, y - 1, 13, item.color, "center");
      ctx.restore();
    });
  }

  function getCellRouteType(cell) {
    if (!cell) {
      return "";
    }
    if (cell.terrain === TERRAIN.STAIRS) {
      return runtime.run && runtime.run.floorDefinition && runtime.run.floorDefinition.isBossFloor ? "boss_route" : "safe_stairs";
    }
    if (cell.occupant && cell.occupant.routeType) {
      return cell.occupant.routeType;
    }
    if (cell.occupant) {
      return inferPlacementRouteType(cell.occupant);
    }
    return "";
  }

  function getRouteColor(routeType) {
    return window.getGameSetting(`TOWER_GENERATION.routeColors.${routeType}`, "#19c8b9");
  }

  function getRouteTypeShortText(routeType) {
    const labels = {
      combat_growth: "CMB",
      key_shortcut: "CUT",
      risk_chest: "RISK",
      safe_stairs: "SAFE",
      boss_route: "BOSS"
    };
    return labels[routeType] || "";
  }

  function drawOccupant(ctx, cell, metrics) {
    const { x, y, size } = getCellRect(cell, metrics);
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    const occupant = cell.occupant;
    if (occupant.type === OCCUPANT.DOOR) {
      const door = runtime.entities.doors[occupant.id];
      if (drawImageAsset(ctx, door.assetKey, centerX, centerY - size * 0.02, size * 0.72, size * 0.72)) {
        drawDoorBadge(ctx, centerX, y + size * 0.77, size, door, occupant.role);
        return;
      }
      ctx.fillStyle = door.color;
      roundRect(ctx, x + size * 0.23, y + size * 0.2, size * 0.54, size * 0.64, size * 0.18);
      ctx.fill();
      ctx.fillStyle = "#794f27";
      ctx.beginPath();
      ctx.arc(centerX + size * 0.13, centerY, size * 0.035, 0, Math.PI * 2);
      ctx.fill();
      drawDoorBadge(ctx, centerX, y + size * 0.77, size, door, occupant.role);
      return;
    }
    if (occupant.type === OCCUPANT.PICKUP) {
      const pickup = runtime.entities.pickups[occupant.id];
      if (drawImageAsset(ctx, pickup.assetKey, centerX, centerY, size * 0.58, size * 0.58)) {
        drawPickupValueBadge(ctx, centerX, y + size * 0.78, size, getScaledPickupEffect(occupant.id));
        return;
      }
      drawPickup(ctx, centerX, centerY, size, pickup);
      drawPickupValueBadge(ctx, centerX, y + size * 0.78, size, getScaledPickupEffect(occupant.id));
      return;
    }
    if (occupant.type === OCCUPANT.CHEST) {
      const chest = runtime.entities.chests[occupant.id];
      if (drawImageAsset(ctx, chest.assetKey, centerX, centerY, size * 0.62, size * 0.62)) {
        return;
      }
      drawBlob(ctx, centerX, centerY, size * 0.3, chest.color || "#f7cd67");
      drawCenteredText(ctx, "Box", centerX, centerY + 1, size * 0.2, "#794f27");
      return;
    }
    if (occupant.type === OCCUPANT.ENEMY) {
      const enemy = runtime.entities.enemies[occupant.id];
      const scaledEnemy = getScaledEnemyStats(enemy, occupant.type);
      const hp = typeof occupant.currentHp === "number" ? occupant.currentHp : scaledEnemy.hp;
      if (drawImageAsset(ctx, enemy.assetKey, centerX, centerY - size * 0.02, size * 0.68, size * 0.68)) {
        drawHpBadge(ctx, centerX, y + size * 0.78, size, hp);
        drawRewardBadge(ctx, centerX, y + size * 0.03, size, enemy.reward);
        return;
      }
      drawCritter(ctx, centerX, centerY, size * 0.34, enemy.color, enemy.name.slice(0, 1));
      drawHpBadge(ctx, centerX, y + size * 0.78, size, hp);
      drawRewardBadge(ctx, centerX, y + size * 0.03, size, enemy.reward);
      return;
    }
    if (occupant.type === OCCUPANT.BOSS) {
      const boss = runtime.entities.bosses[occupant.id];
      const hp = typeof occupant.currentHp === "number" ? occupant.currentHp : boss.hp;
      if (drawImageAsset(ctx, boss.assetKey, centerX, centerY - size * 0.04, size * 0.82, size * 0.82)) {
        drawHpBadge(ctx, centerX, y + size * 0.8, size, hp);
        drawRewardBadge(ctx, centerX, y + size * 0.03, size, boss.reward);
        return;
      }
      drawCritter(ctx, centerX, centerY, size * 0.44, boss.color, "B");
      drawHpBadge(ctx, centerX, y + size * 0.8, size, hp);
      drawRewardBadge(ctx, centerX, y + size * 0.03, size, boss.reward);
      return;
    }
    if (occupant.type === OCCUPANT.EVENT) {
      const eventDefinition = runtime.entities.events[occupant.id];
      if (drawImageAsset(ctx, eventDefinition.assetKey, centerX, centerY, size * 0.58, size * 0.58)) {
        return;
      }
      drawBlob(ctx, centerX, centerY, size * 0.3, "#b77dee");
      drawCenteredText(ctx, "?", centerX, centerY + 1, size * 0.38, "#fff");
      return;
    }
    if (occupant.type === OCCUPANT.SHOP) {
      const shop = runtime.entities.shops[occupant.id];
      if (drawImageAsset(ctx, shop.assetKey, centerX, centerY, size * 0.62, size * 0.62)) {
        return;
      }
      drawBlob(ctx, centerX, centerY, size * 0.32, "#e59266");
      drawCenteredText(ctx, "Shop", centerX, centerY + 1, size * 0.18, "#fff");
    }
  }

  function drawPickup(ctx, centerX, centerY, size, pickup) {
    ctx.fillStyle = pickup.color;
    if (pickup.effect && (pickup.effect.yellowKeys || pickup.effect.blueKeys || pickup.effect.redKeys)) {
      ctx.beginPath();
      ctx.arc(centerX - size * 0.08, centerY, size * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(centerX, centerY - size * 0.04, size * 0.22, size * 0.08);
      ctx.fillRect(centerX + size * 0.16, centerY, size * 0.05, size * 0.12);
      return;
    }
    if (pickup.effect && pickup.effect.hp) {
      drawHeart(ctx, centerX, centerY, size * 0.17, pickup.color);
      return;
    }
    if (pickup.effect && pickup.effect.attack) {
      for (let i = 0; i < 6; i += 1) {
        const angle = (Math.PI * 2 * i) / 6;
        drawBlob(ctx, centerX + Math.cos(angle) * size * 0.13, centerY + Math.sin(angle) * size * 0.13, size * 0.09, pickup.color);
      }
      drawBlob(ctx, centerX, centerY, size * 0.08, "#f7cd67");
      return;
    }
    if (pickup.effect && (pickup.effect.shield || pickup.effect.defense)) {
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(-0.7);
      ctx.fillStyle = pickup.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.12, size * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    drawBlob(ctx, centerX, centerY, size * 0.22, pickup.color);
    drawCenteredText(ctx, "Bell", centerX, centerY + 1, size * 0.16, "#794f27");
  }

  function drawPlayer(ctx, metrics) {
    const player = runtime.run.player;
    const { x, y, size } = getCellRect(player, metrics);
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    drawPlayerDamageRing(ctx, centerX, centerY, size);
    if (drawImageAsset(ctx, "player.villager", centerX, centerY - size * 0.04, size * 0.7, size * 0.7)) {
      drawPlayerStatBadges(ctx, x, y, size, player);
      return;
    }
    ctx.fillStyle = "#fff9e6";
    ctx.beginPath();
    ctx.arc(centerX - size * 0.16, centerY - size * 0.24, size * 0.11, 0, Math.PI * 2);
    ctx.arc(centerX + size * 0.16, centerY - size * 0.24, size * 0.11, 0, Math.PI * 2);
    ctx.fill();
    drawBlob(ctx, centerX, centerY, size * 0.34, "#fff9e6");
    ctx.fillStyle = "#725d42";
    ctx.beginPath();
    ctx.arc(centerX - size * 0.1, centerY - size * 0.04, size * 0.028, 0, Math.PI * 2);
    ctx.arc(centerX + size * 0.1, centerY - size * 0.04, size * 0.028, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#725d42";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(centerX, centerY + size * 0.05, size * 0.08, 0.1, Math.PI - 0.1);
    ctx.stroke();
    drawPlayerStatBadges(ctx, x, y, size, player);
  }

  function drawPlayerStatBadges(ctx, x, y, size, player) {
    const badgeY = y + size * 0.77;
    drawPlayerStatBadge(ctx, x + size * 0.27, badgeY, size, `♥ ${player.hp}`, "#fc736d", "#fff6f6");
    drawPlayerStatBadge(ctx, x + size * 0.73, badgeY, size, `⚔ ${getEffectiveAttack()}`, "#794f27", "#fff9e6");
  }

  function drawPlayerStatBadge(ctx, centerX, centerY, size, label, stroke, fill) {
    const width = size * 0.42;
    const height = size * 0.2;
    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    roundRect(ctx, centerX - width / 2, centerY - height / 2, width, height, height / 2);
    ctx.fill();
    ctx.stroke();
    drawCenteredText(ctx, label, centerX, centerY + 1, size * 0.105, stroke);
    ctx.restore();
  }

  function drawPlayerDamageRing(ctx, centerX, centerY, size) {
    const feedback = runtime.damageFeedback ? getDamageFeedbackProgress() : null;
    if (!feedback) {
      return;
    }
    const pulse = 1 + Math.sin(feedback.age * 0.08) * 0.08;
    ctx.save();
    ctx.globalAlpha = 0.58 * (1 - feedback.progress);
    ctx.strokeStyle = "#e05a5a";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(centerX, centerY, size * 0.45 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawSelection(ctx, cell, metrics) {
    const { x, y, size, gap } = getCellRect(cell, metrics);
    ctx.strokeStyle = "#ffcc00";
    ctx.lineWidth = 5;
    roundRect(ctx, x + gap, y + gap, size - gap * 2, size - gap * 2, size * 0.18);
    ctx.stroke();
  }

  function drawCritter(ctx, centerX, centerY, radius, color, label) {
    drawBlob(ctx, centerX, centerY, radius, color);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.arc(centerX - radius * 0.34, centerY - radius * 0.12, radius * 0.12, 0, Math.PI * 2);
    ctx.arc(centerX + radius * 0.34, centerY - radius * 0.12, radius * 0.12, 0, Math.PI * 2);
    ctx.fill();
    drawCenteredText(ctx, label, centerX, centerY + radius * 0.18, radius * 0.82, "#fff");
  }

  function drawHpBadge(ctx, centerX, y, size, hp) {
    const width = size * 0.58;
    const height = size * 0.18;
    ctx.fillStyle = "rgba(248, 248, 240, 0.92)";
    ctx.strokeStyle = "rgba(121, 79, 39, 0.45)";
    ctx.lineWidth = 2;
    roundRect(ctx, centerX - width / 2, y, width, height, height / 2);
    ctx.fill();
    ctx.stroke();
    drawCenteredText(ctx, `HP ${hp}`, centerX, y + height / 2 + 1, size * 0.105, "#794f27");
  }

  function drawPickupValueBadge(ctx, centerX, y, size, effect) {
    const label = getCompactBundleText(effect);
    if (!label) {
      return;
    }
    const width = Math.min(size * 0.76, Math.max(size * 0.42, label.length * size * 0.095 + size * 0.2));
    const height = size * 0.17;
    ctx.fillStyle = "rgba(255, 249, 230, 0.95)";
    ctx.strokeStyle = "rgba(121, 79, 39, 0.3)";
    ctx.lineWidth = 2;
    roundRect(ctx, centerX - width / 2, y, width, height, height / 2);
    ctx.fill();
    ctx.stroke();
    drawCenteredText(ctx, label, centerX, y + height / 2 + 1, size * 0.09, "#794f27");
  }

  function drawRewardBadge(ctx, centerX, y, size, reward) {
    const label = getRewardBadgeText(reward);
    if (!label) {
      return;
    }
    const width = Math.min(size * 0.82, Math.max(size * 0.48, label.length * size * 0.1 + size * 0.24));
    const height = size * 0.18;
    ctx.fillStyle = "rgba(255, 249, 230, 0.94)";
    ctx.strokeStyle = "rgba(111, 186, 44, 0.72)";
    ctx.lineWidth = 2;
    roundRect(ctx, centerX - width / 2, y, width, height, height / 2);
    ctx.fill();
    ctx.stroke();
    drawCenteredText(ctx, label, centerX, y + height / 2 + 1, size * 0.095, "#5d8f23");
  }

  function drawDoorBadge(ctx, centerX, y, size, door, role) {
    const width = size * 0.48;
    const height = size * 0.18;
    const roleSymbol = getDoorRoleSymbol(role);
    const label = `${roleSymbol}${door.keyName.slice(0, 1)}${door.keyCost}`;
    ctx.fillStyle = "rgba(248, 248, 240, 0.92)";
    ctx.strokeStyle = "rgba(121, 79, 39, 0.45)";
    ctx.lineWidth = 2;
    roundRect(ctx, centerX - width / 2, y, width, height, height / 2);
    ctx.fill();
    ctx.stroke();
    drawCenteredText(ctx, label, centerX, y + height / 2 + 1, size * 0.12, "#794f27");
  }

  function getDoorRoleSymbol(role) {
    const symbols = {
      main_gate: "M",
      treasure_gate: "T",
      shortcut_gate: "S",
      boss_gate: "B"
    };
    return symbols[role] || "";
  }

  function drawBlob(ctx, centerX, centerY, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radius * 1.12, radius * 0.92, -0.18, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawHeart(ctx, centerX, centerY, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY + radius);
    ctx.bezierCurveTo(centerX - radius * 2.2, centerY - radius * 0.4, centerX - radius, centerY - radius * 1.8, centerX, centerY - radius * 0.7);
    ctx.bezierCurveTo(centerX + radius, centerY - radius * 1.8, centerX + radius * 2.2, centerY - radius * 0.4, centerX, centerY + radius);
    ctx.fill();
  }

  function drawCenteredText(ctx, text, x, y, size, color) {
    ctx.fillStyle = color;
    ctx.font = `800 ${Math.round(size)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function getGridMetrics() {
    const canvas = runtime.canvas;
    const pad = 54;
    const roomSize = window.getGameSetting("CORE_RULES.roomSize", 7);
    const size = (canvas.width - pad * 2) / roomSize;
    return { pad, size, gap: 5 };
  }

  function getCellRect(cell, metrics) {
    return {
      x: metrics.pad + cell.x * metrics.size,
      y: metrics.pad + cell.y * metrics.size,
      size: metrics.size,
      gap: metrics.gap
    };
  }

  function getCell(x, y) {
    if (!runtime.run || !runtime.run.floor) {
      return null;
    }
    return runtime.run.floor.cells[y] && runtime.run.floor.cells[y][x] ? runtime.run.floor.cells[y][x] : null;
  }

  function getCellFromPointer(event) {
    return getCellFromClientPoint(event.clientX, event.clientY);
  }

  function getCellFromClientPoint(clientX, clientY) {
    const rect = runtime.canvas.getBoundingClientRect();
    const scaleX = runtime.canvas.width / rect.width;
    const scaleY = runtime.canvas.height / rect.height;
    const px = (clientX - rect.left) * scaleX;
    const py = (clientY - rect.top) * scaleY;
    const metrics = getGridMetrics();
    const x = Math.floor((px - metrics.pad) / metrics.size);
    const y = Math.floor((py - metrics.pad) / metrics.size);
    return getCell(x, y);
  }

  function getTownSpotFromPointer(event) {
    return getTownSpotFromClientPoint(event.clientX, event.clientY);
  }

  function getTownSpotFromClientPoint(clientX, clientY) {
    const rect = runtime.canvas.getBoundingClientRect();
    const scaleX = runtime.canvas.width / rect.width;
    const scaleY = runtime.canvas.height / rect.height;
    const px = (clientX - rect.left) * scaleX;
    const py = (clientY - rect.top) * scaleY;
    return TOWN_SPOTS.find((spot) => {
      const dx = px - spot.x;
      const dy = py - spot.y;
      return Math.sqrt(dx * dx + dy * dy) <= spot.radius + 28;
    }) || null;
  }

  function showModal(title, body, options, closeLabel) {
    runtime.previousState = runtime.state;
    runtime.state = GAME_STATES.MODAL;
    runtime.dom.modalTitle.textContent = title;
    runtime.dom.modalBody.textContent = body;
    runtime.dom.modalOptions.innerHTML = "";
    (options || []).forEach((option) => {
      const button = document.createElement("button");
      button.className = "press-button option-button";
      button.type = "button";
      button.disabled = !!option.disabled;
      const icon = option.iconSrc ? `<img src="${escapeHtml(option.iconSrc)}" alt="" />` : "";
      button.innerHTML = `${icon}<span>${escapeHtml(option.label)}${option.detail ? `<small>${escapeHtml(option.detail)}</small>` : ""}</span>`;
      button.addEventListener("click", option.onClick);
      runtime.dom.modalOptions.appendChild(button);
    });
    runtime.dom.modalCloseButton.textContent = closeLabel || "Close";
    runtime.dom.modalCloseButton.style.display = closeLabel === null ? "none" : "";
    runtime.dom.modalBackdrop.classList.remove("hidden");
    updateInterface();
  }

  function closeModal() {
    runtime.dom.modalBackdrop.classList.add("hidden");
    runtime.dom.modalCloseButton.style.display = "";
    runtime.state = runtime.previousState === GAME_STATES.MODAL ? GAME_STATES.RUNNING : runtime.previousState;
    if (!runtime.run && runtime.state === GAME_STATES.RUNNING) {
      runtime.state = GAME_STATES.TOWN;
    }
    updateInterface();
  }

  function showOverlay(title, body, buttonText, onClick) {
    runtime.dom.stateOverlay.classList.remove("hidden");
    runtime.dom.overlayTitle.textContent = title;
    runtime.dom.overlayBody.textContent = body;
    runtime.dom.overlayStartButton.textContent = buttonText;
    runtime.dom.overlayStartButton.onclick = onClick;
  }

  function showHelpModal() {
    showModal("How to Play", "Move with Arrow Keys, WASD, or by clicking an adjacent tile. Bumping into a Tower Spirit starts automatic round combat: your Attack damages enemy HP each round, and enemy Attack strikes back. Shield absorbs damage before HP. Yellow doors spend Yellow Keys; blue doors spend Blue Keys. Choose Blessings on Floors 3, 6, and 9, then challenge the Drowsy Tree Spirit on Floor 10.", [], "Got it");
  }

  function describeBundle(bundle) {
    const names = {
      hp: "HP",
      attack: "⚔️",
      defense: "Shield",
      shield: "Shield",
      coins: "Bells",
      yellowKeys: "Yellow Key",
      blueKeys: "Blue Key",
      redKeys: "Red Key",
      starlightShards: "Starlight Shards",
      rareBlessing: "Rare Blessing",
      blessingChoice: "Blessing Choice"
    };
    return Object.keys(bundle || {})
      .filter((key) => key !== "furnitureBlueprints")
      .map((key) => `${names[key] || key} ${bundle[key] > 0 ? "+" : ""}${bundle[key]}`)
      .join(", ") || "None";
  }

  function describeReward(reward) {
    if (reward && reward.furnitureBlueprints) {
      return `${describeBundle(reward)}, Furniture Blueprint +${reward.furnitureBlueprints.length}`;
    }
    return `Reward: ${describeBundle(reward)}`;
  }

  function getRewardText(reward) {
    const text = describeReward(reward || {}).replace(/^Reward: /, "");
    return text && text !== "None" ? text : "";
  }

  function getCompactBundleText(bundle) {
    if (!bundle || !Object.keys(bundle).length) {
      return "";
    }
    const priority = [
      ["hp", "HP"],
      ["shield", "Shield"],
      ["attack", "⚔️"],
      ["yellowKeys", "Y"],
      ["blueKeys", "B"],
      ["coins", "Bells"]
    ];
    const found = priority.find(([key]) => typeof bundle[key] === "number" && bundle[key] !== 0);
    if (!found) {
      return "";
    }
    const [key, label] = found;
    const value = bundle[key];
    return `${label}${value > 0 ? "+" : ""}${value}`;
  }

  function getRewardBadgeText(reward) {
    if (!reward || !Object.keys(reward).length) {
      return "";
    }
    const priority = [
      ["blueKeys", "B"],
      ["yellowKeys", "Y"],
      ["attack", "⚔️"],
      ["shield", "Shield"],
      ["defense", "Shield"],
      ["hp", "HP"],
      ["coins", "Bells"],
      ["starlightShards", "Star"],
      ["blessingChoice", "Blessing"],
      ["rareBlessing", "Rare"],
      ["furnitureBlueprints", "Furniture"]
    ];
    const found = priority.find(([key]) => reward[key]);
    if (!found) {
      return "";
    }
    const [key, label] = found;
    const value = Array.isArray(reward[key]) ? reward[key].length : reward[key];
    return typeof value === "number" ? `+${label}${value}` : `+${label}`;
  }

  function describeMetaCost(cost) {
    const parts = [];
    if (cost.coins) {
      parts.push(`${cost.coins} Bells`);
    }
    if (cost.starlightShards) {
      parts.push(`${cost.starlightShards} Starlight Shards`);
    }
    return parts.join(" + ") || "Free";
  }

  function describeMissingMetaCost(cost) {
    const missingCoins = Math.max(0, (cost.coins || 0) - runtime.save.resources.coins);
    const missingShards = Math.max(0, (cost.starlightShards || 0) - runtime.save.resources.starlightShards);
    const parts = [];
    if (missingCoins) {
      parts.push(`Need ${missingCoins} Bells`);
    }
    if (missingShards) {
      parts.push(`Need ${missingShards} Starlight Shards`);
    }
    return parts.join(", ") || "Enough resources";
  }

  function shuffle(items) {
    return items
      .map((value) => ({ value, sort: runRandom() }))
      .sort((a, b) => a.sort - b.sort)
      .map((item) => item.value);
  }

  function addRunLog(message) {
    if (!runtime.run) {
      addSystemLog(message);
      return;
    }
    runtime.run.log.push(message);
    updateInterface();
  }

  function setActionNotice(text, tone) {
    if (!runtime.run) {
      return;
    }
    runtime.run.actionNotice = {
      text,
      tone: tone || "safe",
      createdAt: performance.now()
    };
  }

  function addFloatingText(x, y, text, color) {
    const sameCellCount = runtime.floatingTexts.filter((item) => item.x === x && item.y === y && performance.now() - item.createdAt < 240).length;
    runtime.floatingTexts.push({
      x,
      y,
      text,
      color: color || "#794f27",
      lane: sameCellCount,
      createdAt: performance.now(),
      duration: 1400
    });
    const max = window.getGameSetting("PERFORMANCE.maxFloatingTexts", 18);
    if (runtime.floatingTexts.length > max) {
      runtime.floatingTexts = runtime.floatingTexts.slice(-max);
    }
  }

  function addSystemLog(message) {
    const logs = getSystemLog();
    logs.push(message);
    window.__towervilleSystemLog = logs.slice(-12);
  }

  function getSystemLog() {
    if (!window.__towervilleSystemLog) {
      window.__towervilleSystemLog = [];
    }
    return window.__towervilleSystemLog;
  }

  function loadAudioPreferences() {
    try {
      const key = window.getGameSetting("AUDIO.settingsSaveKey", "towerville_audio_settings_v1");
      const raw = localStorage.getItem(key);
      if (!raw) {
        return;
      }
      const prefs = JSON.parse(raw);
      ["isEnabled", "masterVolume", "sfxVolume", "bgmVolume"].forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(prefs, field)) {
          window.setGameSetting(`AUDIO.${field}`, prefs[field]);
        }
      });
    } catch (error) {
      console.warn("[Audio] Failed to load audio settings.", error);
    }
  }

  function saveAudioPreferences() {
    try {
      const key = window.getGameSetting("AUDIO.settingsSaveKey", "towerville_audio_settings_v1");
      localStorage.setItem(key, JSON.stringify({
        isEnabled: window.getGameSetting("AUDIO.isEnabled", true),
        masterVolume: window.getGameSetting("AUDIO.masterVolume", 0.28),
        sfxVolume: window.getGameSetting("AUDIO.sfxVolume", 0.42),
        bgmVolume: window.getGameSetting("AUDIO.bgmVolume", 0.16)
      }));
    } catch (error) {
      console.warn("[Audio] Failed to save audio settings.", error);
    }
  }

  function showAudioModal() {
    const enabled = window.getGameSetting("AUDIO.isEnabled", true);
    const master = window.getGameSetting("AUDIO.masterVolume", 0.28);
    const sfx = window.getGameSetting("AUDIO.sfxVolume", 0.42);
    const bgm = window.getGameSetting("AUDIO.bgmVolume", 0.16);
    showModal("Audio Settings", `Current: ${enabled ? "On" : "Muted"}\nMaster ${Math.round(master * 100)}%, SFX ${Math.round(sfx * 100)}%, Music ${Math.round(bgm * 100)}%.`, [
      {
        label: enabled ? "Mute" : "Enable Audio",
        detail: enabled ? "Turn off BGM and SFX" : "Turn BGM and SFX back on",
        onClick: () => {
          setAudioSetting("isEnabled", !enabled);
          if (!enabled) {
            ensureAudio();
            startBgm(runtime.run ? "tower" : "town");
          } else {
            stopBgm();
          }
          closeModal();
          showAudioModal();
        }
      },
      {
        label: "Master +10%",
        detail: "Raise both music and SFX",
        onClick: () => adjustAudioSetting("masterVolume", 0.1)
      },
      {
        label: "Master -10%",
        detail: "Lower both music and SFX",
        onClick: () => adjustAudioSetting("masterVolume", -0.1)
      },
      {
        label: "SFX +10%",
        detail: "Raise door, combat, and pickup feedback",
        onClick: () => adjustAudioSetting("sfxVolume", 0.1)
      },
      {
        label: "SFX -10%",
        detail: "Lower short sound effects",
        onClick: () => adjustAudioSetting("sfxVolume", -0.1)
      },
      {
        label: "Music +10%",
        detail: "Raise town and tower BGM",
        onClick: () => adjustAudioSetting("bgmVolume", 0.1)
      },
      {
        label: "Music -10%",
        detail: "Lower town and tower BGM",
        onClick: () => adjustAudioSetting("bgmVolume", -0.1)
      }
    ], "Close");
  }

  function adjustAudioSetting(key, delta) {
    const value = clamp(window.getGameSetting(`AUDIO.${key}`, 0) + delta, 0, 1);
    setAudioSetting(key, value);
    playSfx("pickup");
    closeModal();
    showAudioModal();
  }

  function setAudioSetting(key, value) {
    window.setGameSetting(`AUDIO.${key}`, value);
    saveAudioPreferences();
    updateBgmVolume();
    updateAudioButton();
  }

  function updateBgmVolume() {
    if (!runtime.currentBgm) {
      return;
    }
    runtime.currentBgm.volume = window.getGameSetting("AUDIO.bgmVolume", 0.16) * window.getGameSetting("AUDIO.masterVolume", 0.28);
  }

  function updateAudioButton() {
    if (!runtime.dom.audioButton) {
      return;
    }
    const enabled = window.getGameSetting("AUDIO.isEnabled", true);
    runtime.dom.audioButton.textContent = enabled ? "♪" : "Off";
    runtime.dom.audioButton.classList.toggle("active", enabled);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function ensureAudio() {
    if (!window.getGameSetting("AUDIO.isEnabled", true) || runtime.audioContext) {
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      return;
    }
    runtime.audioContext = new AudioContext();
  }

  function playSfx(kind) {
    if (!window.getGameSetting("AUDIO.isEnabled", true) || !runtime.audioContext) {
      return;
    }
    const now = performance.now();
    const gap = window.getGameSetting("AUDIO.minimumSfxGapMs", 70);
    if (now - runtime.lastSfxAt < gap) {
      return;
    }
    runtime.lastSfxAt = now;
    if (playManifestSfx(kind)) {
      return;
    }
    const frequencies = {
      move: 420,
      door: 260,
      pickup: 640,
      chest: 700,
      combat: 180,
      blocked: 120,
      blessing: 760,
      event: 520,
      buy: 580,
      win: 880,
      rest: 240,
      start: 500
    };
    const frequency = frequencies[kind] || 360;
    const context = runtime.audioContext;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.value = window.getGameSetting("AUDIO.sfxVolume", 0.42) * window.getGameSetting("AUDIO.masterVolume", 0.28);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
    osc.stop(context.currentTime + 0.13);
  }

  function playManifestSfx(kind) {
    const source = getAudioAsset(`sfx.${kind}`);
    if (!source) {
      return false;
    }
    try {
      const audio = source.cloneNode(true);
      audio.volume = window.getGameSetting("AUDIO.sfxVolume", 0.42) * window.getGameSetting("AUDIO.masterVolume", 0.28);
      const result = audio.play();
      if (result && typeof result.catch === "function") {
        result.catch(() => {});
      }
      return true;
    } catch (error) {
      console.warn("[Audio]", `SFX failed: ${kind}`, error);
      return false;
    }
  }

  function startBgm(kind) {
    if (!window.getGameSetting("AUDIO.isEnabled", true)) {
      stopBgm();
      return;
    }
    const next = getAudioAsset(`bgm.${kind}`);
    if (!next || runtime.currentBgm === next) {
      return;
    }
    stopBgm();
    runtime.currentBgm = next;
    runtime.currentBgm.currentTime = 0;
    runtime.currentBgm.volume = window.getGameSetting("AUDIO.bgmVolume", 0.16) * window.getGameSetting("AUDIO.masterVolume", 0.28);
    const result = runtime.currentBgm.play();
    if (result && typeof result.catch === "function") {
      result.catch(() => {});
    }
  }

  function stopBgm() {
    if (!runtime.currentBgm) {
      return;
    }
    runtime.currentBgm.pause();
    runtime.currentBgm.currentTime = 0;
    runtime.currentBgm = null;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();

