#!/usr/bin/env tsx
// scripts/create-skill.ts

import { readdir, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, "../templates/skill-template");
const OUTPUT_DIR = join(__dirname, "../packages");

interface Options {
  name: string;
  description?: string;
}

async function main() {
  const args = process.argv.slice(2);
  let name = "";
  let description = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--name" && i + 1 < args.length) {
      name = args[++i];
    } else if (args[i] === "--description" && i + 1 < args.length) {
      description = args[++i];
    }
  }

  if (!name) {
    console.error("Usage: pnpm create:skill --name <skill-name> [--description <desc>]");
    process.exit(1);
  }

  const packageName = name.startsWith("@altos/skill-") ? name : `@altos/skill-${name}`;
  const safeName = packageName.replace("@altos/skill-", "");
  const outDir = join(OUTPUT_DIR, `skill-${safeName}`);

  console.log(`Creating skill: ${packageName}`);

  const templateFiles = await readdir(TEMPLATE_DIR, { withFileTypes: true });
  for (const entry of templateFiles) {
    if (entry.name === "node_modules") continue;
    const src = join(TEMPLATE_DIR, entry.name);
    const dest = join(outDir, entry.name);
    await mkdir(dest, { recursive: true });

    if (entry.isDirectory()) {
      const subFiles = await readdir(src, { withFileTypes: true });
      for (const sub of subFiles) {
        let content = await Bun.file(join(src, sub.name)).text();
        content = content
          .replace(/\{\{name\}\}/g, safeName)
          .replace(/\{\{description\}\}/g, description || "An Altos skill");
        await writeFile(join(dest, sub.name), content);
      }
    } else {
      let content = await Bun.file(src).text();
      content = content
        .replace(/\{\{name\}\}/g, safeName)
        .replace(/\{\{description\}\}/g, description || "An Altos skill");
      await writeFile(dest, content);
    }
  }

  const pkgPath = join(outDir, "package.json");
  const pkgContent = await Bun.file(pkgPath).text();
  const pkg = JSON.parse(pkgContent);
  pkg.name = packageName;
  pkg.description = description || "An Altos skill";
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2));

  console.log(`Skill created at: ${outDir}`);
  console.log("Next steps:");
  console.log(`  cd ${outDir}`);
  console.log("  pnpm install");
  console.log("  pnpm build");
}

main().catch(console.error);
