/**
 * Check Shopify Admin token and scopes.
 * Usage: npm run verify:shopify
 */
import { loadEnvFile } from "./load-env";

loadEnvFile();

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN ?? "vallianijewelers.myshopify.com";
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ?? "";
const API_VERSION = process.env.SHOPIFY_API_VERSION ?? "2025-04";
const ADMIN_URL = `https://${STORE_DOMAIN}/admin/api/${API_VERSION}/graphql.json`;

async function adminQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  if (!ADMIN_TOKEN) {
    throw new Error("SHOPIFY_ADMIN_ACCESS_TOKEN is missing in .env");
  }

  const res = await fetch(ADMIN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": ADMIN_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string; extensions?: { code?: string } }>;
  };

  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }

  return json.data as T;
}

async function main() {
  console.log("Store:", STORE_DOMAIN);
  console.log("Token set:", ADMIN_TOKEN ? `yes (${ADMIN_TOKEN.slice(0, 8)}...)` : "NO");

  try {
    const shop = await adminQuery<{ shop: { name: string } }>(`{
      shop { name }
    }`);
    console.log("Shop connection: OK —", shop.shop.name);
  } catch (err) {
    console.error("Shop connection: FAILED —", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  try {
    const products = await adminQuery<{
      products: { edges: Array<{ node: { title: string } }> };
    }>(`{
      products(first: 1) {
        edges { node { title } }
      }
    }`);
    const sample = products.products.edges[0]?.node.title ?? "(no products)";
    console.log("read_products scope: OK — sample product:", sample);
  } catch (err) {
    console.error("read_products scope: MISSING —", err instanceof Error ? err.message : err);
    console.error("\nFix:");
    console.error("1. Dev Dashboard → Versions → add scope: read_products,read_orders");
    console.error("2. Click Release");
    console.error("3. Get a NEW token (PowerShell client_credentials command)");
    console.error("4. Confirm response includes scope: read_products,read_orders");
    console.error("5. Update SHOPIFY_ADMIN_ACCESS_TOKEN in .env");
    process.exit(1);
  }

  console.log("\nToken is ready. Run: npm run sync:products");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
