import fs from "fs";
import path from "path";
import { prisma, upsertProductEmbedding } from "../lib/db";
import { createEmbeddings } from "../lib/openai";
import { buildSearchableText, type ProcessedProduct } from "../lib/types/product";

const BATCH_SIZE = 20;

async function main() {
  const filePath = path.join(process.cwd(), "data", "processed_products.json");
  if (!fs.existsSync(filePath)) {
    console.error("Missing data/processed_products.json");
    process.exit(1);
  }

  const products = JSON.parse(fs.readFileSync(filePath, "utf-8")) as ProcessedProduct[];
  let ingested = 0;
  let skipped = 0;

  console.log(`Ingesting ${products.length} products...`);

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE).filter((p) => p.id && p.title);
    if (batch.length === 0) continue;

    const texts = batch.map(buildSearchableText);
    const embeddings = await createEmbeddings(texts);

    for (let j = 0; j < batch.length; j++) {
      const product = batch[j];
      try {
        await prisma.productDocument.upsert({
          where: { shopifyProductId: product.id },
          create: {
            shopifyProductId: product.id,
            title: product.title,
            handle: product.handle,
            url: product.url,
            category: product.category ?? null,
            tags: product.tags ?? [],
            price: product.price ?? 0,
            currency: product.currency ?? "USD",
            available: product.available ?? false,
            sku: product.sku ?? null,
            image: product.image ?? null,
            content: texts[j],
            metadata: { vendor: product.vendor, specs: product.specs, variants: product.variants },
          },
          update: {
            title: product.title,
            handle: product.handle,
            url: product.url,
            category: product.category ?? null,
            tags: product.tags ?? [],
            price: product.price ?? 0,
            available: product.available ?? false,
            sku: product.sku ?? null,
            image: product.image ?? null,
            content: texts[j],
            metadata: { vendor: product.vendor, specs: product.specs, variants: product.variants },
          },
        });
        await upsertProductEmbedding(product.id, embeddings[j]);
        ingested++;
      } catch {
        skipped++;
      }
    }
    console.log(`Progress: ${Math.min(i + BATCH_SIZE, products.length)}/${products.length}`);
  }

  console.log(`Done. Ingested: ${ingested}, Skipped: ${skipped}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
