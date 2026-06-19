"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface KnowledgeDoc {
  id: string;
  title: string;
  type: string;
  status: string;
  content?: string;
  createdAt: string;
  updatedAt: string;
}

const DOC_TYPES = [
  "FAQ",
  "SHIPPING",
  "RETURNS",
  "REFUNDS",
  "WARRANTY",
  "STORE_INFO",
  "GUIDE",
  "OTHER",
] as const;

export default function AdminPage() {
  const [apiKey, setApiKey] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [documents, setDocuments] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    title: "",
    type: "FAQ" as (typeof DOC_TYPES)[number],
    content: "",
    status: "DRAFT" as "DRAFT" | "PUBLISHED",
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  const headers = useCallback(
    () => ({ "Content-Type": "application/json", "X-Admin-Key": apiKey }),
    [apiKey]
  );

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/kb", { headers: headers() });
      if (!res.ok) throw new Error("Unauthorized or failed to load");
      const data = await res.json();
      setDocuments(data.documents);
      setAuthenticated(true);
    } catch {
      setError("Invalid admin key or server error");
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    const saved = sessionStorage.getItem("adminKey");
    if (saved) {
      setApiKey(saved);
    }
  }, []);

  useEffect(() => {
    if (apiKey) fetchDocs();
  }, [apiKey, fetchDocs]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const method = editingId ? "PUT" : "POST";
    const body = editingId ? { id: editingId, ...form } : form;
    const res = await fetch("/api/admin/kb", {
      method,
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError("Failed to save document");
      return;
    }
    setForm({ title: "", type: "FAQ", content: "", status: "DRAFT" });
    setEditingId(null);
    fetchDocs();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this document?")) return;
    await fetch(`/api/admin/kb?id=${id}`, { method: "DELETE", headers: headers() });
    fetchDocs();
  }

  async function togglePublish(doc: KnowledgeDoc) {
    const res = await fetch("/api/admin/kb", {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({
        id: doc.id,
        status: doc.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED",
      }),
    });
    if (res.ok) fetchDocs();
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <header className="bg-white border-b border-[#e5e5e5] px-6 py-4 flex items-center justify-between">
        <div>
          <Link href="/" className="text-sm text-[#666] hover:text-black">
            ← Home
          </Link>
          <h1 className="text-xl font-semibold mt-1">Knowledge Base Admin</h1>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-8">
        {!authenticated && (
          <div className="bg-white rounded-xl border p-6 space-y-4">
            <h2 className="font-medium">Admin Authentication</h2>
            <input
              type="password"
              placeholder="Admin API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full border rounded-lg px-4 py-2 text-sm"
            />
            <button
              onClick={() => {
                sessionStorage.setItem("adminKey", apiKey);
                fetchDocs();
              }}
              className="px-4 py-2 bg-[#1a1a1a] text-white rounded-lg text-sm"
            >
              Sign In
            </button>
            {error && <p className="text-red-600 text-sm">{error}</p>}
          </div>
        )}

        {authenticated && (
          <>
            <form onSubmit={handleSave} className="bg-white rounded-xl border p-6 space-y-4">
              <h2 className="font-medium">
                {editingId ? "Edit Document" : "Create Document"}
              </h2>
              <input
                required
                placeholder="Title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full border rounded-lg px-4 py-2 text-sm"
              />
              <div className="flex gap-4">
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm({ ...form, type: e.target.value as typeof form.type })
                  }
                  className="border rounded-lg px-4 py-2 text-sm"
                >
                  {DOC_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      status: e.target.value as "DRAFT" | "PUBLISHED",
                    })
                  }
                  className="border rounded-lg px-4 py-2 text-sm"
                >
                  <option value="DRAFT">Draft</option>
                  <option value="PUBLISHED">Published</option>
                </select>
              </div>
              <textarea
                required
                placeholder="Content (policies, FAQs, guides...)"
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={8}
                className="w-full border rounded-lg px-4 py-2 text-sm font-mono"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#c9a962] text-white rounded-lg text-sm font-medium"
                >
                  {editingId ? "Update & Re-index" : "Create & Index"}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setForm({ title: "", type: "FAQ", content: "", status: "DRAFT" });
                    }}
                    className="px-4 py-2 border rounded-lg text-sm"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>

            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="px-6 py-4 border-b font-medium">
                Documents ({documents.length})
              </div>
              {loading ? (
                <p className="p-6 text-sm text-[#666]">Loading...</p>
              ) : documents.length === 0 ? (
                <p className="p-6 text-sm text-[#666]">
                  No documents yet. Create your first FAQ or policy above.
                </p>
              ) : (
                <ul className="divide-y">
                  {documents.map((doc) => (
                    <li key={doc.id} className="px-6 py-4 flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium text-sm">{doc.title}</p>
                        <p className="text-xs text-[#666] mt-0.5">
                          {doc.type} · {doc.status} · Updated{" "}
                          {new Date(doc.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => {
                            setEditingId(doc.id);
                            setForm({
                              title: doc.title,
                              type: doc.type as typeof form.type,
                              content: doc.content ?? "",
                              status: doc.status as "DRAFT" | "PUBLISHED",
                            });
                          }}
                          className="text-xs px-3 py-1.5 border rounded-full hover:bg-[#fafafa]"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => togglePublish(doc)}
                          className="text-xs px-3 py-1.5 border rounded-full hover:bg-[#fafafa]"
                        >
                          {doc.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                        </button>
                        <button
                          onClick={() => handleDelete(doc.id)}
                          className="text-xs px-3 py-1.5 border border-red-200 text-red-600 rounded-full hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-white rounded-xl border p-6 space-y-3">
              <h2 className="font-medium">Product Ingestion</h2>
              <p className="text-sm text-[#666]">
                Re-index products from processed_products.json with embeddings.
              </p>
              <button
                onClick={async () => {
                  const res = await fetch("/api/ingest/products", {
                    method: "POST",
                    headers: headers(),
                  });
                  const data = await res.json();
                  alert(JSON.stringify(data, null, 2));
                }}
                className="px-4 py-2 bg-[#1a1a1a] text-white rounded-lg text-sm"
              >
                Run Product Ingestion
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
