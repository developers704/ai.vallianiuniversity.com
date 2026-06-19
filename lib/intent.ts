export type ChatIntent =
  | "PRODUCT_SEARCH"
  | "PRODUCT_RECOMMENDATION"
  | "PRODUCT_DETAILS"
  | "ORDER_TRACKING"
  | "SHIPPING_POLICY"
  | "RETURNS_POLICY"
  | "REFUND_POLICY"
  | "WARRANTY"
  | "STORE_INFO"
  | "HUMAN_SUPPORT"
  | "GENERAL_FAQ"
  | "UNKNOWN";

const HUMAN_PATTERNS =
  /\b(speak to|talk to|real person|human|agent|representative|customer service|live chat)\b/i;
const ORDER_PATTERNS =
  /\b(track(ing)?\s*(my\s*)?order|order\s*status|where\s*is\s*my\s*order|order\s*#?\s*\d+)\b/i;
const REFUND_PATTERNS =
  /\b(refund|money\s*back|chargeback|dispute|charged\s*twice)\b/i;
const RETURN_PATTERNS =
  /\b(return|exchange|send\s*back|return\s*policy)\b/i;
const SHIPPING_PATTERNS =
  /\b(shipping|delivery|ship|freight|when\s*will\s*it\s*arrive|shipping\s*policy)\b/i;
const POLICY_QUESTION_PATTERNS =
  /\b(what\s*(is|'s)\s*(your|the|a)?\s*(shipping|return|refund)\s*policy|shipping\s*policy|return\s*policy|refund\s*policy)\b/i;
const WARRANTY_PATTERNS = /\b(warranty|guarantee|repair)\b/i;
const STORE_PATTERNS =
  /\b(store\s*hours|location|address|contact|phone\s*number|email\s*us|near\s*me|find\s*a\s*store|store\s*locator|mall|where\s*are\s*(you|your|from|located|based)|where\s*are\s*from|where\s*(is|are)\s*(your|the)?\s*(store|stores|location|locations|shop))\b/i;
const FINANCING_PATTERNS =
  /\b(financ(e|ing)?|acima|affirm|authorize\.?net|pay\s*over\s*time|buy\s*now\s*pay\s*later|bnpl|monthly\s*payment|payment\s*plan)\b/i;
const RECOMMEND_PATTERNS =
  /\b(recommend|suggest|gift\s*idea|show\s*me|looking\s*for|under\s*\$?\d+)\b/i;
const SKU_PATTERNS = /\b(sku|item\s*#|product\s*code)\s*[:\s]?([A-Z0-9-]+)\b/i;
const DETAILS_PATTERNS =
  /\b(tell\s*me\s*about|details|specs|specifications|more\s*info)\b/i;

const GREETING_PATTERNS =
  /^(hi|hello|hey|hiya|howdy|greetings|yo|sup|good\s*(morning|afternoon|evening))[!?.,'"\s]*$/i;

const CONVERSATIONAL_PATTERNS =
  /^(ok|okay|k|yes|yeah|yep|yup|sure|alright|all\s*right|got\s*it|sounds\s*good|sounds\s*great|perfect|great|awesome|cool|nice|good|fine|understood|love\s*it|love\s*these|thanks?|thank\s*you|thx|no\s*problem|will\s*do|that\s*works|got\s*cha|exactly|beautiful|lovely)[!?.,'"\s]*$/i;

const FAREWELL_PATTERNS =
  /^(bye|goodbye|good\s*bye|see\s*you|see\s*ya|take\s*care|good\s*night|gn|later|catch\s*you\s*later|have\s*a\s*good\s*(day|one)|talk\s*soon|ttyl)[!?.,'"\s]*$/i;

const DECLINE_PATTERNS =
  /^(no\s*thanks?|no\s*thank\s*you|not\s*now|maybe\s*later|i'?m\s*good|that'?s\s*ok|that'?s\s*okay|that'?s\s*fine|no\s*need|don'?t\s*need|never\s*mind|nevermind|nah|i'?m\s*all\s*set)[!?.,'"\s]*$/i;

/** Strip stray quotes/punctuation so "perfect'" still matches as "perfect". */
export function normalizeSocialMessage(message: string): string {
  return message
    .trim()
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/[!?.,\s]+$/g, "")
    .trim();
}

export function isGreeting(message: string): boolean {
  return GREETING_PATTERNS.test(normalizeSocialMessage(message));
}

/** Short conversational replies that should continue naturally, not trigger escalation. */
export function isConversationalAcknowledgment(message: string): boolean {
  return CONVERSATIONAL_PATTERNS.test(normalizeSocialMessage(message));
}

export function isFarewell(message: string): boolean {
  return FAREWELL_PATTERNS.test(normalizeSocialMessage(message));
}

export function isPoliteDecline(message: string): boolean {
  return DECLINE_PATTERNS.test(normalizeSocialMessage(message));
}

const CASUAL_SMALLTALK_PATTERNS =
  /^(today\s+is\s+(hot|cold|nice|beautiful|rainy|warm|sunny)|it'?s\s+(hot|cold|nice|beautiful|rainy|warm|sunny)|nice\s+weather|beautiful\s+day|what\s+a\s+(day|beautiful\s+day)|lovely\s+weather|pretty\s+hot|so\s+hot|very\s+cold)[!?.,'"\s]*$/i;

/** Off-topic small talk that should get a friendly reply, not "no information". */
export function isCasualSmallTalk(message: string): boolean {
  const normalized = normalizeSocialMessage(message);
  if (normalized.length > 60 || normalized.split(/\s+/).length > 10) return false;
  if (isSocialMessage(message)) return false;
  if (/\?/.test(normalized)) return false;
  return CASUAL_SMALLTALK_PATTERNS.test(normalized);
}

export function buildCasualSmallTalkAnswer(message: string): string {
  const normalized = normalizeSocialMessage(message).toLowerCase();
  if (/\b(hot|warm|sunny)\b/.test(normalized)) {
    return "It is a warm one! Stay cool out there. Whenever you're ready, I can help you find jewelry, check an order, or answer store questions.";
  }
  if (/\b(cold|rainy)\b/.test(normalized)) {
    return "Sounds like quite a day! I'm here whenever you'd like help finding jewelry or checking on an order.";
  }
  return "I hear you! I'm here whenever you'd like help finding jewelry, checking availability, or learning about our policies.";
}

export function isSocialMessage(message: string): boolean {
  const msg = message.trim();
  return (
    isGreeting(msg) ||
    isConversationalAcknowledgment(msg) ||
    isFarewell(msg) ||
    isPoliteDecline(msg)
  );
}

export function classifyIntentRuleBased(message: string): {
  intent: ChatIntent;
  confidence: number;
  extractedSku?: string;
} {
  const msg = message.trim();

  if (isGreeting(msg)) {
    return { intent: "GENERAL_FAQ", confidence: 0.95 };
  }

  if (isFarewell(msg) || isPoliteDecline(msg) || isConversationalAcknowledgment(msg)) {
    return { intent: "GENERAL_FAQ", confidence: 0.95 };
  }

  if (HUMAN_PATTERNS.test(msg)) {
    return { intent: "HUMAN_SUPPORT", confidence: 0.95 };
  }
  if (REFUND_PATTERNS.test(msg)) {
    return { intent: "REFUND_POLICY", confidence: 0.9 };
  }
  if (ORDER_PATTERNS.test(msg)) {
    return { intent: "ORDER_TRACKING", confidence: 0.9 };
  }
  if (RETURN_PATTERNS.test(msg)) {
    return { intent: "RETURNS_POLICY", confidence: 0.85 };
  }
  if (POLICY_QUESTION_PATTERNS.test(msg)) {
    if (/refund/i.test(msg)) return { intent: "REFUND_POLICY", confidence: 0.92 };
    if (/return/i.test(msg)) return { intent: "RETURNS_POLICY", confidence: 0.92 };
    return { intent: "SHIPPING_POLICY", confidence: 0.92 };
  }
  if (SHIPPING_PATTERNS.test(msg)) {
    return { intent: "SHIPPING_POLICY", confidence: 0.85 };
  }
  if (WARRANTY_PATTERNS.test(msg)) {
    return { intent: "WARRANTY", confidence: 0.85 };
  }
  if (STORE_PATTERNS.test(msg)) {
    return { intent: "STORE_INFO", confidence: 0.85 };
  }
  if (FINANCING_PATTERNS.test(msg)) {
    return { intent: "GENERAL_FAQ", confidence: 0.9 };
  }

  const skuMatch = msg.match(/\b([A-Z]\d{5,}[A-Z]?)\b/i) ?? msg.match(SKU_PATTERNS);
  if (skuMatch) {
    return {
      intent: "PRODUCT_DETAILS",
      confidence: 0.9,
      extractedSku: skuMatch[1]?.toUpperCase(),
    };
  }

  if (RECOMMEND_PATTERNS.test(msg) || /\bfather'?s?\s*day\b|\bmother'?s?\s*day\b/i.test(msg)) {
    return { intent: "PRODUCT_RECOMMENDATION", confidence: 0.85 };
  }
  if (DETAILS_PATTERNS.test(msg)) {
    return { intent: "PRODUCT_DETAILS", confidence: 0.75 };
  }

  if (
    /\b(do\s*you\s*have|any|available|in\s*stock|lab[- ]?grown|diamond|ring|earring|necklace|watch|pendant|bracelet)\b/i.test(
      msg
    )
  ) {
    return { intent: "PRODUCT_SEARCH", confidence: 0.7 };
  }

  if (/\?/.test(msg) || /\b(what|how|can|is|are|where|when)\b/i.test(msg)) {
    return { intent: "GENERAL_FAQ", confidence: 0.5 };
  }

  return { intent: "UNKNOWN", confidence: 0.3 };
}

export async function classifyIntent(
  message: string,
  llmFallback: (msg: string) => Promise<{ intent: ChatIntent; confidence: number }>
): Promise<{ intent: ChatIntent; confidence: number; extractedSku?: string }> {
  const ruleResult = classifyIntentRuleBased(message);
  if (ruleResult.confidence >= 0.75) {
    return ruleResult;
  }
  const llmResult = await llmFallback(message);
  return { ...llmResult, extractedSku: ruleResult.extractedSku };
}
