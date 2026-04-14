import { DEFAULT_PROBE_AMOUNT, FUNDING_TOKEN_DEFAULTS, HELP_TEXT } from "../constants.js";
import { scoreSnapshot } from "./scoring.js";
import {
  asArray,
  dedupeBy,
  firstDefined,
  formatPercent,
  formatUsd,
  formatTokenUnits,
  normalizeChain,
  pickValue,
  titleCaseChain,
  toNumber
} from "../utils.js";
import { extractWalletAddress, summarizeCommandFailure } from "../providers/onchainos.js";

const EVM_CHAINS = new Set(["ethereum", "bsc", "xlayer", "base", "arbitrum", "polygon", "avalanche", "optimism"]);
const EVM_NATIVE_TOKEN_SENTINEL = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

async function safeCall(label, fn) {
  try {
    const response = await fn();
    return { ok: true, label, ...response };
  } catch (error) {
    return {
      ok: false,
      label,
      error: summarizeCommandFailure(error)
    };
  }
}

function describeSearchResult(item) {
  const symbol = firstDefined(pickValue(item, ["symbol", "tokenSymbol"]), "UNKNOWN");
  const name = firstDefined(pickValue(item, ["name", "tokenName"]), "Unknown token");
  const chain = firstDefined(pickValue(item, ["chainName", "chain"]), "unknown");
  const address = firstDefined(
    pickValue(item, ["tokenContractAddress", "address", "tokenAddress"]),
    ""
  );
  return `- ${name} (${symbol}) on ${chain}: ${address}`;
}

async function resolveToken(intent, provider) {
  if (intent.tokenAddress) {
    return {
      ok: true,
      address: intent.tokenAddress,
      chain: intent.chain,
      query: intent.tokenQuery
    };
  }

  if (!intent.tokenQuery) {
    return {
      ok: false,
      message: `${HELP_TEXT}\n\n我需要至少一个代币合约地址，或者一个清晰的 symbol/name。`
    };
  }

  const search = await safeCall("token.search", () => provider.tokenSearch(intent.tokenQuery, intent.chain));
  if (!search.ok) {
    return {
      ok: false,
      message: `无法搜索代币 ${intent.tokenQuery}：${search.error}`
    };
  }

  const results = dedupeBy(asArray(search.data), (item) => JSON.stringify(item)).slice(0, 5);
  if (results.length === 0) {
    return {
      ok: false,
      message: `没有搜到 ${intent.tokenQuery}。建议直接提供合约地址。`
    };
  }

  if (results.length > 1) {
    return {
      ok: false,
      message: `我找到了多个候选代币，请直接给我合约地址继续：\n${results.map(describeSearchResult).join("\n")}`
    };
  }

  const only = results[0];
  return {
    ok: true,
    address: firstDefined(
      pickValue(only, ["tokenContractAddress", "address", "tokenAddress"]),
      null
    ),
    chain: intent.chain ?? normalizeChain(pickValue(only, ["chainName", "chain"])) ?? intent.chain,
    query: intent.tokenQuery
  };
}

function buildDryRun(intent) {
  const lines = [
    "Dry run plan:",
    `- intent: ${intent.type}`,
    `- chain: ${intent.chain ?? "(needs confirmation)"}`,
    `- token address: ${intent.tokenAddress ?? "(needs resolution)"}`,
    `- token query: ${intent.tokenQuery ?? "(none)"}`,
    `- amount: ${intent.amount ?? "(default later if needed)"}`,
    "",
    "Expected OnchainOS calls:"
  ];

  if (!intent.tokenAddress && intent.tokenQuery) {
    lines.push(`- onchainos token search --query ${intent.tokenQuery}${intent.chain ? ` --chains ${intent.chain}` : ""}`);
  }

  lines.push("- onchainos token info --address <token> --chain <chain>");
  lines.push("- onchainos token price-info --address <token> --chain <chain>");
  lines.push("- onchainos token advanced-info --address <token> --chain <chain>");
  lines.push("- onchainos token liquidity --address <token> --chain <chain>");
  lines.push("- onchainos token holders --address <token> --chain <chain>");
  lines.push("- onchainos signal chains");
  lines.push("- onchainos signal list --chain <chain> --token-address <token>");
  lines.push("- onchainos memepump token-details --address <token> --chain <chain>");
  lines.push("- onchainos memepump token-dev-info --address <token> --chain <chain>");
  lines.push("- onchainos memepump similar-tokens --address <token> --chain <chain>");
  lines.push("- onchainos memepump token-bundle-info --address <token> --chain <chain>");
  lines.push("- onchainos memepump aped-wallet --address <token> --chain <chain>");
  lines.push("- onchainos security token-scan --tokens <chainId>:<token>");

  if (intent.type === "quote" || intent.type === "probe") {
    lines.push("- onchainos wallet status");
    lines.push("- onchainos wallet addresses --chain <chain>");
    lines.push("- onchainos swap quote --from <funding token> --to <token> --amount <minimal-units> --chain <chain>");
  }

  if (intent.type === "probe") {
    lines.push("- onchainos swap swap --from <funding token> --to <token> --amount <minimal-units> --chain <chain> --wallet <address>");
  }

  return lines.join("\n");
}

