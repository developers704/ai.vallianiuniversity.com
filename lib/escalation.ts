import { prisma } from "./db";

export async function createEscalationTicket(params: {
  sessionId: string;
  name?: string;
  email?: string;
  phone?: string;
  topic: string;
  transcript: string;
}): Promise<string | null> {
  try {
    const ticket = await prisma.escalationTicket.create({
      data: {
        sessionId: params.sessionId,
        name: params.name,
        email: params.email,
        phone: params.phone,
        topic: params.topic,
        transcript: params.transcript,
        status: "OPEN",
      },
    });
    return ticket.id;
  } catch (err) {
    console.error(
      "[escalation] Failed to create ticket:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

export async function getSessionTranscript(sessionId: string): Promise<string> {
  const messages = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  return messages.map((m) => `${m.role}: ${m.content}`).join("\n");
}
