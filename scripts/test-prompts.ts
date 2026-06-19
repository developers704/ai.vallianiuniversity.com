/**
 * Test prompts for Valliani AI chatbot
 * Usage: npm run test:prompts (requires running dev server)
 */
const API_BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const PROMPTS = [
  "Do you have lab-grown diamond rings?",
  "Show me men's rings under $500",
  "Is SKU B234730Y available?",
  "What is your return policy?",
  "Track my order",
  "I want a refund",
  "Can I speak to a human?",
  "Recommend a Rado watch under $2000",
];

async function runPrompt(message: string) {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  const data = await res.json();
  console.log("\n" + "=".repeat(60));
  console.log("PROMPT:", message);
  console.log("INTENT:", data.intent);
  console.log("REQUIRES HUMAN:", data.requiresHuman);
  console.log("PRODUCTS:", data.products?.length ?? 0);
  console.log("ANSWER:", data.answer?.slice(0, 300));
  if (data.error) console.log("ERROR:", data.error);
}

async function main() {
  console.log(`Testing against ${API_BASE}/api/chat\n`);
  for (const prompt of PROMPTS) {
    await runPrompt(prompt);
  }
}

main().catch(console.error);
