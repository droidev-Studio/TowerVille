(function () {
  const DEFAULT_GAME_SETTINGS = {
    DEBUG: {
      isEnabled: false,
      shouldShowGridCoordinates: false,
      shouldLogStateChanges: false,
      canSkipToBoss: false
    },
    CORE_RULES: {
      saveKey: "towerville_save_v1",
      towerFloors: 10,
      roomSize: 7,
      firstBossFloor: 10,
      blessingFloors: [3, 6, 9],
      shopFloors: [4],
      miniGuardFloor: 5,
      isLethalCombatAllowed: false,
      failureCoinKeepRatio: 0.5,
      failureShardKeepRatio: 0.5
    },
    PLAYER: {
      baseHp: 120,
      baseAttack: 12,
      baseDefense: 5,
      baseCoins: 0,
      baseYellowKeys: 1,
      baseBlueKeys: 0,
      baseRedKeys: 0,
      maxHpBonusFromTown: 50,
      maxAttackBonusFromTown: 4,
      maxDefenseBonusFromTown: 4,
      maxYellowKeyBonusFromTown: 1
    },
    COMBAT: {
      mode: "direct_turns",
      minimumDamage: 1,
      playerActsFirst: true,
      safeLossRatio: 0.25,
      cautionLossRatio: 0.5,
      honeyShieldReduction: 5,
      petalSwordAttackBonus: 3,
      petalSwordFloorHpLoss: 2
    },
    TOWER: {
      starKeyChance: 0.3,
      mushroomFriendCoinChance: 0.25,
      mushroomFriendCoinBonus: 2,
      shellBackpackDoorHeal: 4,
      eventBaseChance: 0.55,
      shopPriceMultiplier: 1,
      enemyHpMultiplier: 1,
      enemyAttackMultiplier: 1,
      enemyDefenseMultiplier: 1,
      rewardMultiplier: 1,
      smallHeartBase: 5,
      smallHeartGrowthPerFloor: 4,
      bigHeartBase: 15,
      bigHeartGrowthPerFloor: 8,
      defenseLeafBaseShield: 10,
      defenseLeafShieldGrowthPerFloor: 2,
      shopAttackTrainingBasePrice: 10,
      shopAttackTrainingPriceGrowthPerFloor: 3,
      enableFloorVariants: true,
      enemyVariantChance: 0.35,
      rewardVariantChance: 0.55,
      eventVariantChance: 1,
      eventGoodBonusChancePerWindChimeLevel: 0.12,
      eventGoodRandomRewardWeightPerWindChimeLevel: 0.35,
      eventGoodRewardKeys: ["attack", "shield", "yellowKeys", "blueKeys", "hp"]
    },
    TOWER_GENERATION: {
      isEnabled: true,
      maxExtraPlacementsPerFloor: 3,
      enemyBudgetByBand: [0, 1, 1, 2],
      rewardBudgetByBand: [1, 1, 2, 2],
      eventChanceByBand: [0, 0.18, 0.3, 0.42],
      chestChanceByBand: [0, 0.18, 0.35, 0.5],
      moveOptionalPlacementChance: 0.45,
      routeColors: {
        combat_growth: "#e59266",
        key_shortcut: "#19c8b9",
        risk_chest: "#b77dee",
        safe_stairs: "#6fba2c",
        boss_route: "#e05a5a"
      }
    },
    META: {
      facilities: {
        cottage: {
          maxLevel: 5,
          hpPerLevel: 10,
          costs: [30, 60, 100, 150, 220]
        },
        trainingStump: {
          maxLevel: 4,
          attackPerLevel: 1,
          costs: [40, 90, 160, 250]
        },
        guardianLeaf: {
          maxLevel: 4,
          shieldPerLevel: 8,
          costs: [40, 90, 160, 250]
        },
        keyShop: {
          maxLevel: 2,
          yellowKeysAtLevelOne: 1,
          keyDiscountAtLevelTwo: 0.15,
          costs: [
            { coins: 80, starlightShards: 0 },
            { coins: 120, starlightShards: 2 }
          ]
        },
        luckyWindChime: {
          maxLevel: 3,
          goodEventWeightPerLevel: 0.05,
          costs: [
            { coins: 60, starlightShards: 1 },
            { coins: 120, starlightShards: 2 },
            { coins: 200, starlightShards: 3 }
          ]
        }
      }
    },
    HUD: {
      shouldShowForecast: true,
      shouldShowBlessings: true,
      shouldShowTownResources: true,
      safeColor: "#6fba2c",
      cautionColor: "#dba90e",
      dangerColor: "#e05a5a",
      blockedColor: "#794f27"
    },
    AUDIO: {
      isEnabled: true,
      masterVolume: 0.28,
      sfxVolume: 0.42,
      bgmVolume: 0.16,
      minimumSfxGapMs: 70,
      settingsSaveKey: "towerville_audio_settings_v1"
    },
    PERFORMANCE: {
      canvasWidth: 760,
      canvasHeight: 760,
      maxFloatingTexts: 18,
      maxSparkles: 64
    }
  };

  function isPlainObject(value) {
    return Object.prototype.toString.call(value) === "[object Object]";
  }

  function clone(value) {
    if (Array.isArray(value)) {
      return value.map(clone);
    }
    if (isPlainObject(value)) {
      return Object.keys(value).reduce((next, key) => {
        next[key] = clone(value[key]);
        return next;
      }, {});
    }
    return value;
  }

  function deepMerge(base, overrides) {
    const output = clone(base);
    if (!isPlainObject(overrides)) {
      return output;
    }
    Object.keys(overrides).forEach((key) => {
      const current = output[key];
      const incoming = overrides[key];
      if (isPlainObject(current) && isPlainObject(incoming)) {
        output[key] = deepMerge(current, incoming);
      } else {
        output[key] = clone(incoming);
      }
    });
    return output;
  }

  function getPath(source, path) {
    return String(path)
      .split(".")
      .filter(Boolean)
      .reduce((value, key) => {
        if (value && Object.prototype.hasOwnProperty.call(value, key)) {
          return value[key];
        }
        return undefined;
      }, source);
  }

  function setPath(source, path, value) {
    const keys = String(path).split(".").filter(Boolean);
    let cursor = source;
    keys.forEach((key, index) => {
      if (index === keys.length - 1) {
        cursor[key] = value;
        return;
      }
      if (!isPlainObject(cursor[key])) {
        cursor[key] = {};
      }
      cursor = cursor[key];
    });
  }

  window.DEFAULT_GAME_SETTINGS = DEFAULT_GAME_SETTINGS;
  window.GAME_SETTINGS = deepMerge(DEFAULT_GAME_SETTINGS, window.GAME_SETTINGS || {});
  window.getGameSetting = function getGameSetting(path, fallbackValue) {
    const value = getPath(window.GAME_SETTINGS, path);
    return value === undefined ? fallbackValue : value;
  };
  window.setGameSetting = function setGameSetting(path, value) {
    setPath(window.GAME_SETTINGS, path, value);
    return window.GAME_SETTINGS;
  };
  window.reloadGameSettings = function reloadGameSettings(overrides) {
    window.GAME_SETTINGS = deepMerge(DEFAULT_GAME_SETTINGS, overrides || {});
    return window.GAME_SETTINGS;
  };
})();
