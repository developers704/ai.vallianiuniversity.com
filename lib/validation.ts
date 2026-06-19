import { z } from "zod";

export const chatRequestSchema = z.object({
  sessionId: z.string().optional(),
  message: z.string().min(1).max(4000),
  customer: z
    .object({
      email: z.string().email().optional(),
      phone: z.string().max(30).optional(),
      orderNumber: z.string().max(50).optional(),
      name: z.string().max(100).optional(),
    })
    .optional(),
});

export const knowledgeDocumentSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.enum([
    "FAQ",
    "SHIPPING",
    "RETURNS",
    "REFUNDS",
    "WARRANTY",
    "STORE_INFO",
    "GUIDE",
    "OTHER",
  ]),
  content: z.string().min(1).max(50000),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
});

export const escalationSchema = z.object({
  sessionId: z.string(),
  name: z.string().max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  topic: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
