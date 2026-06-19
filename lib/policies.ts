import fs from "fs";
import path from "path";
import type { ChatIntent } from "./intent";
import { isGreeting } from "./intent";
import embeddedPoliciesFile from "../data/policies.json";

export interface PolicyDocument {
  id: string;
  title: string;
  types: string[];
  lastRevised?: string;
  content: string;
}

interface PoliciesFile {
  policies: PolicyDocument[];
}

let cachedPolicies: PolicyDocument[] | null = null;

export function loadPoliciesFromFile(): PolicyDocument[] {
  if (cachedPolicies) return cachedPolicies;

  const filePath = path.join(process.cwd(), "data", "policies.json");
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const data = JSON.parse(raw) as PoliciesFile;
      cachedPolicies = data.policies ?? [];
      return cachedPolicies;
    } catch {
      console.warn("[policies] Failed to read data/policies.json, using embedded copy");
    }
  } else {
    console.warn("[policies] data/policies.json not found on disk, using embedded copy");
  }

  cachedPolicies = (embeddedPoliciesFile as PoliciesFile).policies ?? [];
  return cachedPolicies;
}

const INTENT_TYPE_MAP: Partial<Record<ChatIntent, string[]>> = {
  SHIPPING_POLICY: ["SHIPPING"],
  RETURNS_POLICY: ["RETURNS"],
  REFUND_POLICY: ["REFUNDS", "RETURNS"],
  STORE_INFO: ["STORE_INFO"],
  GENERAL_FAQ: ["FAQ", "SHIPPING", "RETURNS", "REFUNDS", "STORE_INFO", "FINANCING"],
};

export function getPoliciesByIntent(intent: ChatIntent): PolicyDocument[] {
  const policies = loadPoliciesFromFile();
  const types = INTENT_TYPE_MAP[intent];
  if (!types?.length) return [];

  return policies.filter((p) => p.types.some((t) => types.includes(t)));
}

const FINANCING_MESSAGE_PATTERN =
  /\b(financ(e|ing)?|acima|affirm|authorize\.?net|pay\s*over\s*time|buy\s*now\s*pay\s*later|bnpl|monthly\s*payment|payment\s*plan)\b/i;

const STORE_LOCATION_MESSAGE_PATTERN =
  /\b(where\s*are\s*(you|your|from|located|based)|where\s*are\s*from|where\s*(is|are)\s*(your|the)?\s*(store|stores|location|locations|shop|office|headquarters|hq)|stores?|locations?|address|near\s*me|mall|find\s*a\s*store|store\s*locator)\b/i;

function tokenizeMessage(message: string): string[] {
  return message
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

export function searchPoliciesByMessage(message: string): PolicyDocument[] {
  const policies = loadPoliciesFromFile();
  const lower = message.toLowerCase();
  const words = tokenizeMessage(message);

  const scored = policies.map((policy) => {
    const text = `${policy.title} ${policy.content}`.toLowerCase();
    let score = 0;

    for (const word of words) {
      if (text.includes(word)) score += 2;
    }

    if (/\bship(ping)?\b/i.test(lower) && policy.types.includes("SHIPPING")) score += 10;
    if (/\breturn|exchange\b/i.test(lower) && policy.types.includes("RETURNS")) score += 10;
    if (/\brefund\b/i.test(lower) && policy.types.includes("REFUNDS")) score += 10;
    if (STORE_LOCATION_MESSAGE_PATTERN.test(lower) && policy.types.includes("STORE_INFO")) {
      score += 20;
    }
    if (FINANCING_MESSAGE_PATTERN.test(lower) && policy.types.includes("FINANCING")) {
      score += 15;
    }

    const cities = [
      "roseville", "san jose", "salinas", "hayward", "daly city", "visalia",
      "fresno", "santa clara", "bakersfield", "livermore", "sacramento",
      "culver city", "arcadia", "victorville", "ontario", "national city",
      "stockton", "reno", "fairfield", "santa rosa", "chandler", "longview",
      "northridge", "palmdale", "milpitas", "friendswood", "humble", "milipitas",
    ];
    for (const city of cities) {
      if (lower.includes(city) && text.includes(city)) score += 15;
    }

    return { policy, score };
  });

  return scored
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ policy }) => policy);
}

export function formatPoliciesForContext(policies: PolicyDocument[]): string {
  if (policies.length === 0) return "";

  return policies
    .map((p) => {
      const revised = p.lastRevised ? ` (Last Revised: ${p.lastRevised})` : "";
      return `[${p.types.join(", ")}] ${p.title}${revised}\n${p.content}`;
    })
    .join("\n\n---\n\n");
}

export function getHardcodedPolicyContext(
  message: string,
  intent: ChatIntent
): string {
  return getRelevantPolicyContext(message, intent);
}

const POLICY_KEYWORD_PATTERN =
  /\b(policy|policies|shipping|delivery|return|refund|exchange|store|location|address|warranty|financ|acima|affirm|authorize|payment\s*plan|pay\s*over\s*time|where|mall|hours|deliver|ship|freight)\b/i;

