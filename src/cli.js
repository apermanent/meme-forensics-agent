import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadEnvFile, requireEnv } from "./config.js";
import { handleIntent } from "./core/forensics.js";
import { parseIntent } from "./core/intent.js";
import { HELP_TEXT } from "./constants.js";
import { OnchainOsProvider } from "./providers/onchainos.js";

function parseFlags(argv) {
  const flags = new Set();
  const rest = [];
  for (const value of argv) {
    if (value.startsWith("--")) {
      flags.add(value);
    } else {
      rest.push(value);
    }
  }
  return { flags, rest };
}

async function confirmFromTerminal(prompt) {
  const rl = readline.createInterface({ input, output });
  output.write(`${prompt}\n\nExecute probe trade now? Type yes to continue: `);
  const answer = (await rl.question("")).trim().toLowerCase();
  await rl.close();
  return answer === "yes";
}

async function runOneShot(provider, text, options) {
  const intent = parseIntent(text);
  const result = await handleIntent(intent, {
    provider,
    dryRun: options.dryRun,
    autoConfirm: options.autoConfirm,
    confirm: confirmFromTerminal
  });
  output.write(`${result}\n`);
}

async function runInteractive(provider, options) {
  const rl = readline.createInterface({ input, output });
  output.write(`${HELP_TEXT}\n\n输入 exit / quit / 退出 可以结束。\n\n`);

  while (true) {
    const raw = (await rl.question("you> ")).trim();
    if (!raw) {
      continue;
    }

    if (["exit", "quit", "退出"].includes(raw.toLowerCase())) {
      break;
    }

    const intent = parseIntent(raw);
    const result = await handleIntent(intent, {
      provider,
      dryRun: options.dryRun,
      autoConfirm: options.autoConfirm,
      confirm: async (prompt) => {
        output.write(`${prompt}\n\n`);
        const answer = (await rl.question("Execute probe trade now? Type yes to continue: ")).trim().toLowerCase();
        return answer === "yes";
      }
    });

    output.write(`\n${result}\n\n`);
  }

  await rl.close();
}

async function main() {
  loadEnvFile();
  const missing = requireEnv(["OKX_API_KEY", "OKX_SECRET_KEY", "OKX_PASSPHRASE"]);
  if (missing.length > 0) {
    output.write(`Missing required env vars: ${missing.join(", ")}\n`);
    process.exitCode = 1;
    return;
  }

  const { flags, rest } = parseFlags(process.argv.slice(2));
  const provider = new OnchainOsProvider();
  const options = {
    dryRun: flags.has("--dry-run"),
    autoConfirm: flags.has("--yes")
  };

  if (flags.has("--interactive") || rest.length === 0) {
    await runInteractive(provider, options);
    return;
  }

  await runOneShot(provider, rest.join(" "), options);
}

main().catch((error) => {
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exitCode = 1;
});

