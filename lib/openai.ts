import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
export const OPENAI_EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

export async function createEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: OPENAI_EMBEDDING_MODEL,
    input: text.slice(0, 8000),
  });
  return response.data[0].embedding;
}

export async function createEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const response = await openai.embeddings.create({
    model: OPENAI_EMBEDDING_MODEL,
    input: texts.map((t) => t.slice(0, 8000)),
  });
  return response.data.map((d) => d.embedding);
}

export type Intent =
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

const INTENT_SCHEMA = {
  type: "object" as const,
  properties: {
    intent: {
      type: "string" as const,
      enum: [
        "PRODUCT_SEARCH",
        "PRODUCT_RECOMMENDATION",
        "PRODUCT_DETAILS",
        "ORDER_TRACKING",
        "SHIPPING_POLICY",
        "RETURNS_POLICY",
        "REFUND_POLICY",
        "WARRANTY",
        "STORE_INFO",
        "HUMAN_SUPPORT",
        "GENERAL_FAQ",
        "UNKNOWN",
      ],
    },
    confidence: { type: "number" as const },
  },
  required: ["intent", "confidence"],
  additionalProperties: false,
};

export async function classifyIntentWithLLM(
  message: string
): Promise<{ intent: Intent; confidence: number }> {
  const response = await openai.responses.create({
    model: OPENAI_MODEL,
    input: [
      {
        role: "system",
        content:
          "Classify the customer message intent for Valliani Jewelers chatbot. Return JSON only.",
      },
      { role: "user", content: message },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "intent_classification",
        schema: INTENT_SCHEMA,
        strict: true,
      },
    },
  });

  const text = response.output_text;
  const parsed = JSON.parse(text) as { intent: Intent; confidence: number };
  return parsed;
}

export interface ChatGenerationResult {
  answer: string;
  confidence: number;
  requiresHuman: boolean;
}

const CHAT_RESPONSE_SCHEMA = {
  type: "object" as const,
  properties: {
    answer: { type: "string" as const },
    confidence: { type: "number" as const },
    requiresHuman: { type: "boolean" as const },
  },
  required: ["answer", "confidence", "requiresHuman"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You are Valliani Jewelers' AI shopping assistant. Use ONLY the retrieved context. Never invent prices, stock, policies, or specs.
If context is missing, say you don't have confirmed information and offer to connect the customer with the team.
Be concise (2-4 sentences unless details are requested). Professional and friendly.
Do NOT list product names, prices, or URLs in your answer when product cards will be shown separately — give a brief intro only.
For order tracking, require verified order number + email/phone before sharing order details.
Escalate refund disputes and low-confidence answers (requiresHuman: true).`;

const SYSTEM_PROMPT_WITH_PRODUCTS = `You are Valliani Jewelers' AI assistant. Product cards are shown separately in the UI.
Reply in 1-2 short sentences only. Do NOT enumerate products, prices, or links in text.
Invite the customer to use the cards below or ask for budget/style to narrow results.`;

const CONVERSATIONAL_PROMPT = `You are Valliani Jewelers' friendly AI shopping assistant.
The customer sent a short conversational reply. Respond naturally in 1-2 warm sentences based on the conversation so far.
Reference what they were looking at when relevant (e.g. rings, earrings, policies).
Do NOT repeat the same invitation or phrasing you used in your previous reply — vary your wording.
Never offer to connect them with the team, never say you lack information, and never ask for contact details for simple replies like "ok", "sure", or "thanks".`;

export async function generateChatResponse(params: {
  message: string;
  context: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  productCardsShown?: boolean;
  conversational?: boolean;
}): Promise<ChatGenerationResult> {
  const history = params.conversationHistory ?? [];
  const systemPrompt = params.conversational
    ? CONVERSATIONAL_PROMPT
    : params.productCardsShown
      ? SYSTEM_PROMPT_WITH_PRODUCTS
      : SYSTEM_PROMPT;
  const input: OpenAI.Responses.ResponseInput = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    {
      role: "user",
      content: params.productCardsShown
        ? `Question: ${params.message}\nContext (reference only, do not repeat in answer):\n${params.context}`
        : `Question: ${params.message}\nContext:\n${params.context}`,
    },
  ];

  const response = await openai.responses.create({
    model: OPENAI_MODEL,
    input,
    text: {
      format: {
        type: "json_schema",
        name: "chat_response",
        schema: CHAT_RESPONSE_SCHEMA,
        strict: true,
      },
    },
  });

  return JSON.parse(response.output_text) as ChatGenerationResult;
}

/** Stream a simple text response (used by widget for loading UX fallback). */
export async function generateSimpleResponse(params: {
  message: string;
  context: string;
}): Promise<string> {
  const response = await openai.responses.create({
    model: OPENAI_MODEL,
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Customer question: ${params.message}\n\nRetrieved context:\n${params.context}`,
      },
    ],
  });
  return response.output_text;
}

export { openai };