function extractTokenIdentity(identityPayload, fallbackAddress) {
  return {
    name: firstDefined(pickValue(identityPayload, ["tokenName", "name"]), "Unknown token"),
    symbol: firstDefined(pickValue(identityPayload, ["tokenSymbol", "symbol"]), "UNKNOWN"),
    address: firstDefined(pickValue(identityPayload, ["tokenContractAddress", "address"]), fallbackAddress)
  };
}

function getAddressFromSearchResult(item) {
  return firstDefined(
    pickValue(item, ["tokenContractAddress", "address", "tokenAddress"]),
    null
  );
}

async function resolveSwapToken(provider, tokenRef, chain) {
  if (!tokenRef) {
    return tokenRef;
  }

  if (/^(0x[a-fA-F0-9]{40}|T[1-9A-HJ-NP-Za-km-z]{33}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(tokenRef)) {
    return tokenRef;
  }

  const search = await safeCall(`token.search:${tokenRef}`, () => provider.tokenSearch(tokenRef, chain));
  if (!search.ok) {
    return tokenRef;
  }

  const rows = asArray(search.data);
  if (rows.length === 0) {
    return tokenRef;
  }

  const normalizedTokenRef = tokenRef.toLowerCase();
  const exact = rows.find((row) => {
    const symbol = String(firstDefined(pickValue(row, ["symbol", "tokenSymbol"]), "")).toLowerCase();
    const name = String(firstDefined(pickValue(row, ["name", "tokenName"]), "")).toLowerCase();
    return symbol === normalizedTokenRef || name === normalizedTokenRef;
  }) ?? rows[0];

  return getAddressFromSearchResult(exact) ?? tokenRef;
}

function buildReportText(resolved, snapshot, scoring) {
  const identity = extractTokenIdentity(snapshot.tokenInfo?.data ?? snapshot.priceInfo?.data ?? {}, resolved.address);
  const facts = scoring.facts;
  const price24h = pickValue(snapshot.priceInfo?.data, ["priceChange24H"]);
  const marketCap = pickValue(snapshot.priceInfo?.data, ["marketCap"]);
  const holders = pickValue(snapshot.priceInfo?.data, ["holders"]);

  const lines = [
    "# Meme Forensics Report",
    "",
    `Token: ${identity.name} (${identity.symbol})`,
    `Chain: ${titleCaseChain(resolved.chain)}`,
    `Address: ${identity.address}`,
    `Risk score: ${scoring.score}/100`,
    `Recommendation: ${scoring.recommendation.toUpperCase()}`,
    ""
  ];

  lines.push("## Verdict");
  if (scoring.recommendation === "avoid") {
    lines.push("This token should be treated as a hard avoid unless you have external evidence that outweighs the current red flags.");
  } else if (scoring.recommendation === "watch") {
    lines.push("This token is not an automatic block, but the current evidence says watch first and size very carefully.");
  } else {
    lines.push("The token is not clean enough to trust blindly, but it is currently within probe-size territory rather than hard-avoid territory.");
  }
  lines.push("");

  lines.push("## Market Read");
  lines.push(`- Liquidity: ${formatUsd(facts.liquidityUsd)}`);
  lines.push(`- Market cap: ${formatUsd(marketCap)}`);
  lines.push(`- 24h change: ${price24h ?? "n/a"}`);
  lines.push(`- Holders: ${holders ?? "n/a"}`);
  lines.push("");

  lines.push("## Red Flags");
  if (scoring.redFlags.length === 0) {
    lines.push("- No hard red flag was extracted from the available data.");
  } else {
    scoring.redFlags.forEach((flag) => lines.push(`- ${flag}`));
  }
  lines.push("");

  lines.push("## Watch Items");
  if (scoring.watchItems.length === 0) {
    lines.push("- No extra watch item stood out beyond the main summary.");
  } else {
    scoring.watchItems.forEach((item) => lines.push(`- ${item}`));
  }
  lines.push("");

  lines.push("## Positive Signals");
  if (scoring.greenFlags.length === 0) {
    lines.push("- No strong green flag was extracted from the current data.");
  } else {
    scoring.greenFlags.forEach((flag) => lines.push(`- ${flag}`));
  }
  lines.push("");

  lines.push("## Structure");
  lines.push(`- Dev rug count: ${facts.devRugPullTokenCount ?? "n/a"}`);
  lines.push(`- Dev launch count: ${facts.devCreateTokenCount ?? "n/a"}`);
  lines.push(`- Dev holding: ${formatPercent(facts.devHoldingPercent)}`);
  lines.push(`- Top-10 holder concentration: ${formatPercent(facts.top10HoldPercent)}`);
  lines.push(`- Bundle holding: ${formatPercent(facts.bundleHoldingPercent)}`);
  lines.push(`- Sniper holding: ${formatPercent(facts.sniperHoldingPercent)}`);
  lines.push(`- Suspicious holding: ${formatPercent(facts.suspiciousHoldingPercent)}`);
  lines.push("");

  lines.push("## Smart Money");
  lines.push(`- Aggregated signal count: ${facts.smartMoneySignalCount}`);
  lines.push(`- Average sold ratio: ${formatPercent(facts.averageSoldRatioPercent)}`);
  lines.push(`- Same-car wallet count: ${facts.sameCarWalletCount ?? "n/a"}`);
  lines.push("");

  lines.push("## Action");
  if (scoring.recommendation === "avoid") {
    lines.push("- Suggested action: walk away and wait for cleaner structure.");
  } else if (scoring.recommendation === "watch") {
    lines.push("- Suggested action: keep watching, avoid size, and only consider a tiny test after another fresh pass.");
  } else {
    lines.push("- Suggested action: only consider a tiny probe trade, never a full-size entry.");
  }

  const failedCalls = Object.values(snapshot)
    .filter((item) => item && item.ok === false)
    .map((item) => `${item.label}: ${item.error}`);

  if (failedCalls.length > 0) {
    lines.push("");
    lines.push("## Partial Data Notes");
    failedCalls.forEach((failure) => lines.push(`- ${failure}`));
  }

  return lines.join("\n");
}

async function collectSnapshot(resolved, provider) {
  const walletStatus = await safeCall("wallet.status", () => provider.walletStatus());
  let walletAddress = null;

  if (walletStatus.ok && walletStatus.data?.loggedIn) {
    const walletAddresses = await safeCall("wallet.addresses", () => provider.walletAddresses(resolved.chain));
    if (walletAddresses.ok) {
      try {
        walletAddress = extractWalletAddress(walletAddresses.data, resolved.chain);
      } catch {
        walletAddress = null;
      }
    }
  }

  const [
    tokenInfo,
    priceInfo,
    advancedInfo,
    holders,
    liquidity,
    signalChains,
    tokenDetails,
    devInfo,
    similarTokens,
    bundleInfo,
    apedWallet,
    security
  ] = await Promise.all([
    safeCall("token.info", () => provider.tokenInfo(resolved.address, resolved.chain)),
    safeCall("token.price-info", () => provider.tokenPriceInfo(resolved.address, resolved.chain)),
    safeCall("token.advanced-info", () => provider.tokenAdvancedInfo(resolved.address, resolved.chain)),
    safeCall("token.holders", () => provider.tokenHolders(resolved.address, resolved.chain)),
    safeCall("token.liquidity", () => provider.tokenLiquidity(resolved.address, resolved.chain)),
    safeCall("signal.chains", () => provider.signalChains()),
    safeCall("memepump.token-details", () => provider.memepumpTokenDetails(resolved.address, resolved.chain, walletAddress)),
    safeCall("memepump.token-dev-info", () => provider.memepumpTokenDevInfo(resolved.address, resolved.chain)),
    safeCall("memepump.similar-tokens", () => provider.memepumpSimilarTokens(resolved.address, resolved.chain)),
    safeCall("memepump.token-bundle-info", () => provider.memepumpTokenBundleInfo(resolved.address, resolved.chain)),
    safeCall("memepump.aped-wallet", () => provider.memepumpApedWallet(resolved.address, resolved.chain, walletAddress)),
    safeCall("security.token-scan", () => provider.securityTokenScan(resolved.address, resolved.chain))
  ]);

  let signalList = { ok: false, label: "signal.list", error: "Chain support unknown." };
  if (signalChains.ok) {
    const supported = JSON.stringify(signalChains.data).toLowerCase();
    if (supported.includes(resolved.chain)) {
      signalList = await safeCall("signal.list", () => provider.signalList(resolved.chain, resolved.address));
    } else {
      signalList = { ok: false, label: "signal.list", error: `Signals are not supported on ${resolved.chain}.` };
    }
  }

  return {
    walletStatus,
    tokenInfo,
    priceInfo,
    advancedInfo,
    holders,
    liquidity,
    signalChains,
    signalList,
    tokenDetails,
    devInfo,
    similarTokens,
    bundleInfo,
    apedWallet,
    security,
    walletAddress
  };
}

function buildQuoteText(analysisText, quote, fundingSymbol, amount, targetDecimals) {
  const quoteData = quote.data ?? {};
  const outputAmount = pickValue(quoteData, ["toTokenAmount", "toAmount", "amountOut", "receiveAmount"]);
  const priceImpact = pickValue(quoteData, ["priceImpact"]);
  const gas = firstDefined(pickValue(quoteData, ["gas", "gasFee", "gasUsed"]), "n/a");
  const honeypot = firstDefined(pickValue(quoteData, ["isHoneyPot"]), false);
  const taxRate = firstDefined(pickValue(quoteData, ["taxRate"]), "n/a");

  return [
    analysisText,
    "",
    "## Probe Quote",
    `- Spend: ${amount} ${fundingSymbol.toUpperCase()}`,
    `- Expected receive: ${formatTokenUnits(outputAmount, targetDecimals)}`,
    `- Price impact: ${priceImpact ?? "n/a"}`,
    `- Gas: ${gas}`,
    `- Honeypot flag in quote: ${honeypot}`,
    `- Tax rate: ${taxRate}`,
    "",
    "Type `yes` in interactive mode if you want to execute the probe trade."
  ].join("\n");
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isEvmLikeChain(chain) {
  return EVM_CHAINS.has(normalizeChain(chain) ?? chain);
}

function shouldRunApproval(chain, tokenAddress) {
  if (!isEvmLikeChain(chain) || !tokenAddress) {
    return false;
  }

  return String(tokenAddress).toLowerCase() !== EVM_NATIVE_TOKEN_SENTINEL;
}

function nativeDecimalsForChain(chain) {
  return normalizeChain(chain) === "solana" ? 9 : 18;
}

function extractHistoryRows(payload) {
  const rows = asArray(payload);
  if (rows.length === 0) {
    return [];
  }

  if (Array.isArray(rows[0]?.orderList)) {
    return rows.flatMap((row) => asArray(row.orderList));
  }

  return rows;
}

async function waitForWalletTx(provider, { chain, address, txHash, timeoutMs = 45000, intervalMs = 3000 }) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() <= deadline) {
    try {
      const history = await provider.walletHistory({
        chain,
        address,
        txHash,
        limit: 1
      });
      const rows = extractHistoryRows(history.data);
      const match = rows.find((row) => String(pickValue(row, ["txHash"])).toLowerCase() === String(txHash).toLowerCase());
      if (match) {
        const status = String(firstDefined(pickValue(match, ["txStatus", "status"]), "UNKNOWN")).toUpperCase();
        if (!["PENDING", "PROCESSING", "UNKNOWN"].includes(status)) {
          return {
            ok: true,
            status,
            entry: match
          };
        }
      }
    } catch (error) {
      lastError = summarizeCommandFailure(error);
    }

    await sleep(intervalMs);
  }

  return {
    ok: false,
    error: lastError ?? `Timed out waiting for transaction ${txHash}.`
  };
}

