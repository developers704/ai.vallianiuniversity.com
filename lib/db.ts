import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/** Execute raw vector similarity search against product documents. */
export async function searchProductsByVector(
  embedding: number[],
  limit = 10,
  availableOnly = true
): Promise<
  Array<{
    id: string;
    shopifyProductId: string;
    title: string;
    handle: string;
    url: string;
    category: string | null;
    tags: string[];
    price: number;
    currency: string;
    available: boolean;
    sku: string | null;
    image: string | null;
    content: string;
    metadata: unknown;
    similarity: number;
  }>
> {
  const vectorStr = `[${embedding.join(",")}]`;
  const availableFilter = availableOnly ? "AND available = true" : "";

  const results = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      shopifyProductId: string;
      title: string;
      handle: string;
      url: string;
      category: string | null;
      tags: string[];
      price: number;
      currency: string;
      available: boolean;
      sku: string | null;
      image: string | null;
      content: string;
      metadata: unknown;
      similarity: number;
    }>
  >(
    `SELECT id, "shopifyProductId", title, handle, url, category, tags, price, currency,
            available, sku, image, content, metadata,
            1 - (embedding <=> $1::vector) AS similarity
     FROM "ProductDocument"
     WHERE embedding IS NOT NULL ${availableFilter}
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    vectorStr,
    limit
  );

  return results;
}

/** Execute raw vector similarity search against knowledge documents. */
export async function searchKnowledgeByVector(
  embedding: number[],
  limit = 5
): Promise<
  Array<{
    id: string;
    title: string;
    type: string;
    content: string;
    similarity: number;
  }>
> {
  const vectorStr = `[${embedding.join(",")}]`;

  const results = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      title: string;
      type: string;
      content: string;
      similarity: number;
    }>
  >(
    `SELECT id, title, type, content,
            1 - (embedding <=> $1::vector) AS similarity
     FROM "KnowledgeDocument"
     WHERE embedding IS NOT NULL AND status = 'PUBLISHED'
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    vectorStr,
    limit
  );

  return results;
}

/** Upsert product embedding via raw SQL (Prisma doesn't support vector type writes). */
export async function upsertProductEmbedding(
  shopifyProductId: string,
  embedding: number[]
): Promise<void> {
  const vectorStr = `[${embedding.join(",")}]`;
  await prisma.$executeRawUnsafe(
    `UPDATE "ProductDocument" SET embedding = $1::vector, "updatedAt" = NOW()
     WHERE "shopifyProductId" = $2`,
    vectorStr,
    shopifyProductId
  );
}

/** Upsert knowledge document embedding. */
export async function upsertKnowledgeEmbedding(
  id: string,
  embedding: number[]
): Promise<void> {
  const vectorStr = `[${embedding.join(",")}]`;
  await prisma.$executeRawUnsafe(
    `UPDATE "KnowledgeDocument" SET embedding = $1::vector, "updatedAt" = NOW()
     WHERE id = $2`,
    vectorStr,
    id
  );
}
