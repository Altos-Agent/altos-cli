import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

interface ImportWalletResponse {
  id: string;
  name: string;
  address: string;
  status: string;
  maxTradeUsd: string | null;
  maxDailyTrades: number | null;
  maxDailyLossUsd: string | null;
  maxGasUsd: string | null;
  notes: string | null;
}

const apiBaseUrl =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  `http://127.0.0.1:${process.env.API_PORT ?? "4100"}`;

const promptLine = async (question: string) => {
  const rl = createInterface({ input, output });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
};

const promptHidden = async (question: string) => {
  if (!input.isTTY || !output.isTTY || input.setRawMode === undefined) {
    output.write(
      "Hidden input is not available in this terminal. Local API import is for development only.\n"
    );
    return promptLine(question);
  }

  output.write(question);
  input.setRawMode(true);
  input.resume();
  input.setEncoding("utf8");

  return await new Promise<string>((resolve, reject) => {
    let value = "";

    const cleanup = () => {
      input.setRawMode(false);
      input.pause();
      input.off("data", onData);
    };

    const onData = (chunk: string) => {
      if (chunk === "\u0003") {
        cleanup();
        output.write("\n");
        reject(new Error("Interrupted"));
        return;
      }

      if (chunk === "\r" || chunk === "\n") {
        cleanup();
        output.write("\n");
        resolve(value.trim());
        return;
      }

      if (chunk === "\u007f") {
        value = value.slice(0, -1);
        return;
      }

      value += chunk;
    };

    input.on("data", onData);
  });
};

const optionalNumber = (value: string) => (value === "" ? undefined : value);

const main = async () => {
  const name = await promptLine("Wallet name: ");
  const privateKey = await promptHidden("Private key: ");
  const maxTradeUsd = optionalNumber(await promptLine("Max trade USD: "));
  const maxDailyTradesInput = optionalNumber(
    await promptLine("Max daily trades: ")
  );
  const maxDailyLossUsd = optionalNumber(await promptLine("Max daily loss USD: "));
  const maxGasUsd = optionalNumber(await promptLine("Max gas USD: "));
  const notes = optionalNumber(await promptLine("Notes: "));

  const response = await fetch(`${apiBaseUrl}/api/wallets/import`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      name,
      privateKey,
      maxTradeUsd,
      maxDailyTrades:
        maxDailyTradesInput === undefined
          ? undefined
          : Number(maxDailyTradesInput),
      maxDailyLossUsd,
      maxGasUsd,
      notes
    })
  });

  const body = (await response.json()) as ImportWalletResponse | { error: string };

  if (!response.ok) {
    throw new Error("error" in body ? body.error : "Wallet import failed");
  }

  const wallet = body as ImportWalletResponse;

  output.write(
    JSON.stringify(
      {
        id: wallet.id,
        name: wallet.name,
        address: wallet.address,
        status: wallet.status,
        maxTradeUsd: wallet.maxTradeUsd,
        maxDailyTrades: wallet.maxDailyTrades,
        maxDailyLossUsd: wallet.maxDailyLossUsd,
        maxGasUsd: wallet.maxGasUsd,
        notes: wallet.notes
      },
      null,
      2
    )
  );
  output.write("\n");
};

try {
  await main();
} catch (error) {
  output.write(
    `${error instanceof Error ? error.message : "Wallet import failed"}\n`
  );
  process.exit(1);
}
