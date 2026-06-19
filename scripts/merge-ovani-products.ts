/**
 * Merge new Ovani products into data/processed_products.json
 * Usage: npx tsx scripts/merge-ovani-products.ts
 */
import fs from "fs";
import path from "path";
import type { ProcessedProduct } from "../lib/types/product";

const ROOT = process.cwd();
const MAIN_PATH = path.join(ROOT, "data", "processed_products.json");
const NEW_PATH = path.join(ROOT, "data", "ovani_new_products.json");

function fixProductUrl(product: ProcessedProduct): ProcessedProduct {
  return {
    ...product,
    url: `https://www.vallianijewelers.com/products/${encodeURIComponent(product.handle)}`,
  };
}

function main() {
  if (!fs.existsSync(NEW_PATH)) {
    console.error(`Missing ${NEW_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(MAIN_PATH)) {
    console.error(`Missing ${MAIN_PATH}`);
    process.exit(1);
  }

  const incoming = JSON.parse(fs.readFileSync(NEW_PATH, "utf-8")) as ProcessedProduct[];
  const existing = JSON.parse(fs.readFileSync(MAIN_PATH, "utf-8")) as ProcessedProduct[];

  const seen = new Set<string>();
  const normalized: ProcessedProduct[] = [];
  for (const raw of incoming) {
    if (!raw.id || seen.has(raw.id)) continue;
    seen.add(raw.id);
    normalized.push(fixProductUrl(raw));
  }

  const incomingIds = new Set(normalized.map((p) => p.id));
  const kept = existing.filter((p) => !incomingIds.has(p.id));
  const merged = [...normalized, ...kept];

  fs.writeFileSync(MAIN_PATH, JSON.stringify(merged, null, 2), "utf-8");

  console.log(`Incoming unique products: ${normalized.length}`);
  console.log(`Removed/replaced from catalog: ${existing.length - kept.length}`);
  console.log(`Previous count: ${existing.length}`);
  console.log(`New total: ${merged.length}`);
  console.log(`Saved: ${MAIN_PATH}`);
}

main();
