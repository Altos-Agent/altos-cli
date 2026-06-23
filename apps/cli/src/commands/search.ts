// altos search command - code search
export async function runSearchCommand(opts: { args: string[] }): Promise<number> {
  const { runSearchCommand: cmd } = await import("@altos/code-index/cli");
  return cmd({
    query: opts.args?.[0] ?? "",
    path: opts.args?.includes("--path=")
      ? opts.args[opts.args.indexOf("--path=") + 1]
      : undefined,
    refs: opts.args?.includes("--refs"),
    file: opts.args?.find((a) => a.startsWith("--file="))?.split("=")[1],
    kind: opts.args?.find((a) => a.startsWith("--kind="))?.split("=")[1],
    json: opts.args?.includes("--json"),
    limit: opts.args?.find((a) => a.startsWith("--limit="))
      ? parseInt(opts.args[opts.args.indexOf("--limit=") + 1].split("=")[1], 10)
      : 50,
  });
}
