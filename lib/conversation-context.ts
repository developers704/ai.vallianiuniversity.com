import {
  isCasualSmallTalk,
  isConversationalAcknowledgment,
  isFarewell,
  isGreeting,
  isPoliteDecline,
  normalizeSocialMessage,
} from "./intent";

const PRODUCT_TOPIC_PATTERN =
  /\b(rings?|earrings?|necklaces?|pendants?|bracelets?|watches?|chains?|bangles?|diamonds?|jewelry|jewellery|bridal|engagement|recommend|show\s*me|looking\s*for|gift|lab[- ]?grown)\b/i;

const REFINEMENT_PATTERN =
  /\b(under|over|below|above|less\s+than|more\s+than|max|budget|around|between)\s*\$?\s*[\d,]+/i;

const NEW_SEARCH_PATTERN =
  /\b(show\s*me|find|search|recommend|looking\s*for|any|do\s*you\s*have)\b/i;

export interface HistoryMessage {
  role: string;
  content: string;
  metadata?: unknown;
}

function isProductTopicMessage(content: string): boolean {
  const normalized = normalizeSocialMessage(content);
  if (
    isGreeting(normalized) ||
    isConversationalAcknowledgment(normalized) ||
    isPoliteDecline(normalized) ||
    isFarewell(normalized) ||
    isCasualSmallTalk(normalized)
  ) {
    return false;
  }
  return PRODUCT_TOPIC_PATTERN.test(normalized);
}

/** Short follow-up that only adjusts budget, metal, etc. */
export function isProductSearchRefinement(message: string): boolean {
  const normalized = normalizeSocialMessage(message);
  if (normalized.length > 80) return false;
  if (NEW_SEARCH_PATTERN.test(normalized)) return false;

  const hasRefinement =
    REFINEMENT_PATTERN.test(normalized) ||
    /\b(cheaper|expensive|gold|platinum|silver|lab[- ]?grown|in\s+stock|available)\b/i.test(
      normalized
    );

  if (!hasRefinement) return false;

  // Full new product request — not just a refinement
  if (PRODUCT_TOPIC_PATTERN.test(normalized) && !REFINEMENT_PATTERN.test(normalized)) {
    return false;
  }

  return true;
}

export function lastAssistantShowedProductsFromHistory(history: HistoryMessage[]): boolean {
  const lastAssistant = [...history].reverse().find((m) => m.role === "assistant");
  if (!lastAssistant) return false;

  const metadata = lastAssistant.metadata as { products?: unknown[] } | null | undefined;
  if (Array.isArray(metadata?.products) && metadata.products.length > 0) return true;

  return /\bproduct cards?\b/i.test(lastAssistant.content);
}

/** Most recent user message that was a product search or browse request. */
export function getLastProductSearchQuery(history: HistoryMessage[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role !== "user") continue;
    if (isProductTopicMessage(msg.content)) {
      return normalizeSocialMessage(msg.content);
    }
  }
  return null;
}

/** Merge a refinement ("under 500") with the prior product request ("diamond rings"). */
export function buildContextualProductQuery(
  message: string,
  history: HistoryMessage[]
): string {
  const prior = getLastProductSearchQuery(history.slice(0, -1));
  if (!prior) return message;

  const canRefine =
    isProductSearchRefinement(message) || lastAssistantShowedProductsFromHistory(history);

  if (!canRefine) return message;
  if (prior.toLowerCase() === normalizeSocialMessage(message).toLowerCase()) return message;

  return `${prior} ${normalizeSocialMessage(message)}`;
}
