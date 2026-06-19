const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN ?? "vallianijewelers.myshopify.com";
const STOREFRONT_TOKEN = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN ?? "";
const API_VERSION = process.env.SHOPIFY_API_VERSION ?? "2025-04";

const STOREFRONT_URL = `https://${STORE_DOMAIN}/api/${API_VERSION}/graphql.json`;

interface StorefrontResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

async function storefrontQuery<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  if (!STOREFRONT_TOKEN) {
    throw new Error("SHOPIFY_STOREFRONT_ACCESS_TOKEN is not configured");
  }

  const res = await fetch(STOREFRONT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": STOREFRONT_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Shopify Storefront API error: ${res.status}`);
  }

  const json = (await res.json()) as StorefrontResponse<T>;
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join(", "));
  }
  if (!json.data) {
    throw new Error("No data returned from Shopify Storefront API");
  }
  return json.data;
}

export interface StorefrontProduct {
  id: string;
  title: string;
  handle: string;
  description: string;
  availableForSale: boolean;
  priceRange: {
    minVariantPrice: { amount: string; currencyCode: string };
    maxVariantPrice: { amount: string; currencyCode: string };
  };
  featuredImage?: { url: string } | null;
  tags: string[];
  vendor: string;
  variants: Array<{
    id: string;
    title: string;
    sku: string | null;
    availableForSale: boolean;
    price: { amount: string; currencyCode: string };
  }>;
}

const PRODUCT_BY_HANDLE_QUERY = `
  query ProductByHandle($handle: String!) {
    product(handle: $handle) {
      id
      title
      handle
      description
      availableForSale
      tags
      vendor
      priceRange {
        minVariantPrice { amount currencyCode }
        maxVariantPrice { amount currencyCode }
      }
      featuredImage { url }
      variants(first: 20) {
        edges {
          node {
            id
            title
            sku
            availableForSale
            price { amount currencyCode }
          }
        }
      }
    }
  }
`;

const SEARCH_PRODUCTS_QUERY = `
  query SearchProducts($query: String!, $first: Int!) {
    search(query: $query, first: $first, types: [PRODUCT]) {
      edges {
        node {
          ... on Product {
            id
            title
            handle
            description
            availableForSale
            tags
            vendor
            priceRange {
              minVariantPrice { amount currencyCode }
              maxVariantPrice { amount currencyCode }
            }
            featuredImage { url }
            variants(first: 5) {
              edges {
                node {
                  id
                  title
                  sku
                  availableForSale
                  price { amount currencyCode }
                }
              }
            }
          }
        }
      }
    }
  }
`;

function mapProduct(raw: Record<string, unknown>): StorefrontProduct {
  const variants = (
    (raw.variants as { edges: Array<{ node: Record<string, unknown> }> })?.edges ?? []
  ).map((e) => ({
    id: e.node.id as string,
    title: e.node.title as string,
    sku: (e.node.sku as string) ?? null,
    availableForSale: e.node.availableForSale as boolean,
    price: e.node.price as { amount: string; currencyCode: string },
  }));

  return {
    id: raw.id as string,
    title: raw.title as string,
    handle: raw.handle as string,
    description: raw.description as string,
    availableForSale: raw.availableForSale as boolean,
    tags: raw.tags as string[],
    vendor: raw.vendor as string,
    priceRange: raw.priceRange as StorefrontProduct["priceRange"],
    featuredImage: raw.featuredImage as StorefrontProduct["featuredImage"],
    variants,
  };
}

export async function fetchProductByHandle(
  handle: string
): Promise<StorefrontProduct | null> {
  const data = await storefrontQuery<{ product: Record<string, unknown> | null }>(
    PRODUCT_BY_HANDLE_QUERY,
    { handle }
  );
  return data.product ? mapProduct(data.product) : null;
}

export async function searchStorefrontProducts(
  query: string,
  first = 10
): Promise<StorefrontProduct[]> {
  const data = await storefrontQuery<{
    search: { edges: Array<{ node: Record<string, unknown> }> };
  }>(SEARCH_PRODUCTS_QUERY, { query, first });

  return data.search.edges
    .map((e) => e.node)
    .filter((n) => n.id)
    .map(mapProduct);
}

export function isStorefrontConfigured(): boolean {
  return Boolean(STOREFRONT_TOKEN);
}

export function storefrontProductToSearchResult(p: StorefrontProduct) {
  const minPrice = parseFloat(p.priceRange.minVariantPrice.amount);
  const primarySku =
    p.variants.find((v) => v.sku)?.sku ?? p.variants[0]?.sku ?? null;
  return {
    shopifyProductId: p.id,
    title: p.title,
    handle: p.handle,
    url: `https://www.vallianijewelers.com/products/${p.handle}`,
    category: p.tags[0] ?? null,
    tags: p.tags,
    price: minPrice,
    currency: p.priceRange.minVariantPrice.currencyCode,
    available: p.availableForSale,
    sku: primarySku,
    image: p.featuredImage?.url ?? null,
    content: p.description,
    metadata: { source: "shopify-live" },
  };
}

export function storefrontProductToCard(p: StorefrontProduct) {
  const minPrice = parseFloat(p.priceRange.minVariantPrice.amount);
  return {
    id: p.id,
    title: p.title,
    url: `https://www.vallianijewelers.com/products/${p.handle}`,
    price: minPrice,
    currency: p.priceRange.minVariantPrice.currencyCode,
    available: p.availableForSale,
    image: p.featuredImage?.url ?? null,
    sku: p.variants[0]?.sku ?? null,
    category: p.tags[0] ?? null,
  };
}
