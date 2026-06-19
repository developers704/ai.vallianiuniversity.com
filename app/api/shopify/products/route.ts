import { NextResponse } from "next/server";
import {
  fetchProductByHandle,
  searchStorefrontProducts,
  storefrontProductToCard,
} from "@/lib/shopify-storefront";
import { verifyAdminKey, corsHeaders } from "@/lib/cors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!verifyAdminKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const handle = searchParams.get("handle");
  const query = searchParams.get("q");

  try {
    if (handle) {
      const product = await fetchProductByHandle(handle);
      if (!product) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
      }
      return NextResponse.json({ product: storefrontProductToCard(product), raw: product });
    }

    if (query) {
      const products = await searchStorefrontProducts(query, 10);
      return NextResponse.json({
        products: products.map(storefrontProductToCard),
      });
    }

    return NextResponse.json(
      { error: "Provide ?handle= or ?q= query parameter" },
      { status: 400 }
    );
  } catch (err) {
    console.error("[shopify/products] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Shopify API error" },
      { status: 500 }
    );
  }
}

export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}
