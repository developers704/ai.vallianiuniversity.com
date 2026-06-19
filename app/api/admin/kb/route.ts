import { NextResponse } from "next/server";
import { prisma, upsertKnowledgeEmbedding } from "@/lib/db";
import { createEmbedding } from "@/lib/openai";
import { knowledgeDocumentSchema } from "@/lib/validation";
import { verifyAdminKey, corsHeaders } from "@/lib/cors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!verifyAdminKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const docs = await prisma.knowledgeDocument.findMany({
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ documents: docs });
}

export async function POST(request: Request) {
  if (!verifyAdminKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = knowledgeDocumentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { title, type, content, status } = parsed.data;
  const doc = await prisma.knowledgeDocument.create({
    data: {
      title,
      type,
      content,
      status: status ?? "DRAFT",
    },
  });

  if (doc.status === "PUBLISHED") {
    const embedding = await createEmbedding(`${title}\n${content}`);
    await upsertKnowledgeEmbedding(doc.id, embedding);
  }

  return NextResponse.json({ document: doc }, { status: 201 });
}

export async function PUT(request: Request) {
  if (!verifyAdminKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, ...rest } = body as { id: string } & Record<string, unknown>;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const parsed = knowledgeDocumentSchema.partial().safeParse(rest);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const doc = await prisma.knowledgeDocument.update({
    where: { id },
    data: parsed.data,
  });

  if (doc.status === "PUBLISHED") {
    const embedding = await createEmbedding(`${doc.title}\n${doc.content}`);
    await upsertKnowledgeEmbedding(doc.id, embedding);
  }

  return NextResponse.json({ document: doc });
}

export async function DELETE(request: Request) {
  if (!verifyAdminKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await prisma.knowledgeDocument.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}
