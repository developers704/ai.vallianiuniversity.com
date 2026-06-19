# Valliani Jewelers AI Chatbot

Production-ready AI shopping assistant for [Valliani Jewelers](https://www.vallianijewelers.com/), deployed at `https://ai.vallianiuniversity.com`.

## Features

- Embeddable chat widget (`/widget.js`) for Shopify themes
- RAG over product catalog, knowledge base, and Shopify live data
- Intent classification (products, policies, orders, human escalation)
- pgvector semantic search with local JSON fallback
- OpenAI Responses API for grounded answers
- Shopify Storefront + Admin GraphQL integration
- Order tracking with email/phone verification
- Admin knowledge base CRUD (no developer needed for FAQ updates)
- Rate limiting, CORS, input sanitization

## Tech Stack

Next.js 15 · TypeScript · Tailwind CSS · PostgreSQL · pgvector · Prisma · OpenAI · Shopify GraphQL

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL with pgvector |
| `OPENAI_API_KEY` | OpenAI API key |
| `OPENAI_MODEL` | e.g. `gpt-4.1-mini` |
| `SHOPIFY_STOREFRONT_ACCESS_TOKEN` | Storefront API token |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Admin API token (server only) |
| `ADMIN_API_KEY` | Protects admin/ingest routes |

### 3. Set up database

Enable pgvector on your PostgreSQL instance:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Push schema:

```bash
npm run db:push
```

### 4. Ingest products

Option A — direct script (recommended for first run):

```bash
npx tsx scripts/ingest-direct.ts
```

Option B — via API (server must be running):

```bash
npm run dev
npm run ingest:products
```

### 5. Run locally

```bash
npm run dev
```

- Home: http://localhost:3000
- Admin KB: http://localhost:3000/admin
- Widget preview: http://localhost:3000/widget

### 6. Test prompts

```bash
npm run test:prompts
```

## Shopify Embed

Add to your Shopify theme (`theme.liquid` before `</body>`):

```html
<script src="https://ai.vallianiuniversity.com/widget.js?v=2.2.0" defer></script>
```

For local testing, override the API base:

```html
<script>
  window.VALLIANI_CHAT_API = "http://localhost:3000";
</script>
<script src="http://localhost:3000/widget.js" defer></script>
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/chat` | Public (rate limited) | Main chat endpoint |
| POST | `/api/ingest/products` | Admin key | Re-index product embeddings |
| GET/POST/PUT/DELETE | `/api/admin/kb` | Admin key | Knowledge base CRUD |
| POST | `/api/shopify/order` | Admin key | Verified order lookup |
| GET | `/api/shopify/products` | Admin key | Storefront product sync |

### Chat request

```json
{
  "sessionId": "optional",
  "message": "Show me lab-grown diamond earrings under $700",
  "customer": {
    "email": "optional",
    "phone": "optional",
    "orderNumber": "optional"
  }
}
```

## Deployment

### Vercel

1. Connect repo to Vercel
2. Add env vars from `.env.example`
3. Use Vercel Postgres or external PostgreSQL with pgvector
4. Point `ai.vallianiuniversity.com` to the deployment

### Railway

1. Deploy with `railway.toml` config
2. Provision PostgreSQL plugin (enable pgvector)
3. Set environment variables

## Project Structure

```
app/
  api/chat/          # Main chat handler
  api/ingest/        # Product ingestion
  api/admin/kb/      # Knowledge base API
  api/shopify/       # Shopify integrations
  admin/             # Admin UI
  widget/            # Widget preview
lib/
  openai.ts          # OpenAI Responses + embeddings
  rag.ts             # Retrieval orchestration
  product-search.ts  # Hybrid product search
  shopify-*.ts       # Shopify clients
  safety.ts          # Hallucination prevention
  intent.ts          # Intent classification
data/
  processed_products.json
public/
  widget.js          # Embeddable widget
prisma/
  schema.prisma
```

## Security Notes

- Admin and Shopify Admin tokens are server-only
- Order details require email/phone verification
- CORS restricted to vallianijewelers.com and ai.vallianiuniversity.com
- Chat rate limited per IP
- Answers grounded in retrieved context only

## License

Proprietary — Valliani Jewelers
