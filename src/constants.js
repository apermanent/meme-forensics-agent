export const CHAIN_IDS = {
  ethereum: "1",
  bsc: "56",
  solana: "501",
  xlayer: "196",
  base: "8453",
  arbitrum: "42161",
  polygon: "137",
  avalanche: "43114",
  optimism: "10",
  tron: "195"
};

export const CHAIN_ALIASES = {
  eth: "ethereum",
  ethereum: "ethereum",
  以太坊: "ethereum",
  bsc: "bsc",
  bnb: "bsc",
  币安链: "bsc",
  sol: "solana",
  solana: "solana",
  xlayer: "xlayer",
  x层: "xlayer",
  okb: "xlayer",
  base: "base",
  arbitrum: "arbitrum",
  arb: "arbitrum",
  polygon: "polygon",
  matic: "polygon",
  avalanche: "avalanche",
  avax: "avalanche",
  optimism: "optimism",
  op: "optimism",
  tron: "tron",
  trx: "tron"
};

export const FUNDING_TOKEN_DEFAULTS = {
  solana: "usdc",
  xlayer: "usdc",
  base: "usdc",
  arbitrum: "usdc",
  ethereum: "usdc",
  polygon: "usdc",
  optimism: "usdc",
  avalanche: "usdc",
  bsc: "usdt",
  tron: "usdt"
};

export const ADDRESS_PATTERNS = {
  evm: /\b0x[a-fA-F0-9]{40}\b/,
  solana: /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/,
  tron: /\bT[1-9A-HJ-NP-Za-km-z]{33}\b/
};

export const INTENT_HINTS = {
  analyze: [
    "分析",
    "法医",
    "report",
    "forensics",
    "check",
    "safe",
    "安全吗",
    "风险",
    "rug",
    "bundle",
    "sniper",
    "聪明钱",
    "developer",
    "dev"
  ],
  quote: ["quote", "报价", "估价", "price impact", "能换多少", "多少钱能买"],
  execute: ["试单", "probe", "小仓位", "买", "buy", "swap", "执行", "下单", "trade", "直接上"],
  avoidExecution: ["只分析", "不要执行", "先别买", "不用买", "只看报告"]
};

export const DEFAULT_PROBE_AMOUNT = "1";

export const HELP_TEXT = `Meme Forensics Agent 当前支持这些能力：

1. 出完整法医报告
2. 查开发者历史和 rug 记录
3. 查 bundle / sniper / 同车地址
4. 查聪明钱 / KOL / whale 动向
5. 做安全扫描和 honeypot 检查
6. 分析后给出小仓位试单报价
7. 分析后执行小仓位试单

你可以直接用自然语言说，例如：

- 帮我查这个币是不是土狗盘：<token address>
- 看下这个币的开发者有没有 rug 历史
- 聪明钱是在建仓还是出货：<token address>
- 给我一份完整法医报告：<token address>
- 如果风险不是最高，先帮我小仓位试 1 USDC：<token address>

如果是 EVM 合约地址，请尽量同时告诉我链名，例如 ethereum / bsc / base / xlayer。`;
