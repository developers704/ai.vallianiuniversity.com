import { searchKnowledgeByVector } from "./db";
import { createEmbedding } from "./openai";
import { searchProductsHybrid, findProductBySkuAsync } from "./product-search";
import type { ChatIntent } from "./intent";
import type { ProductSearchResult } from "./types/product";
import { prisma } from "./db";
import { getRelevantPolicyContext, isPolicyRelatedMessage } from "./policies";
import { formatCompactProductContext, truncateForContext } from "./token-optimize";

export interface RetrievalContext {
  productContext: string;
  policyContext: string;
  orderContext: string;
  products: ProductSearchResult[];
}

const POLICY_INTENTS: ChatIntent[] = [
  "SHIPPING_POLICY",
  "RETURNS_POLICY",
  "REFUND_POLICY",
  "WARRANTY",
  "STORE_INFO",
  "GENERAL_FAQ",
];

const POLICY_TYPE_MAP: Partial<Record<ChatIntent, string>> = {
  SHIPPING_POLICY: "SHIPPING",
  RETURNS_POLICY: "RETURNS",
  REFUND_POLICY: "REFUNDS",
  WARRANTY: "WARRANTY",
  STORE_INFO: "STORE_INFO",
  GENERAL_FAQ: "FAQ",
};

export async function retrieveContext(params: {
  message: string;
  intent: ChatIntent;
  extractedSku?: string;
  orderContext?: string;
}): Promise<RetrievalContext> {
  const { message, intent, extractedSku, orderContext } = params;
  let products: ProductSearchResult[] = [];
  let policyContext = "";
  let productContext = "";

  const productIntents: ChatIntent[] = [
    "PRODUCT_SEARCH",
    "PRODUCT_RECOMMENDATION",
    "PRODUCT_DETAILS",
  ];

  if (productIntents.includes(intent)) {
    if (extractedSku || intent === "PRODUCT_DETAILS") {
      const sku = extractedSku ?? message.match(/\b([A-Z]\d{5,}[A-Z]?)\b/i)?.[1];
      if (sku) {
        const found = await findProductBySkuAsync(sku);
        if (found) products = [found];
      }
    }
    if (products.length === 0) {
      products = await searchProductsHybrid(message, {}, 5);
    }
    productContext =
      intent === "PRODUCT_DETAILS"
        ? products
            .map(
              (p) =>
                `Product: ${p.title}\nURL: ${p.url}\nPrice: ${p.currency} ${p.price}\nAvailable: ${p.available}\nSKU: ${p.sku ?? "N/A"}\nCategory: ${p.category ?? "N/A"}\nTags: ${p.tags?.slice(0, 5).join(", ") ?? ""}\nDetails: ${p.content?.slice(0, 280) ?? ""}`
            )
            .join("\n\n---\n\n")
        : formatCompactProductContext(products);
  }

  if (POLICY_INTENTS.includes(intent) || isPolicyRelatedMessage(message, intent)) {
    policyContext = await retrievePolicyContext(message, intent);
  }

  return {
    productContext: productContext,
    policyContext: policyContext,
    orderContext: orderContext ?? "",
    products,
  };
}

async function retrievePolicyContext(
  message: string,
  intent: ChatIntent
): Promise<string> {
  const typeFilter = POLICY_TYPE_MAP[intent];

  // 1. Message-ranked policies from data/policies.json — most reliable for known topics
  const fileContext = getRelevantPolicyContext(message, intent);

  // 2. Vector search supplements with knowledge-base docs
  let vectorContext = "";
  try {
    const embedding = await createEmbedding(message);
    const vectorResults = await searchKnowledgeByVector(embedding, 2);
    if (vectorResults.length > 0) {
      vectorContext = vectorResults
        .map((d) => `[${d.type}] ${d.title}\n${d.content}`)
        .join("\n\n---\n\n");
    }
  } catch {
    // fall through
  }

  if (fileContext && vectorContext) {
    return `${fileContext}\n\n---\n\n${vectorContext}`;
  }
  if (fileContext) return fileContext;
  if (vectorContext) return vectorContext;

  // 3. Published knowledge documents from DB
  try {
    const docs = await prisma.knowledgeDocument.findMany({
      where: {
        status: "PUBLISHED",
        ...(typeFilter ? { type: typeFilter as never } : {}),
      },
      take: 5,
      orderBy: { updatedAt: "desc" },
    });

    if (docs.length > 0) {
      return docs.map((d) => `[${d.type}] ${d.title}\n${d.content}`).join("\n\n---\n\n");
    }
  } catch {
    // DB not available
  }

  return "";
}

export function buildContextBlock(ctx: RetrievalContext): string {
  const sections: string[] = [];
  if (ctx.productContext?.trim()) sections.push(`## Products\n${ctx.productContext}`);
  if (ctx.policyContext?.trim()) {
    sections.push(`## Policies & FAQs\n${truncateForContext(ctx.policyContext, 2500)}`);
  }
  if (ctx.orderContext?.trim()) sections.push(`## Order Information\n${ctx.orderContext}`);
  return sections.join("\n\n") || "No retrieved context available.";
}