function shouldEnableMev(chain, quoteData) {
  const normalized = normalizeChain(chain);
  if (!["ethereum", "bsc", "base"].includes(normalized)) {
    return false;
  }

  const priceImpact = toNumber(pickValue(quoteData, ["priceImpact"]));
  return priceImpact !== null && priceImpact >= 3;
}

export async function handleIntent(intent, { provider, dryRun = false, autoConfirm = false, confirm } = {}) {
  if (intent.type === "help") {
    return intent.message;
  }

  if (intent.needsChainConfirmation) {
    return "这个合约地址看起来是 EVM 地址，但没有明确链名。请补一句 chain，例如 ethereum / bsc / base / xlayer。";
  }

  if (dryRun) {
    return buildDryRun(intent);
  }

  const resolved = await resolveToken(intent, provider);
  if (!resolved.ok) {
    return resolved.message;
  }

  if (!resolved.chain) {
    return "我还缺少链名。对于 EVM token，请告诉我是 ethereum / bsc / base / xlayer 哪条链。";
  }

  const snapshot = await collectSnapshot(resolved, provider);
  const scoring = scoreSnapshot(snapshot);
  const analysisText = buildReportText(resolved, snapshot, scoring);

  if (intent.type === "analyze") {
    return analysisText;
  }

  if (!snapshot.walletStatus.ok || !snapshot.walletStatus.data?.loggedIn) {
    return `${analysisText}\n\n## Execution Blocked\n钱包执行态不可用。请先确认 Agentic Wallet 处于已登录状态。`;
  }

  if (scoring.recommendation === "avoid") {
    return `${analysisText}\n\n## Execution Blocked\n当前风险结论是 AVOID，我不会继续生成或执行试单。`;
  }

  const walletAddress = snapshot.walletAddress;
  if (!walletAddress) {
    return `${analysisText}\n\n## Execution Blocked\n我没能从 Agentic Wallet 中提取到 ${resolved.chain} 的可用地址。`;
  }

  const amount = intent.amount ?? DEFAULT_PROBE_AMOUNT;
  const fundingSymbol = intent.fundingSymbol ?? FUNDING_TOKEN_DEFAULTS[resolved.chain] ?? "usdc";
  const fundingToken = await resolveSwapToken(provider, fundingSymbol, resolved.chain);
  const targetDecimals = pickValue(snapshot.tokenInfo?.data, ["decimal", "decimals"]);
  const quote = await safeCall("swap.quote", () =>
    provider.swapQuote({
      chain: resolved.chain,
      fromToken: fundingToken,
      toToken: resolved.address,
      amount,
      amountToken: fundingSymbol
    })
  );

  if (!quote.ok) {
    return `${analysisText}\n\n## Quote Failed\n${quote.error}`;
  }

  if (intent.type === "quote") {
    return buildQuoteText(analysisText, quote, fundingSymbol, amount, targetDecimals);
  }

  const confirmationMessage = buildQuoteText(analysisText, quote, fundingSymbol, amount, targetDecimals);
  let approved = autoConfirm;
  if (!approved && typeof confirm === "function") {
    approved = await confirm(confirmationMessage);
  }

  if (!approved) {
    return `${confirmationMessage}\n\nExecution cancelled.`;
  }

  const quoteData = quote.data ?? {};
  const mevProtection = shouldEnableMev(resolved.chain, quoteData);
  const tips = resolved.chain === "solana" ? "0.001" : undefined;
  let approvalTxHash = null;
  if (shouldRunApproval(resolved.chain, fundingToken)) {
    const approval = await safeCall("swap.approve", () =>
      provider.swapApprove({
        chain: resolved.chain,
        token: fundingToken,
        amount,
        amountToken: fundingSymbol
      })
    );

    if (!approval.ok) {
      return `${confirmationMessage}\n\n## Approval Failed\n${approval.error}`;
    }

    const approvalPayload = asArray(approval.data)[0];
    if (!approvalPayload?.data) {
      return `${confirmationMessage}\n\n## Approval Failed\nOnchainOS did not return approval calldata.`;
    }

    const approvalCall = await safeCall("wallet.contract-call.approve", () =>
      provider.walletContractCall({
        chain: resolved.chain,
        to: fundingToken,
        inputData: approvalPayload.data,
        gasLimit: approvalPayload.gasLimit,
        from: walletAddress
      })
    );

    if (!approvalCall.ok) {
      return `${confirmationMessage}\n\n## Approval Failed\n${approvalCall.error}`;
    }

    approvalTxHash = approvalCall.txHash ?? null;
    if (!approvalTxHash) {
      return [
        confirmationMessage,
        "",
        "## Approval Unconfirmed",
        "OnchainOS returned approval calldata, but Agentic Wallet did not return an approval tx hash."
      ].join("\n");
    }

    const approvalReceipt = await waitForWalletTx(provider, {
      chain: resolved.chain,
      address: walletAddress,
      txHash: approvalTxHash
    });

    if (!approvalReceipt.ok) {
      return `${confirmationMessage}\n\n## Approval Unconfirmed\n${approvalReceipt.error}`;
    }

    if (approvalReceipt.status !== "SUCCESS") {
      const failReason = firstDefined(pickValue(approvalReceipt.entry, ["failReason"]), "Unknown approval failure.");
      return `${confirmationMessage}\n\n## Approval Failed\n${failReason}`;
    }
  }

  const execute = await safeCall("swap.build", () =>
    provider.swapBuildTx({
      chain: resolved.chain,
      fromToken: fundingToken,
      toToken: resolved.address,
      amount,
      amountToken: fundingSymbol,
      wallet: walletAddress,
      gasLevel: "fast",
      mevProtection,
      tips
    })
  );

  if (!execute.ok) {
    return `${confirmationMessage}\n\n## Swap Build Failed\n${execute.error}`;
  }

  const executePayload = asArray(execute.data)[0] ?? {};
  const swapTx = executePayload.tx ?? {};
  const swapTarget = pickValue(swapTx, ["to"]);
  const swapInputData = pickValue(swapTx, ["data"]);
  if (!swapTarget || !swapInputData) {
    return [
      confirmationMessage,
      "",
      "## Execution Unconfirmed",
      approvalTxHash ? `- Approval tx: ${approvalTxHash}` : "- Approval tx: not needed",
      "OnchainOS returned a swap build result without executable transaction calldata."
    ].join("\n");
  }

  const swapCall = await safeCall("wallet.contract-call.swap", () =>
    provider.walletContractCall({
      chain: resolved.chain,
      to: swapTarget,
      inputData: swapInputData,
      gasLimit: pickValue(swapTx, ["gas"]),
      value: formatTokenUnits(pickValue(swapTx, ["value"]), nativeDecimalsForChain(resolved.chain)),
      from: walletAddress,
      mevProtection
    })
  );

  if (!swapCall.ok) {
    return `${confirmationMessage}\n\n## Execution Failed\n${swapCall.error}`;
  }

  const swapTxHash = swapCall.txHash ?? "n/a";
  if (!swapCall.txHash) {
    return [
      confirmationMessage,
      "",
      "## Execution Unconfirmed",
      approvalTxHash ? `- Approval tx: ${approvalTxHash}` : "- Approval tx: not needed",
      `- Swap tx: ${swapTxHash}`,
      "",
      "Agentic Wallet did not return a swap tx hash, so I cannot confirm that the probe trade actually landed on-chain."
    ].join("\n");
  }

  const swapReceipt = await waitForWalletTx(provider, {
    chain: resolved.chain,
    address: walletAddress,
    txHash: swapCall.txHash
  });

  if (!swapReceipt.ok) {
    return `${confirmationMessage}\n\n## Execution Unconfirmed\n${swapReceipt.error}`;
  }

  if (swapReceipt.status !== "SUCCESS") {
    const failReason = firstDefined(pickValue(swapReceipt.entry, ["failReason"]), "Unknown swap failure.");
    return `${confirmationMessage}\n\n## Execution Failed\n${failReason}`;
  }

  const swapEntry = swapReceipt.entry ?? {};
  const receivedAssets = asArray(pickValue(swapEntry, ["input"])).map((item) => {
    const amountValue = pickValue(item, ["amount"]);
    const symbolValue = firstDefined(pickValue(item, ["name", "coinSymbol"]), fundingSymbol.toUpperCase());
    return amountValue ? `${amountValue} ${symbolValue}` : null;
  }).filter(Boolean);
  const spentAssets = asArray(pickValue(swapEntry, ["output"])).map((item) => {
    const amountValue = pickValue(item, ["amount"]);
    const symbolValue = firstDefined(pickValue(item, ["name", "coinSymbol"]), "output");
    return amountValue ? `${amountValue} ${symbolValue}` : null;
  }).filter(Boolean);
  const gasUsed = firstDefined(pickValue(swapEntry, ["serviceChargeUsd", "serviceCharge"]), "n/a");

  return [
    confirmationMessage,
    "",
    "## Execution Result",
    approvalTxHash ? `- Approval tx: ${approvalTxHash}` : "- Approval tx: not needed",
    `- Swap tx: ${swapTxHash}`,
    `- Sent: ${spentAssets.join(", ") || `${amount} ${fundingSymbol.toUpperCase()}`}`,
    `- Received: ${receivedAssets.join(", ") || "n/a"}`,
    `- Price impact: ${pickValue(executePayload, ["routerResult.priceImpactPercent", "priceImpactPercent", "priceImpact"]) ?? "n/a"}`,
    `- Gas used: ${gasUsed ?? "n/a"}`,
    "",
    "Probe trade complete."
  ].join("\n");
}
