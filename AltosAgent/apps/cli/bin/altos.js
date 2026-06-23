#!/usr/bin/env node
// @altos/cli bin entry

import { run } from "../dist/index.js";

const exitCode = await run(process.argv);
process.exit(exitCode);
