// altos index command - code indexing

interface ParsedIndexArgs {
  path?: string;
  force?: boolean;
  stats?: boolean;
  json?: boolean;
  quiet?: boolean;
  watch?: boolean;
  poll?: number;
}

/**
 * Parse `argv` for `--key=value`, `--key value`, and boolean `--key` flags.
 * Repeated flags accumulate.
 */
function parseFlags(argv: string[]): ParsedIndexArgs {
  const out: ParsedIndexArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];

    const eqIdx = a.indexOf("=");
    let key: string;
    let val: string | undefined;
    if (a.startsWith("--") && eqIdx > 0) {
      key = a.slice(2, eqIdx);
      val = a.slice(eqIdx + 1);
    } else if (a.startsWith("--")) {
      key = a.slice(2);
      // Treat the next argv item as the value if it doesn't look like a flag.
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        val = next;
        i++;
      }
    } else {
      continue;
    }

    switch (key) {
      case "path":
        out.path = val;
        break;
      case "force":
        out.force = true;
        break;
      case "stats":
        out.stats = true;
        break;
      case "json":
        out.json = true;
        break;
      case "quiet":
        out.quiet = true;
        break;
      case "watch":
        out.watch = true;
        break;
      case "poll": {
        const n = val === undefined ? NaN : Number(val);
        if (!Number.isNaN(n) && n > 0) out.poll = n;
        break;
      }
      // Unknown flags are ignored — keep the shim permissive.
    }
  }
  return out;
}

export async function runIndexCommand(opts: { args: string[] }): Promise<number> {
  const { runIndexCommand: cmd } = await import("@altos/code-index/cli");
  const parsed = parseFlags(opts.args ?? []);
  return cmd(parsed);
}