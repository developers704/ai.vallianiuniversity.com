import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-lg text-center space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">
          Valliani Jewelers
        </h1>
        <p className="text-[#666]">
          AI Shopping Assistant — powered by ai.vallianiuniversity.com
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/admin"
            className="px-5 py-2.5 rounded-full bg-[#1a1a1a] text-white text-sm hover:bg-[#333] transition"
          >
            Admin Portal
          </Link>
          <Link
            href="/widget"
            className="px-5 py-2.5 rounded-full border border-[#c9a962] text-[#1a1a1a] text-sm hover:bg-[#c9a962]/10 transition"
          >
            Preview Widget
          </Link>
        </div>
        <p className="text-xs text-[#999] pt-8">
          Embed on Shopify:{" "}
          <code className="bg-[#f5f5f5] px-2 py-1 rounded text-[11px]">
            {`<script src="https://ai.vallianiuniversity.com/widget.js?v=2.3.0" defer></script>`}
          </code>
        </p>
      </div>
    </main>
  );
}
