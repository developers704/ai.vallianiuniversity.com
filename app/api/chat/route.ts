import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  classifyIntent,
  isConversationalAcknowledgment,
  isFarewell,
  isGreeting,
  isPoliteDecline,
} from "@/lib/intent";
import { classifyIntentWithLLM, generateChatResponse } from "@/lib/openai";
import { retrieveContext, buildContextBlock } from "@/lib/rag";
import { toProductCard } from "@/lib/types/product";
import {
  shouldEscalate,
  enforceGroundedResponse,
  sanitizeAnswer,
  ESCALATION_MESSAGE,
  ORDER_VERIFICATION_MESSAGE,
  ORDER_VERIFICATION_FAILED_MESSAGE,
} from "@/lib/safety";
import {
  fetchOrderByNumber,
  verifyOrderIdentity,
  formatOrderContext,
  isShopifyAdminConfigured,
} from "@/lib/shopify-admin";
import { createEscalationTicket, getSessionTranscript } from "@/lib/escalation";
import { chatRequestSchema } from "@/lib/validation";
import { sanitizeUserInput } from "@/lib/sanitize";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import {
  buildProductListAnswer,
  buildConversationalContext,
  buildEarlyConversationAnswer,
  hasSubstantiveUserTopic,
  shouldUseProductListTemplate,
  trimConversationHistory,
} from "@/lib/token-optimize";
import { buildPolicyDirectAnswer } from "@/lib/policies";

export const runtime = "nodejs";

