/**
 * Pull all products from Shopify Admin API and write data/processed_products.json
 * Usage: npm run sync:products
 *
 * Requires SHOPIFY_ADMIN_ACCESS_TOKEN and SHOPIFY_STORE_DOMAIN in .env
 */
import fs from "fs";
import path from "path";
import type { ProcessedProduct } from "../lib/types/product";
import { loadEnvFile } from "./load-env";

loadEnvFile();

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN ?? "vallianijewelers.myshopify.com";
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ?? "";
const API_VERSION = process.env.SHOPIFY_API_VERSION ?? "2025-04";
const ADMIN_URL = `https://${STORE_DOMAIN}/admin/api/${API_VERSION}/graphql.json`;

const PRODUCTS_QUERY = `
  query SyncProducts($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          handle
          description
          status
          tags
          vendor
          featuredImage {
            url
          }
          images(first: 5) {
            edges {
              node {
                url
              }
            }
          }
          variants(first: 20) {
            edges {
              node {
                title
                sku
                price
                availableForSale
                selectedOptions {
                  name
                  value
                }
              }
            }
          }
        }
      }
    }
  }
`;

interface AdminResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

async function adminQuery<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  if (!ADMIN_TOKEN) {
    throw new Error("SHOPIFY_ADMIN_ACCESS_TOKEN is not set in .env");
  }

  const res = await fetch(ADMIN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": ADMIN_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Shopify Admin API error: ${res.status}`);
  }

  const json = (await res.json()) as AdminResponse<T>;
  if (json.errors?.length) {
    const message = json.errors.map((e) => e.message).join(", ");
    if (/access denied|products field/i.test(message)) {
      throw new Error(
        `${message}\n\nYour Admin token has no read_products permission.\n` +
          "Dev Dashboard → Versions → Scopes: read_products,read_orders → Release → get NEW token.\n" +
          "Run: npm run verify:shopify"
      );
    }
    throw new Error(message);
  }
  if (!json.data) {
    throw new Error("No data returned from Shopify Admin API");
  }
  return json.data;
}

function mapProduct(node: Record<string, unknown>): ProcessedProduct | null {
  if (node.status !== "ACTIVE") return null;

  const variants = (
    (node.variants as { edges: Array<{ node: Record<string, unknown> }> })?.edges ?? []
  ).map((e) => {
    const options = (e.node.selectedOptions as Array<{ name: string; value: string }>) ?? [];
    return {
      title: e.node.title as string,
      sku: (e.node.sku as string) ?? "",
      option1: options[0]?.value,
      price: parseFloat(e.node.price as string),
      available: e.node.availableForSale as boolean,
    };
  });

  const skus = variants.map((v) => v.sku).filter(Boolean);
  const prices = variants.map((v) => v.price).filter((p) => !Number.isNaN(p));
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : minPrice;
  const handle = node.handle as string;
  const tags = (node.tags as string[]) ?? [];
  const images = (
    (node.images as { edges: Array<{ node: { url: string } }> })?.edges ?? []
  ).map((e) => e.node.url);
  const featured = (node.featuredImage as { url: string } | null)?.url ?? images[0] ?? "";

  return {
    id: String(node.id).split("/").pop() ?? (node.id as string),
    title: node.title as string,
    handle,
    url: `https://www.vallianijewelers.com/products/${encodeURIComponent(handle)}`,
    vendor: (node.vendor as string) ?? "Valliani Jewelers",
    category: tags[0] ?? "Jewelry",
    tags,
    price: minPrice,
    price_max: maxPrice,
    currency: "USD",
    available: variants.some((v) => v.available),
    sku: skus[0] ?? "",
    skus,
    image: featured,
    images,
    description: ((node.description as string) ?? "").slice(0, 2000),
    variants,
  };
}

async function fetchAllProducts(): Promise<ProcessedProduct[]> {
  const products: ProcessedProduct[] = [];
  let cursor: string | null = null;
  let page = 0;

  type ProductsPage = {
    products: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      edges: Array<{ node: Record<string, unknown> }>;
    };
  };

  while (true) {
    page++;
    const data: ProductsPage = await adminQuery<ProductsPage>(PRODUCTS_QUERY, { cursor });

    for (const edge of data.products.edges) {
      const mapped = mapProduct(edge.node);
      if (mapped) products.push(mapped);
    }

    console.log(`Page ${page}: ${products.length} active products so far...`);

    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }

  return products;
}

async function main() {
  console.log("Fetching products from Shopify...");
  const products = await fetchAllProducts();

  const outPath = path.join(process.cwd(), "data", "processed_products.json");
  fs.writeFileSync(outPath, JSON.stringify(products, null, 2), "utf-8");

  console.log(`Saved ${products.length} products to ${outPath}`);
  console.log("\nNext steps:");
  console.log("1. Upload data/processed_products.json to your server");
  console.log("2. Run product ingest (admin panel or POST /api/ingest/products)");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
