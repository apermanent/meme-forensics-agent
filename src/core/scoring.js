import { asArray, firstDefined, pickValue, toNumber } from "../utils.js";

function collectSecurityFacts(securityPayload) {
  const rows = asArray(securityPayload).flatMap((entry) => asArray(entry?.data ?? entry));
  const firstRow = rows[0] ?? securityPayload ?? {};
  return {
    action: firstDefined(pickValue(firstRow, ["action"]), ""),
    isRiskToken: Boolean(pickValue(firstRow, ["isRiskToken"])),
    buyTaxes: toNumber(pickValue(firstRow, ["buyTaxes"])),
    sellTaxes: toNumber(pickValue(firstRow, ["sellTaxes"])),
    warning: pickValue(firstRow, ["message", "reason", "warnings"])
  };
}

function collectFacts(snapshot) {
  const advancedInfo = snapshot.advancedInfo?.data ?? {};
  const priceInfo = snapshot.priceInfo?.data ?? {};
  const devInfo = snapshot.devInfo?.data ?? {};
  const tokenDetails = snapshot.tokenDetails?.data ?? {};
  const bundleInfo = snapshot.bundleInfo?.data ?? {};
  const signalRows = asArray(snapshot.signalList?.data);
  const security = collectSecurityFacts(snapshot.security?.data);

  const soldRatios = signalRows
    .map((row) => toNumber(pickValue(row, ["soldRatioPercent"])))
    .filter((value) => value !== null);

  return {
    security,
    riskControlLevel: toNumber(pickValue(advancedInfo, ["riskControlLevel", "riskLevelControl"])),
    devRugPullTokenCount: toNumber(
      firstDefined(
        pickValue(advancedInfo, ["devRugPullTokenCount"]),
        pickValue(devInfo, ["devLaunchedInfo.rugPullCount"])
      )
    ),
    devCreateTokenCount: toNumber(
      firstDefined(
        pickValue(advancedInfo, ["devCreateTokenCount"]),
        pickValue(devInfo, ["devLaunchedInfo.totalTokens"])
      )
    ),
    top10HoldPercent: toNumber(
      firstDefined(
        pickValue(advancedInfo, ["top10HoldPercent", "top10HoldingsPercent"]),
        pickValue(tokenDetails, ["tags.top10HoldingsPercent"])
      )
    ),
    devHoldingPercent: toNumber(
      firstDefined(
        pickValue(advancedInfo, ["devHoldingPercent"]),
        pickValue(devInfo, ["devHoldingInfo.devHoldingPercent"]),
        pickValue(tokenDetails, ["tags.devHoldingsPercent"])
      )
    ),
    bundleHoldingPercent: toNumber(
      firstDefined(
        pickValue(advancedInfo, ["bundleHoldingPercent", "bundleHoldPercent"]),
        pickValue(tokenDetails, ["tags.bundlersPercent"])
      )
    ),
    sniperHoldingPercent: toNumber(
      firstDefined(
        pickValue(advancedInfo, ["sniperHoldingPercent"]),
        pickValue(tokenDetails, ["tags.snipersPercent"])
      )
    ),
    suspiciousHoldingPercent: toNumber(
      firstDefined(
        pickValue(advancedInfo, ["suspiciousHoldingPercent"]),
        pickValue(tokenDetails, ["tags.suspectedPhishingWalletPercent"])
      )
    ),
    liquidityUsd: toNumber(
      firstDefined(
        pickValue(priceInfo, ["liquidity"]),
        pickValue(tokenDetails, ["liquidity"]),
        pickValue(snapshot.liquidity?.data, ["0.liquidityUsd"])
      )
    ),
    holders: toNumber(
      firstDefined(
        pickValue(priceInfo, ["holders"]),
        pickValue(tokenDetails, ["tags.totalHolders"])
      )
    ),
    smartMoneySignalCount: signalRows.length,
    averageSoldRatioPercent: soldRatios.length
      ? soldRatios.reduce((total, value) => total + value, 0) / soldRatios.length
      : null,
    sameCarWalletCount: toNumber(
      firstDefined(
        pickValue(tokenDetails, ["aped"]),
        pickValue(snapshot.apedWallet?.data, ["count"])
      )
    ),
    bundlerAthPercent: toNumber(pickValue(bundleInfo, ["bundlerAthPercent"])),
    totalBundlers: toNumber(pickValue(bundleInfo, ["totalBundlers"])),
    tokenTags: asArray(pickValue(advancedInfo, ["tokenTags"])).map((value) => String(value))
  };
}

