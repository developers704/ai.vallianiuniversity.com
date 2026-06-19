import fs from "fs";
import path from "path";
import { prisma, searchProductsByVector } from "./db";
import { createEmbedding } from "./openai";
import {
  isStorefrontConfigured,
  searchStorefrontProducts,
  storefrontProductToSearchResult,
} from "./shopify-storefront";
import {
  parseSearchFilters,
  enrichProductSearchQuery,
  scoreProductMatch,
  type ProcessedProduct,
  type ProductSearchResult,
  type SearchFilters,
} from "./types/product";

let cachedProducts: ProcessedProduct[] | null = null;

function mergeProductResults(
  primary: ProductSearchResult[],
  extra: ProductSearchResult[],
  limit: number
): ProductSearchResult[] {
  const seen = new Set<string>();
  const merged: ProductSearchResult[] = [];

  for (const product of [...primary, ...extra]) {
    const key = product.shopifyProductId || product.handle || product.title;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(product);
    if (merged.length >= limit) break;
  }

  return merged;
}

async function searchProductsShopifyLive(
  query: string,
  limit: number
): Promise<ProductSearchResult[]> {
  if (!isStorefrontConfigured()) return [];

  try {
    const products = await searchStorefrontProducts(query, limit);
    return products.map(storefrontProductToSearchResult);
  } catch (err) {
    console.warn("[product-search] Shopify live search failed:", err);
    return [];
  }
}

export function loadProductsFromJson(): ProcessedProduct[] {
  if (cachedProducts) return cachedProducts;

  const filePath = path.join(process.cwd(), "data", "processed_products.json");
  if (!fs.existsSync(filePath)) {
    console.warn("[product-search] processed_products.json not found");
    return [];
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  cachedProducts = JSON.parse(raw) as ProcessedProduct[];
  return cachedProducts;
}

export function searchProductsLocal(
  query: string,
  filters: SearchFilters = {},
  limit = 5
): ProductSearchResult[] {
  const products = loadProductsFromJson();
  const mergedFilters = { ...parseSearchFilters(query), ...filters };

  const scored = products
    .map((p) => ({
      product: p,
      score: scoreProductMatch(p, query, mergedFilters),
    }))
    .filter(({ product, score }) => {
      if (mergedFilters.availableOnly && !product.available) return false;
      if (mergedFilters.maxPrice !== undefined && product.price > mergedFilters.maxPrice)
        return false;
      if (mergedFilters.minPrice !== undefined && product.price < mergedFilters.minPrice)
        return false;
      if (
        mergedFilters.sku &&
        !product.sku?.toUpperCase().includes(mergedFilters.sku.toUpperCase()) &&
        !product.skus?.some((s) => s.toUpperCase() === mergedFilters.sku!.toUpperCase())
      ) {
        return false;
      }
      return score > 0 || query.length < 3;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ product }) => ({
    shopifyProductId: product.id,
    title: product.title,
    handle: product.handle,
    url: product.url,
    category: product.category,
    tags: product.tags,
    price: product.price,
    currency: product.currency,
    available: product.available,
    sku: product.sku,
    image: product.image,
    content: product.description,
    metadata: { specs: product.specs, variants: product.variants },
  }));
}

export function findProductBySku(sku: string): ProductSearchResult | null {
  const normalized = sku.toUpperCase();
  const products = loadProductsFromJson();
  const found = products.find(
    (p) =>
      p.sku?.toUpperCase() === normalized ||
      p.skus?.some((s) => s.toUpperCase() === normalized)
  );
  if (found) {
    return {
      shopifyProductId: found.id,
      title: found.title,
      handle: found.handle,
      url: found.url,
      category: found.category,
      tags: found.tags,
      price: found.price,
      currency: found.currency,
      available: found.available,
      sku: found.sku,
      image: found.image,
      content: found.description,
      metadata: { specs: found.specs, variants: found.variants },
    };
  }
  return null;
}

export async function findProductBySkuAsync(
  sku: string
): Promise<ProductSearchResult | null> {
  const local = findProductBySku(sku);
  if (local) return local;

  if (!isStorefrontConfigured()) return null;

  try {
    const live = await searchStorefrontProducts(sku, 5);
    const match = live.find((p) =>
      p.variants.some((v) => v.sku?.toUpperCase() === sku.toUpperCase())
    );
    return match ? storefrontProductToSearchResult(match) : null;
  } catch {
    return null;
  }
}

export async function searchProductsHybrid(
  query: string,
  filters: SearchFilters = {},
  limit = 5
): Promise<ProductSearchResult[]> {
  const mergedFilters = { ...parseSearchFilters(query), ...filters };
  const searchQuery = enrichProductSearchQuery(query, mergedFilters);

  if (mergedFilters.sku) {
    const bySku = await findProductBySkuAsync(mergedFilters.sku);
    if (bySku) return [bySku];
  }

  const localResults = searchProductsLocal(query, mergedFilters, limit);
  if (localResults.length >= limit) {
    return localResults;
  }

  const shopifyLive = await searchProductsShopifyLive(searchQuery, limit);
  if (shopifyLive.length > 0) {
    const merged = mergeProductResults(localResults, shopifyLive, limit);
    if (merged.length > 0) return merged;
  }

  try {
    const embedding = await createEmbedding(searchQuery);
    const vectorResults = await searchProductsByVector(
      embedding,
      limit * 2,
      mergedFilters.availableOnly ?? true
    );

    if (vectorResults.length > 0) {
      const filtered = vectorResults
        .filter((p) => {
          if (mergedFilters.maxPrice !== undefined && p.price > mergedFilters.maxPrice)
            return false;
          if (mergedFilters.minPrice !== undefined && p.price < mergedFilters.minPrice)
            return false;
          if (
            mergedFilters.category &&
            !p.category?.toLowerCase().includes(mergedFilters.category.toLowerCase())
          ) {
            return false;
          }
          return true;
        })
        .map((p) => ({
          product: p,
          score: scoreProductMatch(p, query, mergedFilters),
        }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ product }) => product);

      if (filtered.length > 0) return filtered;
    }
  } catch (err) {
    console.warn("[product-search] Vector search failed, falling back to local:", err);
  }

  try {
    const dbProducts = await prisma.productDocument.findMany({
      where: {
        ...(mergedFilters.availableOnly ? { available: true } : {}),
        ...(mergedFilters.maxPrice !== undefined
          ? { price: { lte: mergedFilters.maxPrice } }
          : {}),
        ...(mergedFilters.sku ? { sku: { equals: mergedFilters.sku, mode: "insensitive" } } : {}),
      },
      take: limit * 3,
    });

    if (dbProducts.length > 0) {
      const scored = dbProducts
        .map((p) => ({
          product: p,
          score: scoreProductMatch(
            {
              shopifyProductId: p.shopifyProductId,
              title: p.title,
              handle: p.handle,
              url: p.url,
              category: p.category,
              tags: p.tags,
              price: p.price,
              currency: p.currency,
              available: p.available,
              sku: p.sku,
              image: p.image,
              content: p.content,
            },
            query,
            mergedFilters
          ),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return scored.map(({ product: p }) => ({
        shopifyProductId: p.shopifyProductId,
        title: p.title,
        handle: p.handle,
        url: p.url,
        category: p.category,
        tags: p.tags,
        price: p.price,
        currency: p.currency,
        available: p.available,
        sku: p.sku,
        image: p.image,
        content: p.content,
        metadata: p.metadata,
      }));
    }
  } catch {
    // DB not available
  }

  return searchProductsLocal(query, mergedFilters, limit);
}
