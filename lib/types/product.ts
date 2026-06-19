export interface ProcessedProduct {
  id: string;
  title: string;
  handle: string;
  url: string;
  vendor: string;
  category: string;
  tags: string[];
  price: number;
  price_max?: number;
  currency: string;
  available: boolean;
  sku: string;
  skus?: string[];
  image: string;
  images?: string[];
  description: string;
  specs?: Record<string, string>;
  variants?: Array<{
    title: string;
    sku: string;
    option1?: string;
    price: number;
    available: boolean;
  }>;
}

export interface ProductCard {
  id: string;
  title: string;
  url: string;
  price: number;
  currency: string;
  available: boolean;
  image: string | null;
  sku: string | null;
  category?: string | null;
}

export function toProductCard(p: {
  shopifyProductId?: string;
  id?: string;
  title: string;
  url: string;
  price: number;
  currency: string;
  available: boolean;
  image?: string | null;
  sku?: string | null;
  category?: string | null;
}): ProductCard {
  return {
    id: p.shopifyProductId ?? p.id ?? "",
    title: p.title,
    url: p.url,
    price: p.price,
    currency: p.currency,
    available: p.available,
    image: p.image ?? null,
    sku: p.sku ?? null,
    category: p.category ?? null,
  };
}

export function buildSearchableText(product: ProcessedProduct): string {
  const parts = [
    product.title,
    product.category,
    product.vendor,
    product.tags.join(", "),
    `Price: ${product.currency} ${product.price}`,
    product.available ? "Available" : "Unavailable",
    `SKU: ${product.sku}`,
    product.skus?.length ? `SKUs: ${product.skus.join(", ")}` : "",
    product.url,
    product.description,
  ];

  if (product.specs) {
    parts.push(
      Object.entries(product.specs)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")
    );
  }

  if (product.variants?.length) {
    parts.push(
      product.variants
        .map(
          (v) =>
            `${v.title} SKU ${v.sku} ${product.currency} ${v.price} ${v.available ? "available" : "unavailable"}`
        )
        .join("; ")
    );
  }

  return parts.filter(Boolean).join("\n");
}

export interface SearchFilters {
  maxPrice?: number;
  minPrice?: number;
  category?: string;
  availableOnly?: boolean;
  vendor?: string;
  metal?: string;
  stoneType?: string;
  gender?: string;
  occasion?: "fathers_day" | "mothers_day" | "valentine" | "gift";
  keywords?: string[];
  sku?: string;
}

export function parseSearchFilters(message: string): SearchFilters {
  const filters: SearchFilters = { availableOnly: true };
  const lower = message.toLowerCase();

  const underMatch = lower.match(/under\s*\$?\s*([\d,]+(?:\.\d+)?)/);
  if (underMatch) {
    filters.maxPrice = parseFloat(underMatch[1].replace(/,/g, ""));
  }

  const overMatch = lower.match(/over\s*\$?\s*([\d,]+(?:\.\d+)?)/);
  if (overMatch) {
    filters.minPrice = parseFloat(overMatch[1].replace(/,/g, ""));
  }

  if (/\bunavailable|out of stock\b/i.test(message)) {
    filters.availableOnly = false;
  }

  const categories = [
    "rings",
    "earrings",
    "necklaces",
    "pendants",
    "bracelets",
    "watches",
    "chains",
    "bangles",
  ];
  for (const cat of categories) {
    if (lower.includes(cat)) {
      filters.category = cat.charAt(0).toUpperCase() + cat.slice(1);
      break;
    }
  }

  if (/men'?s|for men\b|\bdad\b|\bfather\b|\bgrandpa\b|\bgrandfather\b|\bhim\b/i.test(lower)) {
    filters.gender = "men";
  }
  if (/women'?s|for women|ladies|\bmom\b|\bmother\b|\bher\b/i.test(lower)) {
    filters.gender = "women";
  }

  if (/\bfather'?s?\s*day\b|\bgift\s*for\s+dad\b|\bfor\s+my\s+dad\b/i.test(lower)) {
    filters.gender = "men";
    filters.occasion = "fathers_day";
    filters.keywords = [...(filters.keywords ?? []), "gift", "men", "watch", "ring", "bracelet"];
  }
  if (/\bmother'?s?\s*day\b|\bgift\s*for\s+mom\b/i.test(lower)) {
    filters.gender = "women";
    filters.occasion = "mothers_day";
    filters.keywords = [...(filters.keywords ?? []), "gift"];
  }
  if (/\bvalentine\b|\banniversary\s+gift\b/i.test(lower)) {
    filters.occasion = "valentine";
    filters.keywords = [...(filters.keywords ?? []), "gift"];
  }
  if (/\bgift\b/i.test(lower) && !filters.occasion) {
    filters.occasion = "gift";
  }

  if (/lab[- ]?grown/i.test(lower)) filters.stoneType = "lab grown";
  if (/\bdiamond\b/i.test(lower)) filters.keywords = [...(filters.keywords ?? []), "diamond"];
  if (/\brado\b/i.test(lower)) filters.vendor = "Rado";
  if (/\bovani\b/i.test(lower)) filters.vendor = "Ovani";
  if (/\boroventi\b/i.test(lower)) filters.vendor = "Oroventi";
  if (/\bbenchmark\b/i.test(lower)) filters.vendor = "Benchmark";

  const metals = ["yellow gold", "white gold", "rose gold", "platinum", "silver"];
  for (const metal of metals) {
    if (lower.includes(metal)) {
      filters.metal = metal;
      break;
    }
  }

  const skuMatch = message.match(/\b([A-Z]\d{5,}[A-Z]?)\b/i);
  if (skuMatch) filters.sku = skuMatch[1].toUpperCase();

  return filters;
}

