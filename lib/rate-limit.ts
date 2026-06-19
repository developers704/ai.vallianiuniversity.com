const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  maxRequests = parseInt(process.env.RATE_LIMIT_CHAT_MAX ?? "30", 10),
  windowMs = parseInt(process.env.RATE_LIMIT_CHAT_WINDOW_MS ?? "60000", 10)
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  entry.count += 1;
  return { allowed: true, remaining: maxRequests - entry.count };
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}