/** Whether the message likely needs policy/FAQ context for RAG. */
export function isPolicyRelatedMessage(message: string, intent?: ChatIntent): boolean {
  const policyIntents: ChatIntent[] = [
    "SHIPPING_POLICY",
    "RETURNS_POLICY",
    "REFUND_POLICY",
    "WARRANTY",
    "STORE_INFO",
    "GENERAL_FAQ",
  ];
  if (intent && policyIntents.includes(intent)) return true;
  if (resolvePolicyIntentFromMessage(message)) return true;
  return POLICY_KEYWORD_PATTERN.test(message);
}

/** Focused policy context for RAG — top-ranked docs only, not the full policy dump. */
export function getRelevantPolicyContext(message: string, intent: ChatIntent): string {
  const resolved = resolvePolicyIntentFromMessage(message);
  const effectiveIntent = resolved ?? intent;
  const isStoreQuestion =
    effectiveIntent === "STORE_INFO" || STORE_LOCATION_MESSAGE_PATTERN.test(message);

  if (isStoreQuestion) {
    const policies = getPoliciesByIntent("STORE_INFO");
    if (policies.length === 0) return "";

    const storePolicy = policies[0];
    const words = tokenizeMessage(message);
    const blocks = storePolicy.content.split("\n\n").filter((b) => b.trim());
    const matching = blocks.filter((block) => {
      const blockLower = block.toLowerCase();
      return words.some((word) => word.length > 3 && blockLower.includes(word));
    });

    if (matching.length > 0 && matching.length < blocks.length) {
      return formatPoliciesForContext([{ ...storePolicy, content: matching.join("\n\n") }]);
    }

    return formatPoliciesForContext([storePolicy]);
  }

  const ranked = searchPoliciesByMessage(message);
  if (ranked.length > 0) {
    return formatPoliciesForContext(ranked.slice(0, 2));
  }

  if (effectiveIntent !== "GENERAL_FAQ" && effectiveIntent !== "UNKNOWN") {
    const byIntent = getPoliciesByIntent(effectiveIntent);
    if (byIntent.length > 0) {
      return formatPoliciesForContext(byIntent.slice(0, 2));
    }
  }

  return "";
}

export function resolvePolicyIntentFromMessage(message: string): ChatIntent | null {
  if (isGreeting(message)) return null;

  const lower = message.toLowerCase();
  if (/\b(refund|money\s*back|chargeback)\b/i.test(lower)) return "REFUND_POLICY";
  if (/\b(return|exchange)\b/i.test(lower) && /\b(policy|policies|can i|how)\b/i.test(lower)) {
    return "RETURNS_POLICY";
  }
  if (/\b(ship(ping)?|delivery|deliver|freight)\b/i.test(lower)) return "SHIPPING_POLICY";
  if (STORE_LOCATION_MESSAGE_PATTERN.test(lower)) {
    return "STORE_INFO";
  }
  if (FINANCING_MESSAGE_PATTERN.test(lower)) {
    return "GENERAL_FAQ";
  }
  if (/\b(warranty|guarantee|repair)\b/i.test(lower)) return "WARRANTY";
  return null;
}

const POLICY_SUMMARIES: Record<string, string> = {
  shipping: [
    "Shipping policy:",
    "",
    "Standard Shipping: Delivery Time: 5–7 business days.",
    "Expedited Shipping: Delivery Time: 2–3 business days.",
    "Free shipping across the United States.",
  ].join("\n"),
  "returns-refunds": [
    "Refund and exchange policy:",
    "",
    "You may return it within 30 days of receipt for a refund or exchange.",
    "If you are not satisfied with your purchase, you may exchange it within a week of purchase.",
    "Exchanges can be made by shipping the item back to us or visiting any of our local stores. Initial shipping is free; however, shipping charges may apply for exchanges.",
  ].join("\n"),
  financing: [
    "Yes — Valliani Jewelers offers financing at checkout through trusted partners:",
    "",
    "• Acima — lease-to-own with flexible payment plans",
    "• Affirm — buy now, pay later with transparent monthly payments",
    "• Authorize.net — secure payment processing for online orders",
    "",
    "Select a financing option at checkout to see if you qualify. For help, call 1-844-OVANI-104 or email orders@vallianijewelers.com.",
  ].join("\n"),
  "store-locations": [
    "Valliani Jewelers has 30+ store locations across California, Nevada, Arizona, and Texas.",
    "",
    "Ask me about a specific city or mall — for example: \"store in Fresno\" or \"location near San Jose\" — and I'll share that address and phone number.",
    "",
    "General contact: orders@vallianijewelers.com | 1-844-OVANI-104",
    "Full store list: vallianijewelers.com",
  ].join("\n"),
};

function wantsFullPolicyDetails(message: string): boolean {
  return /\b(full|complete|entire|all details|more details|tell me everything|whole policy|every detail)\b/i.test(
    message
  );
}

