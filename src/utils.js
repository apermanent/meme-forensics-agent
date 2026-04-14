import { CHAIN_ALIASES, CHAIN_IDS } from "./constants.js";

export function loadJsonLoose(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    const objectStart = text.indexOf("{");
    const objectEnd = text.lastIndexOf("}");
    if (objectStart !== -1 && objectEnd !== -1 && objectEnd > objectStart) {
      try {
        return JSON.parse(text.slice(objectStart, objectEnd + 1));
      } catch {
        return null;
      }
    }

    const arrayStart = text.indexOf("[");
    const arrayEnd = text.lastIndexOf("]");
    if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
      try {
        return JSON.parse(text.slice(arrayStart, arrayEnd + 1));
      } catch {
        return null;
      }
    }

    return null;
  }
}

export function unwrapOnchainosResponse(payload) {
  if (!payload) {
    return null;
  }

  if (typeof payload !== "object") {
    return payload;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "data")) {
    return payload.data;
  }

  return payload;
}

export function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === null || value === undefined) {
    return [];
  }

  return [value];
}

export function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

export function toNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.replace(/[%,$\s,]/g, "");
  if (!cleaned) {
    return null;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function shortAddress(value, size = 4) {
  if (!value || value.length < size * 2 + 2) {
    return value ?? "";
  }

  return `${value.slice(0, size + 2)}...${value.slice(-size)}`;
}

export function titleCaseChain(chain) {
  if (!chain) {
    return "Unknown";
  }

  return chain.charAt(0).toUpperCase() + chain.slice(1);
}

export function formatUsd(value) {
  const parsed = toNumber(value);
  if (parsed === null) {
    return "n/a";
  }

  if (Math.abs(parsed) >= 1000000) {
    return `$${(parsed / 1000000).toFixed(2)}M`;
  }

  if (Math.abs(parsed) >= 1000) {
    return `$${(parsed / 1000).toFixed(2)}K`;
  }

  return `$${parsed.toFixed(parsed >= 1 ? 2 : 4)}`;
}

export function formatPercent(value) {
  const parsed = toNumber(value);
  if (parsed === null) {
    return "n/a";
  }

  return `${parsed.toFixed(2)}%`;
}

export function formatTokenUnits(value, decimals) {
  if (value === null || value === undefined || value === "") {
    return "n/a";
  }

  if (typeof value === "number") {
    return String(value);
  }

  const raw = String(value);
  if (raw.includes(".") || decimals === null || decimals === undefined) {
    return raw;
  }

  const numericDecimals = Number(decimals);
  if (!Number.isFinite(numericDecimals) || numericDecimals < 0) {
    return raw;
  }

  const negative = raw.startsWith("-");
  const digits = raw.replace(/^-/, "").replace(/\D/g, "") || "0";
  const padded = digits.padStart(numericDecimals + 1, "0");
  const whole = padded.slice(0, -numericDecimals) || "0";
  const fraction = numericDecimals === 0 ? "" : padded.slice(-numericDecimals).replace(/0+$/, "");
  const formatted = fraction ? `${whole}.${fraction}` : whole;
  return negative ? `-${formatted}` : formatted;
}

export function normalizeChain(raw) {
  if (!raw) {
    return null;
  }

  const key = String(raw).trim().toLowerCase().replace(/\s+/g, "");
  return CHAIN_ALIASES[key] ?? null;
}

export function chainIdFor(chain) {
  return chain ? CHAIN_IDS[chain] ?? null : null;
}

export function walkValues(node, visitor, path = []) {
  if (node === null || node === undefined) {
    return;
  }

  visitor(node, path);

  if (Array.isArray(node)) {
    node.forEach((item, index) => walkValues(item, visitor, path.concat(String(index))));
    return;
  }

  if (typeof node === "object") {
    Object.entries(node).forEach(([key, value]) => walkValues(value, visitor, path.concat(key)));
  }
}

export function findFirstKeyMatch(node, keys) {
  const lookup = new Set(keys.map((key) => key.toLowerCase()));
  let found;

  walkValues(node, (value, path) => {
    if (found !== undefined || path.length === 0) {
      return;
    }

    const lastKey = path[path.length - 1].toLowerCase();
    if (lookup.has(lastKey)) {
      found = value;
    }
  });

  return found;
}

export function getPathValue(node, path) {
  const segments = path.split(".");
  let cursor = node;

  for (const segment of segments) {
    if (cursor === null || cursor === undefined) {
      return undefined;
    }

    if (Array.isArray(cursor)) {
      const index = Number(segment);
      cursor = Number.isInteger(index) ? cursor[index] : undefined;
      continue;
    }

    if (typeof cursor !== "object") {
      return undefined;
    }

    cursor = cursor[segment];
  }

  return cursor;
}

export function pickValue(node, candidates) {
  for (const candidate of candidates) {
    const exact = getPathValue(node, candidate);
    if (exact !== undefined && exact !== null && exact !== "") {
      return exact;
    }
  }

  return findFirstKeyMatch(node, candidates.map((candidate) => candidate.split(".").at(-1)));
}

export function looksLikeEvmAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value ?? "");
}

export function looksLikeSolanaAddress(value) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value ?? "") && !looksLikeEvmAddress(value);
}

export function looksLikeTronAddress(value) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value ?? "");
}

export function dedupeBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
