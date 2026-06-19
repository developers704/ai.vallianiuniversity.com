/**
 * Fetch new products from the public Shopify JSON API and write data/shopify_new_products.json
 * Usage: npx tsx scripts/fetch-shopify-new-products.ts
 */
import fs from "fs";
import path from "path";
import type { ProcessedProduct } from "../lib/types/product";

const STORE_BASE = "https://www.vallianijewelers.com";
const OUT_PATH = path.join(process.cwd(), "data", "shopify_new_products.json");

const HANDLES = [
  "the-covey-2",
  "the-whitetail-2",
  "the-pointer-2",
  "the-barrel-script-4",
  "valliani-jewelers-201562",
  "oroventi-open-heart-ring-b212831",
  "oroventi-square-tube-hoop-earrings-b219960",
  "oroventi-fluted-hoop-earrings-b212838",
  "oroventi-twisted-hoop-earrings-b212837",
  "oroventi-ribbed-hoop-earrings-b212836",
  "oroventi-horseshoe-paperclip-necklace-b236069-20",
  "oroventi-pave-miami-cuban-chain-necklace-b234919-24",
  "oroventi-ridged-hoop-earrings-b225399",
  "oroventi-two-tone-bead-hoop-earrings-b219964",
  "oroventi-religious-crucifix-cross-pendant-b212712",
  "oroventi-paperclip-link-bracelet-b217772-7-5",
  "oroventi-cz-evil-eye-bracelet-with-heart-charms-b210664-7",
  "oroventi-pave-cz-heart-charm-bracelet-b205346-8",
  "oroventi-mariner-link-bracelet-b227680-7-5",
  "oroventi-paperclip-infinity-bracelet-b227520-7",
  "oroventi-paperclip-link-bracelet-b227479-7-5",
  "oroventi-paperclip-cz-bracelet-b225391-7",
  "oroventi-black-enamel-crucifix-cross-pendant-b220738",
  "oroventi-jesus-crucifix-cross-pendant-b234945",
  "oroventi-miami-cuban-bracelet-b234923-9",
  "oroventi-figaro-link-bracelet-b234922-8",
  "ultimate-value®-cz-virgin-mary-gold-pendant",
  "oroventi-butterfly-link-station-necklace-b213188y",
  "oroventi-oval-link-station-necklace-b212830-18",
  "oroventi-swirled-studs-b213192y",
  "oroventi-paperclip-chain-b217530-16",
  "oroventi-paperclip-chain-b217527-16",
  "oroventi-sculptural-teardrop-hoops-b213195y",
  "oroventi-multi-row-hoops-b236060",
  "oroventi-twisted-hoops-b234932",
  "oroventi-two-toned-detailed-hoops-b225401",
  "oroventi-twisted-open-cuff-bangle-b225398",
];

interface ShopifyVariant {
  title: string;
  sku: string | null;
  price: string;
  option1?: string | null;
  available?: boolean;
}

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string;
  vendor: string;
  product_type: string;
  tags: string | string[];
  variants: ShopifyVariant[];
  images: Array<{ src: string }>;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTags(tags: string | string[]): string[] {
  if (Array.isArray(tags)) return tags.filter(Boolean);
  return tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function mapProduct(raw: ShopifyProduct): ProcessedProduct {
  const variants = (raw.variants ?? []).map((v) => ({
    title: v.title,
    sku: v.sku ?? "",
    option1: v.option1 ?? undefined,
    price: parseFloat(v.price),
    available: v.available ?? true,
  }));

  const skus = variants.map((v) => v.sku).filter(Boolean);
  const prices = variants.map((v) => v.price).filter((p) => !Number.isNaN(p));
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : minPrice;
  const images = (raw.images ?? []).map((img) => img.src).filter(Boolean);
  const tags = parseTags(raw.tags ?? "");
  const handle = raw.handle;

  return {
    id: String(raw.id),
    title: raw.title,
    handle,
    url: `${STORE_BASE}/products/${encodeURIComponent(handle)}`,
    vendor: raw.vendor || "Valliani Jewelers",
    category: raw.product_type || tags[0] || "Jewelry",
    tags,
    price: minPrice,
    price_max: maxPrice,
    currency: "USD",
    available: variants.length === 0 || variants.some((v) => v.available),
    sku: skus[0] ?? "",
    skus: skus.length ? skus : undefined,
    image: images[0] ?? "",
    images: images.length ? images : undefined,
    description: stripHtml(raw.body_html ?? ""),
    variants: variants.length ? variants : undefined,
  };
}

async function fetchProduct(handle: string): Promise<ProcessedProduct | null> {
  const url = `${STORE_BASE}/products/${encodeURIComponent(handle)}.json`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`  SKIP ${handle}: HTTP ${res.status}`);
    return null;
  }

  const json = (await res.json()) as { product?: ShopifyProduct };
  if (!json.product) {
    console.warn(`  SKIP ${handle}: no product in response`);
    return null;
  }

  return mapProduct(json.product);
}

async function main() {
  const products: ProcessedProduct[] = [];
  const failed: string[] = [];

  console.log(`Fetching ${HANDLES.length} products from ${STORE_BASE}...`);

  for (const handle of HANDLES) {
    process.stdout.write(`  ${handle}... `);
    try {
      const product = await fetchProduct(handle);
      if (product) {
        products.push(product);
        console.log("ok");
      } else {
        failed.push(handle);
        console.log("failed");
      }
    } catch (err) {
      failed.push(handle);
      console.log(`error: ${err instanceof Error ? err.message : err}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(products, null, 2), "utf-8");

  console.log(`\nFetched: ${products.length}/${HANDLES.length}`);
  if (failed.length) console.log(`Failed handles: ${failed.join(", ")}`);
  console.log(`Saved: ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
