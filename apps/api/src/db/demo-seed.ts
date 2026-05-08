import "dotenv/config";
import { closeDb, db } from "./client.js";
import { seedDemoData } from "./demo-data.js";

try {
  await seedDemoData(db);
  console.log(
    "Seeded local demo data. Demo wallets do not contain private keys.",
  );
} finally {
  await closeDb();
}
