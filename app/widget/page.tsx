"use client";

import Script from "next/script";

export default function WidgetPreviewPage() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-xl font-semibold mb-4">Widget Preview</h1>
      <p className="text-sm text-[#666] mb-8">
        The chat widget loads from /widget.js. Use this page to test locally.
      </p>
      <Script src="/widget.js?v=2.3.5" strategy="afterInteractive" />
    </main>
  );
}