export function scoreSnapshot(snapshot) {
  const facts = collectFacts(snapshot);
  const redFlags = [];
  const greenFlags = [];
  const watchItems = [];
  let score = 18;

  if (facts.security.action === "block") {
    score += 55;
    redFlags.push("Security scan returned BLOCK.");
  } else if (facts.security.action === "warn") {
    score += 28;
    watchItems.push("Security scan returned WARN.");
  } else {
    greenFlags.push("Security scan did not return a hard block.");
  }

  if (facts.security.isRiskToken) {
    score += 18;
    redFlags.push("Security scan marked the token as high-risk.");
  }

  if (facts.security.buyTaxes !== null && facts.security.buyTaxes > 10) {
    score += 14;
    redFlags.push(`Buy tax is elevated at ${facts.security.buyTaxes}%.`);
  }

  if (facts.security.sellTaxes !== null && facts.security.sellTaxes > 10) {
    score += 16;
    redFlags.push(`Sell tax is elevated at ${facts.security.sellTaxes}%.`);
  }

  if (facts.riskControlLevel !== null && facts.riskControlLevel >= 4) {
    score += 16;
    redFlags.push(`Risk control level is ${facts.riskControlLevel}.`);
  } else if (facts.riskControlLevel !== null && facts.riskControlLevel <= 2) {
    greenFlags.push(`Risk control level is ${facts.riskControlLevel}.`);
  }

  if (facts.devRugPullTokenCount !== null && facts.devRugPullTokenCount > 0) {
    score += facts.devRugPullTokenCount >= 3 ? 26 : 14;
    redFlags.push(`Developer has ${facts.devRugPullTokenCount} recorded rug-pull projects.`);
  } else if (facts.devCreateTokenCount !== null && facts.devCreateTokenCount > 0) {
    greenFlags.push("Developer history did not surface a rug count.");
  }

  if (facts.top10HoldPercent !== null && facts.top10HoldPercent >= 50) {
    score += 18;
    redFlags.push(`Top-10 holder concentration is ${facts.top10HoldPercent}%.`);
  } else if (facts.top10HoldPercent !== null && facts.top10HoldPercent >= 25) {
    score += 8;
    watchItems.push(`Top-10 holder concentration is ${facts.top10HoldPercent}%.`);
  } else if (facts.top10HoldPercent !== null) {
    greenFlags.push(`Top-10 holder concentration is ${facts.top10HoldPercent}%.`);
  }

  if (facts.devHoldingPercent !== null && facts.devHoldingPercent >= 20) {
    score += 16;
    redFlags.push(`Developer still holds ${facts.devHoldingPercent}% of supply.`);
  } else if (facts.devHoldingPercent !== null && facts.devHoldingPercent >= 8) {
    score += 8;
    watchItems.push(`Developer still holds ${facts.devHoldingPercent}% of supply.`);
  }

  if (facts.bundleHoldingPercent !== null && facts.bundleHoldingPercent >= 10) {
    score += 12;
    redFlags.push(`Bundle holding is ${facts.bundleHoldingPercent}%.`);
  }

  if (facts.sniperHoldingPercent !== null && facts.sniperHoldingPercent >= 10) {
    score += 8;
    watchItems.push(`Sniper holding is ${facts.sniperHoldingPercent}%.`);
  }

  if (facts.suspiciousHoldingPercent !== null && facts.suspiciousHoldingPercent >= 5) {
    score += 10;
    redFlags.push(`Suspicious holding share is ${facts.suspiciousHoldingPercent}%.`);
  }

  if (facts.liquidityUsd !== null && facts.liquidityUsd < 1000) {
    score += 24;
    redFlags.push("Liquidity is below $1K.");
  } else if (facts.liquidityUsd !== null && facts.liquidityUsd < 10000) {
    score += 12;
    watchItems.push("Liquidity is below $10K.");
  } else if (facts.liquidityUsd !== null) {
    greenFlags.push("Liquidity is above $10K.");
  }

  if (facts.bundlerAthPercent !== null && facts.bundlerAthPercent >= 10) {
    score += 10;
    redFlags.push(`Bundler all-time-high share is ${facts.bundlerAthPercent}%.`);
  }

  if (facts.averageSoldRatioPercent !== null && facts.averageSoldRatioPercent >= 70) {
    score += 12;
    watchItems.push(`Signal wallets have sold ${facts.averageSoldRatioPercent.toFixed(2)}% on average.`);
  } else if (facts.averageSoldRatioPercent !== null && facts.smartMoneySignalCount > 0) {
    greenFlags.push(`Signal wallets are still holding most size (sold ratio ${facts.averageSoldRatioPercent.toFixed(2)}%).`);
  }

  if (facts.smartMoneySignalCount === 0) {
    watchItems.push("No fresh smart-money signal was found for this token.");
  } else {
    greenFlags.push(`Found ${facts.smartMoneySignalCount} smart-money/KOL/whale signals.`);
  }

  if (facts.tokenTags.includes("communityRecognized")) {
    greenFlags.push("Token is community-recognized.");
  }

  if (facts.tokenTags.includes("honeypot")) {
    score += 30;
    redFlags.push("Advanced token info includes a honeypot tag.");
  }

  if (facts.tokenTags.includes("smartMoneyBuy")) {
    greenFlags.push("Advanced token info includes a smart-money-buy tag.");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let recommendation = "watch";
  if (facts.security.action === "block" || score >= 75) {
    recommendation = "avoid";
  } else if (score <= 35) {
    recommendation = "probe";
  }

  return {
    score,
    recommendation,
    facts,
    redFlags,
    watchItems,
    greenFlags
  };
}
