import type { ProductSearchResult } from "./types/product";
import type { ChatIntent } from "./intent";
import {
  isConversationalAcknowledgment,
  isFarewell,
  isGreeting,
  isPoliteDecline,
} from "./intent";

const PRODUCT_LIST_INTENTS: ChatIntent[] = [
  "PRODUCT_SEARCH",
  "PRODUCT_RECOMMENDATION",
];

/** One-line product summary for LLM context (minimal tokens). */
export function formatCompactProductContext(products: ProductSearchResult[]): string {
  return products
    .map(
      (p, i) =>
        `${i + 1}. ${p.title} | ${p.currency} ${p.price} | ${p.available ? "In stock" : "Unavailable"} | SKU ${p.sku ?? "N/A"} | ${p.url}`
    )
    .join("\n");
}

export function isProductListIntent(intent: ChatIntent): boolean {
  return PRODUCT_LIST_INTENTS.includes(intent);
}

/** Short answer when product cards carry the details — skips a full LLM completion. */
export function buildProductListAnswer(
  products: ProductSearchResult[],
  message: string,
  isRefinement = false
): string {
  const count = products.length;
  const lower = message.toLowerCase();

  let category = "options";
  if (/father'?s?\s*day|\bdad\b/i.test(lower)) category = "Father's Day gift ideas";
  else if (/mother'?s?\s*day|\bmom\b/i.test(lower)) category = "Mother's Day gift ideas";
  else if (/men'?s|for men|\bdad\b/i.test(lower)) category = "men's jewelry";
  else if (/bridal|engagement/i.test(lower)) category = "bridal rings";
  else if (/ring/i.test(lower)) category = "rings";
  else if (/earring/i.test(lower)) category = "earrings";
  else if (/necklace|pendant|chain/i.test(lower)) category = "necklaces & pendants";
  else if (/watch/i.test(lower)) category = "watches";
  else if (/bracelet|bangle/i.test(lower)) category = "bracelets";

  if (isRefinement) {
    return `Here ${count === 1 ? "is" : "are"} ${count} ${category} that match what you asked for — updated with your latest preference. See the product cards below for photos, prices, and links.`;
  }

  return `Here ${count === 1 ? "is" : "are"} ${count} ${category} from Valliani Jewelers. See the product cards below for photos, prices, and links. Tell me your budget, metal, or stone preference if you'd like me to narrow this down.`;
}

/** When strict search finds zero in-stock matches for what the customer asked. */
export function buildNoProductsAnswer(message: string, searchMessage?: string): string {
  const lower = (searchMessage ?? message).toLowerCase();
  let label = "items matching your request";

  if (/\bgold\b/i.test(lower) && /\bring/i.test(lower)) label = "gold rings currently in stock";
  else if (/\bplatinum\b/i.test(lower) && /\bring/i.test(lower)) label = "platinum rings currently in stock";
  else if (/\bdiamond/i.test(lower) && /\bring/i.test(lower)) label = "diamond rings currently in stock";
  else if (/\bring/i.test(lower)) label = "rings matching your request in stock";
  else if (/\bearring/i.test(lower)) label = "earrings matching your request in stock";
  else if (/\bwatch/i.test(lower)) label = "watches matching your request in stock";
  else if (/\bnecklace|pendant/i.test(lower)) label = "necklaces or pendants matching your request in stock";

  return `I couldn't find any ${label} right now. Try a different budget, metal, or style — or tell me more about what you're looking for and I'll search again.`;
}

/** Trim policy text sent to the LLM when the full doc is long. */
export function truncateForContext(text: string, maxChars = 1200): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n...[truncated for length]";
}

/** Trim conversation history to reduce input tokens. */
export function trimConversationHistory(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  maxTurns = 4,
  maxCharsPerMessage = 200
): Array<{ role: "user" | "assistant"; content: string }> {
  return history.slice(-maxTurns).map((m) => ({
    role: m.role,
    content:
      m.content.length > maxCharsPerMessage
        ? m.content.slice(0, maxCharsPerMessage) + "…"
        : m.content,
  }));
}

/** Hints for short conversational replies so the model does not repeat itself. */
export function buildConversationalContext(
  history: Array<{ role: "user" | "assistant"; content: string }>
): string {
  const lastAssistant = [...history].reverse().find((m) => m.role === "assistant");
  const lastSubstantiveUser = [...history]
    .reverse()
    .find((m) => m.role === "user" && m.content.trim().length > 12);

  const parts = [
    "Continue naturally in 1-2 sentences. Do not repeat your last reply.",
  ];

  if (lastSubstantiveUser) {
    parts.push(`Customer was recently asking about: "${lastSubstantiveUser.content.slice(0, 140)}".`);
  }
  if (lastAssistant) {
    parts.push(`Avoid reusing this phrasing: "${lastAssistant.content.slice(0, 140)}".`);
  }

  return parts.join(" ");
}

/** True when the assistant just asked the customer a question worth continuing via LLM. */
export function assistantAskedQuestion(
  history: Array<{ role: "user" | "assistant"; content: string }>
): boolean {
  const lastAssistant = [...history].reverse().find((m) => m.role === "assistant");
  if (!lastAssistant) return false;

  const text = lastAssistant.content.trim();

  // Generic welcome/greeting — "ok" or "sure" should get a simple menu prompt, not open-ended LLM
  if (
    /\bwelcome to valliani\b/i.test(text) ||
    /\bhow can i help\b/i.test(text) ||
    /\bwhat can i help you with today\b/i.test(text)
  ) {
    return false;
  }

  return (
    /\?\s*$/.test(text) ||
    /\b(would you|do you want|shall i|can i help|let me know|which|what kind|any preference)\b/i.test(
      text
    )
  );
}

/** True when the customer has asked a real question (not just hi/ok/thanks). */
export function hasSubstantiveUserTopic(
  history: Array<{ role: "user" | "assistant"; content: string }>
): boolean {
  return history.some(
    (m) =>
      m.role === "user" &&
      !isGreeting(m.content) &&
      !isConversationalAcknowledgment(m.content) &&
      !isPoliteDecline(m.content) &&
      !isFarewell(m.content) &&
      m.content.trim().length > 3
  );
}

/** True when the most recent assistant turn showed product cards. */
export function lastAssistantShowedProducts(
  history: Array<{ role: string; content: string; metadata?: unknown }>
): boolean {
  const lastAssistant = [...history].reverse().find((m) => m.role === "assistant");
  if (!lastAssistant) return false;

  const metadata = lastAssistant.metadata as { products?: unknown[] } | null | undefined;
  if (Array.isArray(metadata?.products) && metadata.products.length > 0) {
    return true;
  }

  return /\bproduct cards?\b/i.test(lastAssistant.content);
}

/** Reply when the customer reacts positively after seeing product recommendations. */
export function buildProductFollowUpAnswer(message: string): string {
  const lower = message.trim().toLowerCase().replace(/^['"`]+|['"`]+$/g, "");

  if (/^(thanks?|thank\s*you|thx)/.test(lower)) {
    return "You're welcome! Click any product card to view details on our site, or tell me if you'd like to see more options.";
  }

  return "Wonderful! Click any of the product cards above to view details and purchase on our site. I can also help narrow things down by budget, metal, or style — just let me know.";
}

/** Reliable reply when the chat just started and the user only said hi/ok/sure. */
export function buildEarlyConversationAnswer(message: string): string {
  const lower = message.trim().toLowerCase();
  if (/^(thanks?|thank\s*you|thx)/.test(lower)) {
    return "You're welcome! What can I help you find today — rings, earrings, necklaces, watches, or an order question?";
  }
  return "Great! What can I help you with today — finding jewelry, checking availability, order tracking, or store policies?";
}

export function shouldUseProductListTemplate(
  intent: ChatIntent,
  productCount: number
): boolean {
  return isProductListIntent(intent) && productCount > 0;
}