export async function OPTIONS(request: Request) {
  const opt = handleOptions(request);
  return opt ?? new Response(null, { status: 204 });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const opt = handleOptions(request);
  if (opt) return opt;

  const ip = getClientIp(request);
  const { allowed, remaining } = rateLimit(`chat:${ip}`);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { ...headers, "X-RateLimit-Remaining": "0" } }
    );
  }

  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        { error: "Server misconfigured: DATABASE_URL is not set." },
        { status: 503, headers }
      );
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Server misconfigured: OPENAI_API_KEY is not set." },
        { status: 503, headers }
      );
    }

    const body = await request.json();
    const parsed = chatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400, headers }
      );
    }

    const { sessionId: inputSessionId, message: rawMessage, customer } = parsed.data;
    const message = sanitizeUserInput(rawMessage);

    let sessionId = inputSessionId;
    if (!sessionId) {
      const session = await prisma.chatSession.create({ data: {} });
      sessionId = session.id;
    } else {
      const existing = await prisma.chatSession.findUnique({ where: { id: sessionId } });
      if (!existing) {
        const session = await prisma.chatSession.create({ data: { id: sessionId } });
        sessionId = session.id;
      }
    }

    await prisma.chatMessage.create({
      data: { sessionId, role: "user", content: message },
    });

    if (isGreeting(message)) {
      const greetingAnswer =
        "Hello! I hope you're doing well. Welcome to Valliani Jewelers — how can I help or assist you today?";

      await prisma.chatMessage.create({
        data: {
          sessionId,
          role: "assistant",
          content: greetingAnswer,
          intent: "GENERAL_FAQ",
          metadata: { products: [], requiresHuman: false } as unknown as Prisma.InputJsonValue,
        },
      });

      return NextResponse.json(
        {
          answer: greetingAnswer,
          intent: "GENERAL_FAQ",
          products: [],
          requiresHuman: false,
          sessionId,
        },
        { headers: { ...headers, "X-RateLimit-Remaining": String(remaining) } }
      );
    }

    if (isFarewell(message)) {
      const answer =
        "Thank you for visiting Valliani Jewelers! Feel free to come back anytime if you have questions about jewelry, orders, or policies. Have a wonderful day!";

      await prisma.chatMessage.create({
        data: {
          sessionId,
          role: "assistant",
          content: answer,
          intent: "GENERAL_FAQ",
          metadata: { products: [], requiresHuman: false } as unknown as Prisma.InputJsonValue,
        },
      });

      return NextResponse.json(
        {
          answer,
          intent: "GENERAL_FAQ",
          products: [],
          requiresHuman: false,
          sessionId,
        },
        { headers: { ...headers, "X-RateLimit-Remaining": String(remaining) } }
      );
    }

    if (isPoliteDecline(message)) {
      const answer =
        "No problem at all! I'm here whenever you'd like help finding jewelry, checking an order, or learning about our policies.";

      await prisma.chatMessage.create({
        data: {
          sessionId,
          role: "assistant",
          content: answer,
          intent: "GENERAL_FAQ",
          metadata: { products: [], requiresHuman: false } as unknown as Prisma.InputJsonValue,
        },
      });

      return NextResponse.json(
        {
          answer,
          intent: "GENERAL_FAQ",
          products: [],
          requiresHuman: false,
          sessionId,
        },
        { headers: { ...headers, "X-RateLimit-Remaining": String(remaining) } }
      );
    }

    if (isConversationalAcknowledgment(message)) {
      const history = await prisma.chatMessage.findMany({
        where: { sessionId },
        orderBy: { createdAt: "asc" },
        take: 10,
      });

      const conversationHistory = trimConversationHistory(
        history.slice(0, -1).map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }))
      );

      const answer = !hasSubstantiveUserTopic(conversationHistory)
        ? buildEarlyConversationAnswer(message)
        : sanitizeAnswer(
            (
              await generateChatResponse({
                message,
                context: buildConversationalContext(conversationHistory),
                conversationHistory,
                conversational: true,
              })
            ).answer
          );

      await prisma.chatMessage.create({
        data: {
          sessionId,
          role: "assistant",
          content: answer,
          intent: "GENERAL_FAQ",
          metadata: { products: [], requiresHuman: false } as unknown as Prisma.InputJsonValue,
        },
      });

      return NextResponse.json(
        {
          answer,
          intent: "GENERAL_FAQ",
          products: [],
          requiresHuman: false,
          sessionId,
        },
        { headers: { ...headers, "X-RateLimit-Remaining": String(remaining) } }
      );
    }

    const { intent, confidence: intentConfidence, extractedSku } = await classifyIntent(
      message,
      classifyIntentWithLLM
    );

    const policyDirectAnswer = buildPolicyDirectAnswer(message, intent);
    if (
      policyDirectAnswer &&
      intent !== "ORDER_TRACKING" &&
      intent !== "HUMAN_SUPPORT"
    ) {
      await prisma.chatMessage.create({
        data: {
          sessionId,
          role: "assistant",
          content: policyDirectAnswer,
          intent,
          metadata: { products: [], requiresHuman: false } as unknown as Prisma.InputJsonValue,
        },
      });

      return NextResponse.json(
        {
          answer: policyDirectAnswer,
          intent,
          products: [],
          requiresHuman: false,
          sessionId,
        },
        { headers: { ...headers, "X-RateLimit-Remaining": String(remaining) } }
      );
    }

    let orderContext = "";
    let orderVerified = false;

    if (intent === "ORDER_TRACKING") {
      if (!customer?.orderNumber || (!customer.email && !customer.phone)) {
        return NextResponse.json(
          {
            answer: ORDER_VERIFICATION_MESSAGE,
            intent,
            products: [],
            requiresHuman: false,
            sessionId,
          },
          { headers: { ...headers, "X-RateLimit-Remaining": String(remaining) } }
        );
      }

      if (isShopifyAdminConfigured()) {
        try {
          const { order, email, phone } = await fetchOrderByNumber(customer.orderNumber);
          if (order && verifyOrderIdentity({ email, phone }, customer)) {
            orderContext = formatOrderContext(order);
            orderVerified = true;
          } else if (order) {
            await createEscalationTicket({
              sessionId,
              topic: "Order verification failed",
              transcript: await getSessionTranscript(sessionId),
              email: customer.email,
              phone: customer.phone,
            });
            return NextResponse.json(
              {
                answer: ORDER_VERIFICATION_FAILED_MESSAGE,
                intent,
                products: [],
                requiresHuman: true,
                sessionId,
              },
              { headers: { ...headers, "X-RateLimit-Remaining": String(remaining) } }
            );
          }
        } catch (err) {
          console.error("[chat] Order lookup error:", err instanceof Error ? err.message : err);
        }
      }

      if (!orderVerified && !isShopifyAdminConfigured()) {
        return NextResponse.json(
          {
            answer: ORDER_VERIFICATION_MESSAGE,
            intent,
            products: [],
            requiresHuman: false,
            sessionId,
          },
          { headers: { ...headers, "X-RateLimit-Remaining": String(remaining) } }
        );
      }
    }

    const ctx = await retrieveContext({
      message,
      intent,
      extractedSku,
      orderContext,
    });

    const contextBlock = buildContextBlock(ctx);
    const hasContext =
      ctx.products.length > 0 ||
      Boolean(ctx.policyContext?.trim()) ||
      orderVerified;

    const history = await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
      take: 10,
    });

    const conversationHistory = trimConversationHistory(
      history.slice(0, -1).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }))
    );

    const products = ctx.products.map((p) => toProductCard(p));
    const useProductTemplate = shouldUseProductListTemplate(intent, products.length);

    let generation: { answer: string; confidence: number; requiresHuman: boolean };

    if (useProductTemplate) {
      generation = {
        answer: buildProductListAnswer(ctx.products, message),
        confidence: 0.9,
        requiresHuman: false,
      };
    } else {
      generation = await generateChatResponse({
        message,
        context: contextBlock,
        conversationHistory,
        productCardsShown: products.length > 0,
      });
      generation = enforceGroundedResponse(generation, hasContext);
    }

    const requiresHuman = shouldEscalate({
      intent,
      confidence: Math.min(generation.confidence, intentConfidence),
      requiresHuman: generation.requiresHuman,
      message,
    });

    let answer = generation.answer;

    if (requiresHuman && intent === "HUMAN_SUPPORT") {
      answer = ESCALATION_MESSAGE;
    } else if (requiresHuman && intent === "REFUND_POLICY") {
      answer =
        "For refund requests and disputes, I'll connect you with our team who can review your order details.\n\n" +
        ESCALATION_MESSAGE;
      await createEscalationTicket({
        sessionId,
        topic: "Refund request",
        transcript: await getSessionTranscript(sessionId),
        email: customer?.email,
        phone: customer?.phone,
        name: customer?.name,
      });
    } else if (requiresHuman && generation.confidence < 0.55) {
      await createEscalationTicket({
        sessionId,
        topic: `Low confidence: ${intent}`,
        transcript: await getSessionTranscript(sessionId),
        email: customer?.email,
        phone: customer?.phone,
      });
    }

    await prisma.chatMessage.create({
      data: {
        sessionId,
        role: "assistant",
        content: answer,
        intent,
        metadata: { products, requiresHuman } as unknown as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json(
      {
        answer,
        intent,
        products,
        requiresHuman,
        sessionId,
      },
      { headers: { ...headers, "X-RateLimit-Remaining": String(remaining) } }
    );
  } catch (err) {
    console.error("[chat] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500, headers }
    );
  }
}
