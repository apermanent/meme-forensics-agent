import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chainIdFor, loadJsonLoose, normalizeChain, unwrapOnchainosResponse } from "../utils.js";

function resolveOnchainosBinary() {
  if (process.platform === "win32") {
    const candidate = path.join(process.env.USERPROFILE ?? "", ".local", "bin", "onchainos.exe");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return "onchainos";
}

const ONCHAINOS_BINARY = resolveOnchainosBinary();
const TOKEN_DECIMALS = {
  usdc: 6,
  usdt: 6,
  dai: 18,
  eth: 18,
  weth: 18,
  bnb: 18,
  wbnb: 18,
  okb: 18,
  sol: 9
};

function toMinimalUnits(amount, token) {
  const decimals = TOKEN_DECIMALS[String(token).toLowerCase()] ?? 18;
  const [wholePart, fractionalPart = ""] = String(amount).split(".");
  const whole = wholePart.replace(/\D/g, "") || "0";
  const fractional = fractionalPart.replace(/\D/g, "").slice(0, decimals).padEnd(decimals, "0");
  const combined = `${whole}${fractional}`.replace(/^0+(?=\d)/, "");
  return combined || "0";
}

function runCommand(args) {
  return runRawCommand(args).then((response) => {
    if (response.code === 0) {
      return response;
    }

    const { parsed, stderr, stdout, code } = response;
    const message = parsed?.error ?? stderr.trim() ?? stdout.trim() ?? `onchainos exited with code ${code}`;
    throw Object.assign(new Error(message), response);
  });
}

function runRawCommand(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ONCHAINOS_BINARY, args, {
      cwd: process.cwd(),
      env: process.env,
      shell: false
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      const parsed = loadJsonLoose(stdout) ?? loadJsonLoose(stderr);
      const payload = unwrapOnchainosResponse(parsed);
      resolve({
        ok: code === 0,
        code,
        args,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        parsed,
        data: payload
      });
    });
  });
}

function normalizeAddressForChain(address, chain) {
  if (!address) {
    return address;
  }

  if (["ethereum", "bsc", "xlayer", "base", "arbitrum", "polygon", "avalanche", "optimism"].includes(chain)) {
    return address.toLowerCase();
  }

  return address;
}

export class OnchainOsProvider {
  async walletStatus() {
    return runCommand(["wallet", "status"]);
  }

  async walletAddresses(chain) {
    const args = ["wallet", "addresses"];
    if (chain) {
      args.push("--chain", chainIdFor(chain) ?? chain);
    }
    return runCommand(args);
  }

  async tokenSearch(query, chain) {
    const args = ["token", "search", "--query", query];
    if (chain) {
      args.push("--chains", chainIdFor(chain) ?? chain);
    }
    return runCommand(args);
  }

  async tokenInfo(address, chain) {
    const args = ["token", "info", "--address", normalizeAddressForChain(address, chain)];
    if (chain) {
      args.push("--chain", chain);
    }
    return runCommand(args);
  }

  async tokenPriceInfo(address, chain) {
    const args = ["token", "price-info", "--address", normalizeAddressForChain(address, chain)];
    if (chain) {
      args.push("--chain", chain);
    }
    return runCommand(args);
  }

  async tokenAdvancedInfo(address, chain) {
    const args = ["token", "advanced-info", "--address", normalizeAddressForChain(address, chain)];
    if (chain) {
      args.push("--chain", chain);
    }
    return runCommand(args);
  }

  async tokenHolders(address, chain) {
    const args = ["token", "holders", "--address", normalizeAddressForChain(address, chain)];
    if (chain) {
      args.push("--chain", chain);
    }
    return runCommand(args);
  }

  async tokenLiquidity(address, chain) {
    const args = ["token", "liquidity", "--address", normalizeAddressForChain(address, chain)];
    if (chain) {
      args.push("--chain", chain);
    }
    return runCommand(args);
  }

  async tokenClusterOverview(address, chain) {
    const args = ["token", "cluster-overview", "--address", normalizeAddressForChain(address, chain)];
    if (chain) {
      args.push("--chain", chain);
    }
    return runCommand(args);
  }

  async trackerActivities({ chain, trackerType = "smart_money", tradeType = "1", minVolume = "1000" } = {}) {
    const args = ["tracker", "activities", "--tracker-type", trackerType, "--trade-type", tradeType];
    if (chain) {
      args.push("--chain", chain);
    }
    if (minVolume) {
      args.push("--min-volume", minVolume);
    }
    return runCommand(args);
  }

  async signalChains() {
    return runCommand(["signal", "chains"]);
  }

  async signalList(chain, tokenAddress) {
    const args = ["signal", "list", "--chain", chain, "--wallet-type", "1,2,3"];
    if (tokenAddress) {
      args.push("--token-address", normalizeAddressForChain(tokenAddress, chain));
    }
    return runCommand(args);
  }

  async memepumpTokenDetails(address, chain, wallet) {
    const args = ["memepump", "token-details", "--address", normalizeAddressForChain(address, chain)];
    if (chain) {
      args.push("--chain", chain);
    }
    if (wallet) {
      args.push("--wallet", wallet);
    }
    return runCommand(args);
  }

  async memepumpTokenDevInfo(address, chain) {
    const args = ["memepump", "token-dev-info", "--address", normalizeAddressForChain(address, chain)];
    if (chain) {
      args.push("--chain", chain);
    }
    return runCommand(args);
  }

