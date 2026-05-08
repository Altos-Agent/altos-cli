import "dotenv/config";
import { closeDb, db } from "./client.js";
import { resetDemoData } from "./demo-data.js";

try {
  await resetDemoData(db);
  console.log("Removed local demo data.");
} finally {
  await closeDb();
}
