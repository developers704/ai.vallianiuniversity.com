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
  message: string
): string {
  const count = products.length;
  const lower = message.toLowerCase();

  let category = "options";
  if (/bridal|engagement/i.test(lower)) category = "bridal rings";
  else if (/ring/i.test(lower)) category = "rings";
  else if (/earring/i.test(lower)) category = "earrings";
  else if (/necklace|pendant|chain/i.test(lower)) category = "necklaces & pendants";
  else if (/watch/i.test(lower)) category = "watches";
  else if (/bracelet|bangle/i.test(lower)) category = "bracelets";

  return `Here ${count === 1 ? "is" : "are"} ${count} ${category} from Valliani Jewelers. See the product cards below for photos, prices, and links. Tell me your budget, metal, or stone preference if you'd like me to narrow this down.`;
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

/** True when the customer has not asked a real question yet (only hi/ok/thanks). */
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