  async memepumpSimilarTokens(address, chain) {
    const args = ["memepump", "similar-tokens", "--address", normalizeAddressForChain(address, chain)];
    if (chain) {
      args.push("--chain", chain);
    }
    return runCommand(args);
  }

  async memepumpTokenBundleInfo(address, chain) {
    const args = ["memepump", "token-bundle-info", "--address", normalizeAddressForChain(address, chain)];
    if (chain) {
      args.push("--chain", chain);
    }
    return runCommand(args);
  }

  async memepumpApedWallet(address, chain, wallet) {
    const args = ["memepump", "aped-wallet", "--address", normalizeAddressForChain(address, chain)];
    if (chain) {
      args.push("--chain", chain);
    }
    if (wallet) {
      args.push("--wallet", wallet);
    }
    return runCommand(args);
  }

  async securityTokenScan(address, chain) {
    const chainKey = chainIdFor(chain) ?? chain;
    return runCommand(["security", "token-scan", "--tokens", `${chainKey}:${normalizeAddressForChain(address, chain)}`]);
  }

  async swapQuote({ chain, fromToken, toToken, amount, amountToken = fromToken }) {
    return runCommand([
      "swap",
      "quote",
      "--from",
      fromToken,
      "--to",
      normalizeAddressForChain(toToken, chain),
      "--amount",
      toMinimalUnits(amount, amountToken),
      "--chain",
      chain
    ]);
  }

  async swapApprove({ chain, token, amount, amountToken = token }) {
    return runCommand([
      "swap",
      "approve",
      "--token",
      normalizeAddressForChain(token, chain),
      "--amount",
      toMinimalUnits(amount, amountToken),
      "--chain",
      chain
    ]);
  }

  async swapBuildTx({ chain, fromToken, toToken, amount, amountToken = fromToken, wallet, slippage, gasLevel = "fast", mevProtection = false, tips }) {
    const args = [
      "swap",
      "swap",
      "--from",
      fromToken,
      "--to",
      normalizeAddressForChain(toToken, chain),
      "--amount",
      toMinimalUnits(amount, amountToken),
      "--chain",
      chain,
      "--wallet",
      wallet,
      "--gas-level",
      gasLevel
    ];

    if (slippage) {
      args.push("--slippage", slippage);
    }
    if (tips) {
      args.push("--tips", tips);
    }

    return runCommand(args);
  }

  async walletContractCall({ chain, to, inputData, value = "0", from, gasLimit, mevProtection = false, unsignedTx, jitoUnsignedTx }) {
    const args = [
      "wallet",
      "contract-call",
      "--to",
      normalizeAddressForChain(to, chain),
      "--chain",
      chainIdFor(chain) ?? chain
    ];

    if (inputData) {
      args.push("--input-data", inputData);
    }
    if (unsignedTx) {
      args.push("--unsigned-tx", unsignedTx);
    }
    if (value && value !== "0") {
      args.push("--value", value);
    }
    if (gasLimit) {
      args.push("--gas-limit", String(gasLimit));
    }
    if (from) {
      args.push("--from", normalizeAddressForChain(from, chain));
    }
    if (mevProtection) {
      args.push("--mev-protection");
    }
    if (jitoUnsignedTx) {
      args.push("--jito-unsigned-tx", jitoUnsignedTx);
    }

    const response = await runRawCommand(args);
    const txHash = response.parsed?.data?.txHash
      ?? response.parsed?.txHash
      ?? response.data?.txHash
      ?? null;

    if (response.code === 0) {
      return {
        ...response,
        ok: true,
        txHash
      };
    }

    if (response.code === 2 || response.parsed?.confirming) {
      return {
        ...response,
        ok: true,
        txHash,
        confirming: response.parsed ?? { message: response.stdout || response.stderr }
      };
    }

    const message = response.parsed?.error ?? response.stderr ?? response.stdout ?? `onchainos exited with code ${response.code}`;
    throw Object.assign(new Error(message), response);
  }

  async walletHistory({ chain, address, txHash, limit = 10 }) {
    const args = [
      "wallet",
      "history",
      "--chain",
      chainIdFor(chain) ?? chain,
      "--address",
      normalizeAddressForChain(address, chain),
      "--limit",
      String(limit)
    ];

    if (txHash) {
      args.push("--tx-hash", txHash);
    }

    return runCommand(args);
  }
}

export function extractWalletAddress(payload, chain) {
  const normalizedChain = normalizeChain(chain) ?? chain;
  const candidates = [];

  const collect = (value) => {
    if (typeof value === "string") {
      candidates.push(value);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }

    if (value && typeof value === "object") {
      Object.values(value).forEach(collect);
    }
  };

  collect(payload);

  for (const candidate of candidates) {
    if (normalizedChain === "solana" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(candidate)) {
      return candidate;
    }

    if (normalizedChain === "tron" && /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(candidate)) {
      return candidate;
    }

    if (["ethereum", "bsc", "xlayer", "base", "arbitrum", "polygon", "avalanche", "optimism"].includes(normalizedChain) && /^0x[a-fA-F0-9]{40}$/.test(candidate)) {
      return candidate.toLowerCase();
    }
  }

  throw new Error(`Could not find a wallet address for ${normalizedChain}.`);
}

export function summarizeCommandFailure(error) {
  const pieces = [];
  if (error?.message) {
    pieces.push(error.message);
  }
  if (error?.parsed?.error && error.parsed.error !== error.message) {
    pieces.push(error.parsed.error);
  }
  return pieces.filter(Boolean).join(" | ") || "Unknown OnchainOS error";
}
