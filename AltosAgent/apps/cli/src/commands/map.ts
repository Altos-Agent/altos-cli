// altos map command - repository mapping
export async function runMapCommand(opts: { args: string[] }): Promise<number> {
  const { runMapCommand: cmd } = await import("@altos/code-index/cli");
  const args = opts.args ?? [];

  // Check for quiet flag
  const quiet = args.includes("--quiet");
  const json = args.includes("--json");

  // Check for path flag
  let path: string | undefined;
  const pathIdx = args.indexOf("--path=");
  if (pathIdx !== -1) {
    path = args[pathIdx].split("=")[1];
  } else if (args.includes("--path") && args[args.indexOf("--path") + 1] && !args[args.indexOf("--path") + 1].startsWith("--")) {
    path = args[args.indexOf("--path") + 1];
  }

  return cmd({
    path,
    focus: args.find((a) => a.startsWith("--focus="))?.split("=")[1],
    exports: args.includes("--exports"),
    packages: args.includes("--packages"),
    important: args.includes("--important"),
    json,
    noColor: args.includes("--no-color"),
    quiet,
  });
}
