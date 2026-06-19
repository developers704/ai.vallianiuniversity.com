const ALLOWED_ORIGINS = [
  "https://www.vallianijewelers.com",
  "https://vallianijewelers.com",
  "https://ai.vallianiuniversity.com",
  "http://localhost:3000",
];

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some((o) => origin === o || origin.endsWith(".vallianijewelers.com"));
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Key",
  };
}

export function handleOptions(request: Request): Response | null {
  if (request.method === "OPTIONS") {
    const origin = request.headers.get("origin");
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  return null;
}

export function verifyAdminKey(request: Request): boolean {
  const key = request.headers.get("x-admin-key") ?? request.headers.get("authorization")?.replace("Bearer ", "");
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) return process.env.NODE_ENV === "development";
  return key === adminKey;
}
