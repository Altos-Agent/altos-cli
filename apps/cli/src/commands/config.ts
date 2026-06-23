// altos config command - get/set configuration
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

function getAltosConfigPaths() {
  const home = os.homedir();
  const cwd = process.cwd();
  return {
    global: path.join(home, ".altos", "config.json"),
    local: path.join(cwd, ".altos", "config.json"),
  };
}

export async function runConfigCommand(opts: { args: string[] }): Promise<number> {
  const subcmd = opts.args[0];
  const key = opts.args[1];
  const value = opts.args[2];

  if (subcmd === "get") {
    return cmdConfigGet(key);
  }
  if (subcmd === "set" && key && value) {
    return cmdConfigSet(key, value);
  }
  return cmdConfigGet();
}

async function cmdConfigGet(key?: string): Promise<number> {
  const paths = getAltosConfigPaths();

  let config: Record<string, unknown> = {};
  let configPath = "";

  for (const p of [paths.local, paths.global]) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, "utf-8");
        config = JSON.parse(content);
        configPath = p;
        break;
      } catch {
        // Skip invalid config
      }
    }
  }

  if (!configPath) {
    console.log("No config file found.");
    console.log(`Global: ${paths.global}`);
    console.log(`Local:  ${paths.local}`);
    return 0;
  }

  console.log(`Config: ${configPath}\n`);

  if (key) {
    const parts = key.split(".");
    let value: unknown = config;
    for (const part of parts) {
      if (value && typeof value === "object" && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        console.log(`Key "${key}" not found.`);
        return 1;
      }
    }
    console.log(`${key} = ${JSON.stringify(value, null, 2)}`);
  } else {
    console.log(JSON.stringify(config, null, 2));
  }

  return 0;
}

async function cmdConfigSet(key: string, value: string): Promise<number> {
  const paths = getAltosConfigPaths();

  let configPath = "";
  let config: Record<string, unknown> = {};

  for (const p of [paths.local, paths.global]) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, "utf-8");
        config = JSON.parse(content);
        configPath = p;
        break;
      } catch {
        // Skip invalid config
      }
    }
  }

  if (!configPath) {
    configPath = paths.global;
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
  }

  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(value);
  } catch {
    parsedValue = value;
  }

  const parts = key.split(".");
  let current: Record<string, unknown> = config;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = parsedValue;

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    console.log(`Set ${key} = ${JSON.stringify(parsedValue)} in ${configPath}`);
    return 0;
  } catch (err) {
    console.error(`Failed to write config: ${err}`);
    return 1;
  }
}