/** Expand vague gift/occasion queries so search and embeddings target the right catalog slice. */
export function enrichProductSearchQuery(message: string, filters: SearchFilters): string {
  const parts = [message];

  if (filters.occasion === "fathers_day" || filters.gender === "men") {
    parts.push("men's gift watch ring bracelet chain pendant");
  }
  if (filters.occasion === "mothers_day" || filters.gender === "women") {
    parts.push("women's gift necklace earrings ring bracelet");
  }
  if (filters.maxPrice !== undefined) {
    parts.push(`under ${filters.maxPrice}`);
  }
  if (filters.category) {
    parts.push(filters.category);
  }

  return parts.join(" ");
}

function isLikelyMensProduct(text: string, category?: string | null): boolean {
  const haystack = `${text} ${category ?? ""}`.toLowerCase();
  return (
    /\bmen'?s\b/.test(haystack) ||
    /\bfor men\b/.test(haystack) ||
    category?.toLowerCase().includes("men") === true
  );
}

function isLikelyWomensProduct(text: string, category?: string | null): boolean {
  const haystack = `${text} ${category ?? ""}`.toLowerCase();
  return (
    /\bwomen'?s\b/.test(haystack) ||
    /\bladies\b/.test(haystack) ||
    /\bbridal\b/.test(haystack) ||
    /\bengagement\b/.test(haystack) ||
    (/\bhoops?\b/.test(haystack) && !/\bmen'?s\b/.test(haystack))
  );
}

export function scoreProductMatch(
  product: ProcessedProduct | ProductSearchResult,
  query: string,
  filters: SearchFilters
): number {
  let score = 0;
  const lowerQuery = query.toLowerCase();
  const text = [
    product.title,
    product.category,
    "vendor" in product ? (product as ProcessedProduct).vendor : "",
    product.tags?.join(" ") ?? "",
    product.sku ?? "",
    ("content" in product ? product.content : "") ||
      ("description" in product ? (product as ProcessedProduct).description : "") ||
      "",
  ]
    .join(" ")
    .toLowerCase();

  const queryWords = lowerQuery.split(/\s+/).filter((w) => w.length > 2);
  for (const word of queryWords) {
    if (text.includes(word)) score += 2;
  }

  if (filters.category && product.category?.toLowerCase().includes(filters.category.toLowerCase())) {
    score += 5;
  }
  if (filters.maxPrice !== undefined && product.price <= filters.maxPrice) score += 3;
  if (filters.maxPrice !== undefined && product.price > filters.maxPrice) score -= 10;
  if (filters.minPrice !== undefined && product.price >= filters.minPrice) score += 2;
  if (filters.availableOnly && product.available) score += 2;
  if (filters.sku && product.sku?.toUpperCase() === filters.sku.toUpperCase()) score += 20;

  if (filters.stoneType && text.includes(filters.stoneType)) score += 4;
  if (filters.metal && text.includes(filters.metal)) score += 3;
  if (filters.vendor && text.includes(filters.vendor.toLowerCase())) score += 4;

  if (filters.gender === "men" || filters.occasion === "fathers_day") {
    if (isLikelyMensProduct(text, product.category)) score += 18;
    if (product.category?.toLowerCase() === "watches") score += 10;
    if (product.category?.toLowerCase().includes("men")) score += 15;
    if (isLikelyWomensProduct(text, product.category)) score -= 25;
    if (/\bgift\b/.test(text)) score += 4;
  }

  if (filters.gender === "women" || filters.occasion === "mothers_day") {
    if (isLikelyWomensProduct(text, product.category)) score += 12;
    if (isLikelyMensProduct(text, product.category)) score -= 20;
  }

  if (filters.gender === "men" && /\bmen'?s|for men\b/i.test(text)) score += 3;
  if (filters.gender === "women" && /\bwomen'?s|ladies\b/i.test(text)) score += 3;

  for (const keyword of filters.keywords ?? []) {
    if (text.includes(keyword.toLowerCase())) score += 3;
  }

  return score;
}

export interface ProductSearchResult {
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
  metadata?: unknown;
  similarity?: number;
}
