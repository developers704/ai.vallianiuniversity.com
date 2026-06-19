/**
 * Ingest only data/shopify_new_products.json into DB + embeddings.
 * Usage: npx tsx scripts/ingest-shopify-new.ts
 */
import fs from "fs";
import path from "path";
import { prisma, upsertProductEmbedding } from "../lib/db";
import { createEmbeddings } from "../lib/openai";
import { buildSearchableText, type ProcessedProduct } from "../lib/types/product";
import { loadEnvFile } from "./load-env";

loadEnvFile();

const BATCH_SIZE = 20;

async function main() {
  const filePath = path.join(process.cwd(), "data", "shopify_new_products.json");
  if (!fs.existsSync(filePath)) {
    console.error("Missing data/shopify_new_products.json — run fetch + merge first.");
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set in .env");
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set in .env");
    process.exit(1);
  }

  const products = JSON.parse(fs.readFileSync(filePath, "utf-8")) as ProcessedProduct[];
  let ingested = 0;
  let skipped = 0;

  console.log(`Ingesting ${products.length} new Shopify products...`);

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE).filter((p) => p.id && p.title);
    if (batch.length === 0) continue;

    const texts = batch.map(buildSearchableText);
    const embeddings = await createEmbeddings(texts);

    for (let j = 0; j < batch.length; j++) {
      const product = batch[j];
      const url = `https://www.vallianijewelers.com/products/${encodeURIComponent(product.handle)}`;
      try {
        await prisma.productDocument.upsert({
          where: { shopifyProductId: product.id },
          create: {
            shopifyProductId: product.id,
            title: product.title,
            handle: product.handle,
            url,
            category: product.category ?? null,
            tags: product.tags ?? [],
            price: product.price ?? 0,
            currency: product.currency ?? "USD",
            available: product.available ?? false,
            sku: product.sku ?? null,
            image: product.image ?? null,
            content: texts[j],
            metadata: {
              vendor: product.vendor,
              specs: product.specs,
              variants: product.variants,
            },
          },
          update: {
            title: product.title,
            handle: product.handle,
            url,
            category: product.category ?? null,
            tags: product.tags ?? [],
            price: product.price ?? 0,
            available: product.available ?? false,
            sku: product.sku ?? null,
            image: product.image ?? null,
            content: texts[j],
            metadata: {
              vendor: product.vendor,
              specs: product.specs,
              variants: product.variants,
            },
          },
        });
        await upsertProductEmbedding(product.id, embeddings[j]);
        ingested++;
        console.log(`  ✓ ${product.sku} — ${product.title.slice(0, 50)}...`);
      } catch (err) {
        skipped++;
        console.error(
          `  ✗ ${product.sku}:`,
          err instanceof Error ? err.message : err
        );
      }
    }
  }

  console.log(`\nDone. Ingested: ${ingested}, Skipped: ${skipped}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
