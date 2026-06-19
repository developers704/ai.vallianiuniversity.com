import type { ChatIntent } from "./intent";
import { isSocialMessage } from "./intent";
import type { ChatGenerationResult } from "./openai";

const CONFIDENCE_THRESHOLD = 0.55;

const ESCALATION_INTENTS: ChatIntent[] = [
  "HUMAN_SUPPORT",
  "REFUND_POLICY",
];

export function shouldEscalate(params: {
  intent: ChatIntent;
  confidence: number;
  requiresHuman: boolean;
  message: string;
}): boolean {
  const { intent, confidence, requiresHuman, message } = params;

  if (isSocialMessage(message)) return false;
  if (requiresHuman) return true;
  if (ESCALATION_INTENTS.includes(intent)) return true;
  if (confidence < CONFIDENCE_THRESHOLD) return true;

  if (/\b(custom\s*jewelry|payment\s*issue|chargeback|exception)\b/i.test(message)) {
    return true;
  }

  return false;
}

export function sanitizeAnswer(answer: string): string {
  return answer
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

export function enforceGroundedResponse(
  result: ChatGenerationResult,
  hasContext: boolean
): ChatGenerationResult {
  if (!hasContext && result.confidence > 0.6) {
    return {
      answer:
        "I don't have that confirmed information yet, but I can connect you with our team.",
      confidence: 0.3,
      requiresHuman: true,
    };
  }

  if (result.confidence < CONFIDENCE_THRESHOLD) {
    return {
      ...result,
      requiresHuman: true,
      answer:
        result.answer +
        "\n\nI want to make sure you get accurate information — would you like me to connect you with our team?",
    };
  }

  return {
    ...result,
    answer: sanitizeAnswer(result.answer),
  };
}

export const ESCALATION_MESSAGE =
  "I can connect you with our team. Please share your name, email, phone, and a short description of what you need help with.";

export const ORDER_VERIFICATION_MESSAGE =
  "To look up your order, I'll need your order number and the email or phone number associated with it. Please share those details and I'll help you track your order.";

export const ORDER_VERIFICATION_FAILED_MESSAGE =
  "I wasn't able to verify those order details. For your security, I can't share order information without verification. Would you like me to connect you with our support team?";
