#!/usr/bin/env node
// @altos/cloud-worker bin entry

import { runWorker } from "../dist/index.js";

runWorker({}).catch((err) => {
  console.error("Worker fatal error:", err);
  process.exit(1);
});
