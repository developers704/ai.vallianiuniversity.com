import { NextResponse } from "next/server";
import { z } from "zod";
import {
  fetchOrderByNumber,
  verifyOrderIdentity,
  formatOrderContext,
  isShopifyAdminConfigured,
} from "@/lib/shopify-admin";
import { verifyAdminKey, corsHeaders } from "@/lib/cors";

export const runtime = "nodejs";

const orderRequestSchema = z.object({
  orderNumber: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

export async function POST(request: Request) {
  if (!verifyAdminKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isShopifyAdminConfigured()) {
    return NextResponse.json(
      { error: "Shopify Admin API is not configured" },
      { status: 503 }
    );
  }

  const body = await request.json();
  const parsed = orderRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { orderNumber, email, phone } = parsed.data;

  if (!email && !phone) {
    return NextResponse.json(
      { error: "Email or phone required for verification" },
      { status: 400 }
    );
  }

  try {
    const { order, email: orderEmail, phone: orderPhone } =
      await fetchOrderByNumber(orderNumber);

    if (!order) {
      return NextResponse.json({ verified: false, error: "Order not found" }, { status: 404 });
    }

    const verified = verifyOrderIdentity(
      { email: orderEmail, phone: orderPhone },
      { email, phone }
    );

    if (!verified) {
      return NextResponse.json({ verified: false, error: "Identity verification failed" });
    }

    return NextResponse.json({
      verified: true,
      order: {
        name: order.name,
        financialStatus: order.displayFinancialStatus,
        fulfillmentStatus: order.displayFulfillmentStatus,
        createdAt: order.createdAt,
        fulfillments: order.fulfillments,
        lineItems: order.lineItems,
      },
      summary: formatOrderContext(order),
    });
  } catch (err) {
    console.error("[shopify/order] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to fetch order" }, { status: 500 });
  }
}

export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}
