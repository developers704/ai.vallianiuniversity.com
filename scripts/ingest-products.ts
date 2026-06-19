/**
 * CLI script to ingest products from processed_products.json
 * Usage: npm run ingest:products
 */
import fs from "fs";
import path from "path";

const API_BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const ADMIN_KEY = process.env.ADMIN_API_KEY ?? "";

async function main() {
  const filePath = path.join(process.cwd(), "data", "processed_products.json");
  if (!fs.existsSync(filePath)) {
    console.error("Missing data/processed_products.json");
    process.exit(1);
  }

  console.log("Starting product ingestion via API...");
  const res = await fetch(`${API_BASE}/api/ingest/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": ADMIN_KEY,
    },
  });

  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));

  if (!res.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
