import { ADDRESS_PATTERNS, DEFAULT_PROBE_AMOUNT, FUNDING_TOKEN_DEFAULTS, HELP_TEXT, INTENT_HINTS } from "../constants.js";
import { looksLikeEvmAddress, looksLikeSolanaAddress, looksLikeTronAddress, normalizeChain } from "../utils.js";

function includesAny(text, patterns) {
  return patterns.some((pattern) => text.includes(pattern));
}

function extractChain(text) {
  const pieces = text.split(/[\s,，。:：()（）]+/).filter(Boolean);
  for (const piece of pieces) {
    const normalized = normalizeChain(piece);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function extractTokenAddress(text) {
  return text.match(ADDRESS_PATTERNS.evm)?.[0]
    ?? text.match(ADDRESS_PATTERNS.tron)?.[0]
    ?? text.match(ADDRESS_PATTERNS.solana)?.[0]
    ?? null;
}

function inferChainFromAddress(address) {
  if (!address) {
    return null;
  }

  if (looksLikeSolanaAddress(address)) {
    return "solana";
  }

  if (looksLikeTronAddress(address)) {
    return "tron";
  }

  return null;
}

function extractSymbolQuery(text, address) {
  if (address) {
    return null;
  }

  const uppercase = text.match(/\b[A-Z0-9]{2,10}\b/g) ?? [];
  const filteredUppercase = uppercase.filter((candidate) => !["USDC", "USDT", "ETH", "SOL", "BNB", "OKB"].includes(candidate));
  if (filteredUppercase.length > 0) {
    return filteredUppercase[0];
  }

  const named = text.match(/(?:token|币|代币)\s+([A-Za-z0-9_-]{2,20})/i);
  return named?.[1] ?? null;
}

function extractFundingSymbol(text, chain) {
  const symbol = text.match(/\b(USDC|USDT|ETH|SOL|BNB|OKB)\b/i)?.[1];
  if (symbol) {
    return symbol.toLowerCase();
  }

  if (/[0-9]+(?:\.[0-9]+)?\s*(u|usd)\b/i.test(text)) {
    return "usdc";
  }

  return FUNDING_TOKEN_DEFAULTS[chain] ?? "usdc";
}

function extractAmount(text, wantsExecute) {
  const sanitized = text
    .replace(ADDRESS_PATTERNS.evm, " ")
    .replace(ADDRESS_PATTERNS.tron, " ")
    .replace(ADDRESS_PATTERNS.solana, " ");
  const amountMatch = sanitized.match(/(\d+(?:\.\d+)?)\s*(USDC|USDT|ETH|SOL|BNB|OKB|U|USD)?/i);
  if (amountMatch && (wantsExecute || amountMatch[2])) {
    return amountMatch[1];
  }

  return wantsExecute ? DEFAULT_PROBE_AMOUNT : null;
}

export function parseIntent(input) {
  const text = input.trim();
  const lower = text.toLowerCase();

  if (!text) {
    return {
      type: "help",
      message: HELP_TEXT
    };
  }

  if (["help", "?", "帮助", "用法", "examples"].includes(lower)) {
    return {
      type: "help",
      message: HELP_TEXT
    };
  }

  const address = extractTokenAddress(text);
  const chain = extractChain(text) ?? inferChainFromAddress(address);
  const wantsExecute = includesAny(lower, INTENT_HINTS.execute) && !includesAny(lower, INTENT_HINTS.avoidExecution);
  const wantsQuote = includesAny(lower, INTENT_HINTS.quote);
  const type = wantsExecute ? "probe" : wantsQuote ? "quote" : "analyze";

  return {
    type,
    raw: text,
    chain,
    tokenAddress: address,
    tokenQuery: extractSymbolQuery(text, address),
    fundingSymbol: extractFundingSymbol(text, chain ?? "solana"),
    amount: extractAmount(text, wantsExecute || wantsQuote),
    needsChainConfirmation: Boolean(address && looksLikeEvmAddress(address) && !chain)
  };
}