const INTENT_POLICY_TYPE: Partial<Record<ChatIntent, string>> = {
  SHIPPING_POLICY: "SHIPPING",
  RETURNS_POLICY: "RETURNS",
  REFUND_POLICY: "REFUNDS",
  STORE_INFO: "STORE_INFO",
  WARRANTY: "WARRANTY",
};

function selectPolicyForAnswer(
  policies: PolicyDocument[],
  message: string,
  resolvedIntent: ChatIntent
): PolicyDocument {
  if (policies.length === 0) {
    throw new Error("selectPolicyForAnswer requires at least one policy");
  }
  if (policies.length === 1) return policies[0];

  const ranked = searchPoliciesByMessage(message).filter((candidate) =>
    policies.some((policy) => policy.id === candidate.id)
  );
  if (ranked.length > 0) return ranked[0];

  const intentType = INTENT_POLICY_TYPE[resolvedIntent];
  if (intentType) {
    const match = policies.find((policy) => policy.types.includes(intentType));
    if (match) return match;
  }

  if (FINANCING_MESSAGE_PATTERN.test(message)) {
    const match = policies.find((policy) => policy.types.includes("FINANCING"));
    if (match) return match;
  }

  return policies[0];
}

function summarizePolicy(policy: PolicyDocument, message: string): string {
  if (wantsFullPolicyDetails(message)) {
    const revised = policy.lastRevised ? ` (Last Revised: ${policy.lastRevised})` : "";
    return `${policy.title}${revised}:\n\n${policy.content}`;
  }

  const summary = POLICY_SUMMARIES[policy.id];
  if (summary) return summary;

  const excerpt = policy.content.slice(0, 600).trim();
  return `${policy.title}:\n\n${excerpt}${policy.content.length > 600 ? "..." : ""}`;
}

const DIRECT_POLICY_INTENTS: ChatIntent[] = [
  "SHIPPING_POLICY",
  "RETURNS_POLICY",
  "REFUND_POLICY",
  "STORE_INFO",
];

/** Build a direct policy answer without LLM — reliable and zero extra tokens. */
export function buildPolicyDirectAnswer(
  message: string,
  intent: ChatIntent
): string | null {
  if (isGreeting(message)) return null;

  const productIntents: ChatIntent[] = [
    "PRODUCT_SEARCH",
    "PRODUCT_RECOMMENDATION",
    "PRODUCT_DETAILS",
  ];
  const policyKeywords =
    POLICY_KEYWORD_PATTERN;

  if (productIntents.includes(intent) && !policyKeywords.test(message)) {
    return null;
  }

  const resolvedFromMessage = resolvePolicyIntentFromMessage(message);
  const policyIntent =
    resolvedFromMessage ??
    (DIRECT_POLICY_INTENTS.includes(intent) ? intent : null);

  if (!policyIntent && !policyKeywords.test(message)) {
    return null;
  }

  const resolvedIntent = policyIntent ?? resolvedFromMessage ?? intent;
  const isStoreQuestion =
    resolvedIntent === "STORE_INFO" || STORE_LOCATION_MESSAGE_PATTERN.test(message);

  let policies: PolicyDocument[] = [];
  if (isStoreQuestion) {
    policies = getPoliciesByIntent("STORE_INFO");
  } else if (policyIntent && policyIntent !== "GENERAL_FAQ") {
    policies = getPoliciesByIntent(policyIntent);
  } else {
    const byMessage = searchPoliciesByMessage(message);
    policies =
      byMessage.length > 0
        ? byMessage
        : policyIntent
          ? getPoliciesByIntent(policyIntent)
          : [];
  }

  if (policies.length === 0) return null;

  if (isStoreQuestion) {
    return formatStorePolicyAnswer(policies, message);
  }

  const policy = selectPolicyForAnswer(policies, message, resolvedIntent);
  return summarizePolicy(policy, message);
}

function formatStorePolicyAnswer(
  policies: PolicyDocument[],
  message: string
): string {
  const storePolicy =
    policies.find((p) => p.types.includes("STORE_INFO")) ??
    getPoliciesByIntent("STORE_INFO")[0] ??
    policies[0];
  const lower = message.toLowerCase();

  const blocks = storePolicy.content.split("\n\n").filter((b) => b.trim());
  const matching = blocks.filter((block) => {
    const blockLower = block.toLowerCase();
    return lower.split(/\s+/).some((word) => word.length > 3 && blockLower.includes(word));
  });

  if (matching.length > 0 && matching.length < blocks.length) {
    return [
      "Here are the Valliani Jewelers location(s) that match your question:",
      "",
      matching.join("\n\n"),
      "",
      "General contact: orders@vallianijewelers.com | 1-844-OVANI-104",
    ].join("\n");
  }

  if (wantsFullPolicyDetails(message)) {
    return `${storePolicy.title}:\n\n${storePolicy.content}`;
  }

  return summarizePolicy(storePolicy, message);
}

export function hasHardcodedPolicyForIntent(
  message: string,
  intent: ChatIntent
): boolean {
  return buildPolicyDirectAnswer(message, intent) !== null;
}
