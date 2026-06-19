import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildPolicyDirectAnswer, loadPoliciesFromFile } from "@/lib/policies";

export const runtime = "nodejs";

export async function GET() {
  const policies = loadPoliciesFromFile();
  const shippingSample = buildPolicyDirectAnswer(
    "what is shipping policy?",
    "SHIPPING_POLICY"
  );

  const checks: Record<string, boolean | string | number> = {
    databaseUrl: Boolean(process.env.DATABASE_URL),
    openaiKey: Boolean(process.env.OPENAI_API_KEY),
    openaiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    policiesLoaded: policies.length,
    shippingPolicyReady: Boolean(shippingSample && shippingSample.length > 100),
    shopifyStorefrontConfigured: Boolean(process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN),
    shopifyAdminConfigured: Boolean(process.env.SHOPIFY_ADMIN_ACCESS_TOKEN),
    buildMarker: "policy-summaries-v2",
  };

  let dbOk = false;
  let dbError = "";

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (err) {
    dbError = err instanceof Error ? err.message : "Database connection failed";
  }

  const healthy = checks.databaseUrl && checks.openaiKey && dbOk;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "error",
      checks: {
        ...checks,
        databaseConnected: dbOk,
        databaseError: dbError || undefined,
      },
      hint: !checks.databaseUrl
        ? "Set DATABASE_URL in your hosting environment variables"
        : !checks.openaiKey
          ? "Set OPENAI_API_KEY in your hosting environment variables"
          : !dbOk
            ? "Database unreachable — use Supabase pooler URL (port 6543) for serverless hosting"
            : undefined,
    },
    { status: healthy ? 200 : 503 }
  );
}
