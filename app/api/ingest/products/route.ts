import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma, upsertProductEmbedding } from "@/lib/db";
import { createEmbeddings } from "@/lib/openai";
import {
  buildSearchableText,
  type ProcessedProduct,
} from "@/lib/types/product";
import { verifyAdminKey, corsHeaders } from "@/lib/cors";

export const runtime = "nodejs";
export const maxDuration = 300;

const BATCH_SIZE = 20;

export async function POST(request: Request) {
  if (!verifyAdminKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const filePath = path.join(process.cwd(), "data", "processed_products.json");
  if (!fs.existsSync(filePath)) {
    return NextResponse.json(
      { error: "processed_products.json not found in /data" },
      { status: 404 }
    );
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  let products: ProcessedProduct[];
  try {
    products = JSON.parse(raw) as ProcessedProduct[];
  } catch {
    return NextResponse.json({ error: "Invalid JSON in processed_products.json" }, { status: 400 });
  }

  let ingested = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    const validProducts: ProcessedProduct[] = [];

    for (const product of batch) {
      if (!product.id || !product.title || !product.handle) {
        skipped++;
        errors.push(`Skipped malformed product: ${product.id ?? "unknown"}`);
        continue;
      }
      validProducts.push(product);
    }

    if (validProducts.length === 0) continue;

    const texts = validProducts.map(buildSearchableText);
    let embeddings: number[][] = [];

    try {
      embeddings = await createEmbeddings(texts);
    } catch (err) {
      errors.push(`Embedding batch failed at index ${i}: ${err instanceof Error ? err.message : "unknown"}`);
      continue;
    }

    for (let j = 0; j < validProducts.length; j++) {
      const product = validProducts[j];
      const content = texts[j];

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
            content,
            metadata: {
              vendor: product.vendor,
              specs: product.specs,
              variants: product.variants,
              skus: product.skus,
            },
          },
          update: {
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
            content,
            metadata: {
              vendor: product.vendor,
              specs: product.specs,
              variants: product.variants,
              skus: product.skus,
            },
          },
        });

        if (embeddings[j]) {
          await upsertProductEmbedding(product.id, embeddings[j]);
        }
        ingested++;
      } catch (err) {
        skipped++;
        errors.push(`Failed product ${product.id}: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }
  }

  return NextResponse.json({
    success: true,
    total: products.length,
    ingested,
    skipped,
    errors: errors.slice(0, 50),
  });
}

export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}
