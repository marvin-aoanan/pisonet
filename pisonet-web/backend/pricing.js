const FLAT_RATE_SETTING_KEYS = [
  'flat_rate_tier1_minutes',
  'flat_rate_tier1_price',
  'flat_rate_tier2_minutes',
  'flat_rate_tier2_price',
  'flat_rate_tier3_minutes',
  'flat_rate_tier3_price',
];

const DEFAULT_FLAT_RATE_SETTINGS = {
  flat_rate_tier1_minutes: 15,
  flat_rate_tier1_price: 5,
  flat_rate_tier2_minutes: 30,
  flat_rate_tier2_price: 10,
  flat_rate_tier3_minutes: 60,
  flat_rate_tier3_price: 15,
};

function parsePositiveNumber(rawValue, fallbackValue) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackValue;
  }
  return parsed;
}

function normalizeFlatRateSettings(rawSettings = {}) {
  const tier1Minutes = parsePositiveNumber(rawSettings.flat_rate_tier1_minutes, DEFAULT_FLAT_RATE_SETTINGS.flat_rate_tier1_minutes);
  const tier1Price = parsePositiveNumber(rawSettings.flat_rate_tier1_price, DEFAULT_FLAT_RATE_SETTINGS.flat_rate_tier1_price);

  const tier2MinutesRaw = parsePositiveNumber(rawSettings.flat_rate_tier2_minutes, DEFAULT_FLAT_RATE_SETTINGS.flat_rate_tier2_minutes);
  const tier2Minutes = Math.max(tier1Minutes + 1, tier2MinutesRaw);
  const tier2Price = parsePositiveNumber(rawSettings.flat_rate_tier2_price, DEFAULT_FLAT_RATE_SETTINGS.flat_rate_tier2_price);

  const tier3MinutesRaw = parsePositiveNumber(rawSettings.flat_rate_tier3_minutes, DEFAULT_FLAT_RATE_SETTINGS.flat_rate_tier3_minutes);
  const tier3Minutes = Math.max(tier2Minutes + 1, tier3MinutesRaw);
  const tier3Price = parsePositiveNumber(rawSettings.flat_rate_tier3_price, DEFAULT_FLAT_RATE_SETTINGS.flat_rate_tier3_price);

  return {
    flat_rate_tier1_minutes: tier1Minutes,
    flat_rate_tier1_price: tier1Price,
    flat_rate_tier2_minutes: tier2Minutes,
    flat_rate_tier2_price: tier2Price,
    flat_rate_tier3_minutes: tier3Minutes,
    flat_rate_tier3_price: tier3Price,
  };
}

function calculateFlatRateAmountFromMinutes(minutes, pricingSettings, options = {}) {
  const { minimumCharge = false } = options;
  const pricing = normalizeFlatRateSettings(pricingSettings);
  const absMinutes = Math.ceil(Math.max(0, Number(minutes) || 0));
  const tiers = [
    { minutes: pricing.flat_rate_tier1_minutes, price: pricing.flat_rate_tier1_price },
    { minutes: pricing.flat_rate_tier2_minutes, price: pricing.flat_rate_tier2_price },
    { minutes: pricing.flat_rate_tier3_minutes, price: pricing.flat_rate_tier3_price },
  ];

  if (absMinutes === 0) {
    return minimumCharge ? pricing.flat_rate_tier1_price : 0;
  }

  const maxTierMinutes = tiers.reduce((maxMinutes, tier) => Math.max(maxMinutes, tier.minutes), 0);
  const limit = absMinutes + maxTierMinutes;
  const bestCostByMinute = Array(limit + 1).fill(Infinity);
  bestCostByMinute[0] = 0;

  for (let coveredMinutes = 0; coveredMinutes <= limit; coveredMinutes += 1) {
    if (!Number.isFinite(bestCostByMinute[coveredMinutes])) {
      continue;
    }

    tiers.forEach((tier) => {
      const nextCoveredMinutes = Math.min(limit, coveredMinutes + tier.minutes);
      const nextCost = bestCostByMinute[coveredMinutes] + tier.price;
      if (nextCost < bestCostByMinute[nextCoveredMinutes]) {
        bestCostByMinute[nextCoveredMinutes] = nextCost;
      }
    });
  }

  let bestCost = Infinity;
  for (let coveredMinutes = absMinutes; coveredMinutes <= limit; coveredMinutes += 1) {
    bestCost = Math.min(bestCost, bestCostByMinute[coveredMinutes]);
  }

  return Number.isFinite(bestCost) ? bestCost : pricing.flat_rate_tier1_price;
}

function loadFlatRateSettings(db, callback) {
  db.all(
    `SELECT key, value FROM settings WHERE key IN (${FLAT_RATE_SETTING_KEYS.map(() => '?').join(', ')})`,
    FLAT_RATE_SETTING_KEYS,
    (err, rows) => {
      if (err) {
        callback(err);
        return;
      }

      const nextSettings = {};
      (rows || []).forEach((row) => {
        nextSettings[row.key] = row.value;
      });

      callback(null, normalizeFlatRateSettings(nextSettings));
    }
  );
}

module.exports = {
  DEFAULT_FLAT_RATE_SETTINGS,
  FLAT_RATE_SETTING_KEYS,
  normalizeFlatRateSettings,
  calculateFlatRateAmountFromMinutes,
  loadFlatRateSettings,
};
