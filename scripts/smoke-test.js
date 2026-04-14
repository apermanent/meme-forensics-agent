import assert from "node:assert/strict";
import { parseIntent } from "../src/core/intent.js";
import { DEFAULT_PROBE_AMOUNT } from "../src/constants.js";

const analyze = parseIntent("帮我查这个币是不是土狗盘 9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump solana");
assert.equal(analyze.type, "analyze");
assert.equal(analyze.chain, "solana");
assert.ok(analyze.tokenAddress);

const probe = parseIntent("如果风险不是最高，先帮我小仓位试 10 USDC 0x1111111111111111111111111111111111111111 on base");
assert.equal(probe.type, "probe");
assert.equal(probe.chain, "base");
assert.equal(probe.amount, "10");
assert.equal(probe.fundingSymbol, "usdc");

const quote = parseIntent("给我报价 5 usdt 0x2222222222222222222222222222222222222222 bsc");
assert.equal(quote.type, "quote");
assert.equal(quote.chain, "bsc");
assert.equal(quote.fundingSymbol, "usdt");

const defaultProbe = parseIntent("分析后给出小仓位试单报价 0x0cc24c51bf89c00c5affbfcf5e856c25ecbdb48e xlayer");
assert.equal(defaultProbe.type, "probe");
assert.equal(defaultProbe.chain, "xlayer");
assert.equal(defaultProbe.amount, DEFAULT_PROBE_AMOUNT);

console.log("smoke-test passed");
