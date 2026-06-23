#!/usr/bin/env node
// @altos/local-api bin entry

import { runServer } from "../dist/index.js";

runServer({ port: 3001 }).catch((err) => {
  console.error("Server fatal error:", err);
  process.exit(1);
});
