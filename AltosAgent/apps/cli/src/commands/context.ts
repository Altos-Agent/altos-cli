// altos context command - show relevant context for a prompt
import { runContextCommand } from "@altos/code-index/cli";

export async function runContextCommandCLI(opts: { args: string[] }): Promise<number> {
  const args = opts.args;

  // Parse context-specific options
  const options: {
    prompt?: string;
    path?: string;
    files?: number;
    json?: boolean;
    maxTokens?: number;
    showEvidence?: boolean;
  } = {};

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === "--json") {
      options.json = true;
      i++;
    } else if (arg === "--evidence" || arg === "--show-evidence") {
      options.showEvidence = true;
      i++;
    } else if (arg.startsWith("--max-tokens=")) {
      options.maxTokens = parseInt(arg.split("=")[1], 10);
      i++;
    } else if (arg.startsWith("--files=")) {
      options.files = parseInt(arg.split("=")[1], 10);
      i++;
    } else if (arg === "--path" && args[i + 1]) {
      options.path = args[i + 1];
      i += 2;
    } else if (arg.startsWith("--path=")) {
      options.path = arg.split("=")[1];
      i++;
    } else if (!arg.startsWith("-")) {
      // First non-option is the prompt
      if (!options.prompt) {
        options.prompt = arg;
      }
      i++;
    } else {
      i++;
    }
  }

  if (!options.prompt) {
    console.error("Usage: altos context \"your question or task\" [options]");
    console.error("");
    console.error("Options:");
    console.error("  --json              Output JSON format");
    console.error("  --evidence          Show scoring evidence");
    console.error("  --max-tokens=<n>    Max token budget (default: 6000)");
    console.error("  --files=<n>         Max files to select (default: 10)");
    console.error("  --path=<dir>        Path to analyze (default: cwd)");
    return 1;
  }

  return runContextCommand({
    prompt: options.prompt,
    path: options.path,
    files: options.files,
    json: options.json,
    maxTokens: options.maxTokens,
    showEvidence: options.showEvidence,
  });
}