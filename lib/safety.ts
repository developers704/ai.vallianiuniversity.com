import type { ChatIntent } from "./intent";
import { isSocialMessage } from "./intent";
import { isActiveRefundRequest } from "./policies";
import type { ChatGenerationResult } from "./openai";

const CONFIDENCE_THRESHOLD = 0.55;

const ESCALATION_INTENTS: ChatIntent[] = ["HUMAN_SUPPORT"];

export function shouldEscalate(params: {
  intent: ChatIntent;
  confidence: number;
  requiresHuman: boolean;
  message: string;
  isPolicyInquiry?: boolean;
}): boolean {
  const { intent, confidence, requiresHuman, message, isPolicyInquiry: policyInquiry } = params;

  if (isSocialMessage(message)) return false;
  if (policyInquiry) return false;
  if (requiresHuman) return true;
  if (ESCALATION_INTENTS.includes(intent)) return true;
  if (intent === "REFUND_POLICY" && isActiveRefundRequest(message)) return true;
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
  hasContext: boolean,
  options?: { policyQuestion?: boolean; message?: string }
): ChatGenerationResult {
  if (
    !hasContext &&
    result.confidence > 0.6 &&
    !(options?.message && isSocialMessage(options.message))
  ) {
    return {
      answer:
        "I don't have that confirmed information yet, but I can connect you with our team.",
      confidence: 0.3,
      requiresHuman: true,
    };
  }

  if (result.confidence < CONFIDENCE_THRESHOLD) {
    // Trust RAG-backed policy answers even when the model reports low confidence
    if (options?.policyQuestion && hasContext) {
      return {
        ...result,
        answer: sanitizeAnswer(result.answer),
        requiresHuman: false,
      };
    }

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
