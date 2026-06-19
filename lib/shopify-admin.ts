const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN ?? "vallianijewelers.myshopify.com";
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ?? "";
const API_VERSION = process.env.SHOPIFY_API_VERSION ?? "2025-04";

const ADMIN_URL = `https://${STORE_DOMAIN}/admin/api/${API_VERSION}/graphql.json`;

interface AdminResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

async function adminQuery<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  if (!ADMIN_TOKEN) {
    throw new Error("SHOPIFY_ADMIN_ACCESS_TOKEN is not configured");
  }

  const res = await fetch(ADMIN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": ADMIN_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Shopify Admin API error: ${res.status}`);
  }

  const json = (await res.json()) as AdminResponse<T>;
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join(", "));
  }
  if (!json.data) {
    throw new Error("No data returned from Shopify Admin API");
  }
  return json.data;
}

export interface VerifiedOrder {
  name: string;
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  createdAt: string;
  fulfillments: Array<{
    status: string;
    trackingCompany: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
  }>;
  lineItems: Array<{ title: string; quantity: number }>;
}

const ORDER_BY_NAME_QUERY = `
  query OrderByName($query: String!) {
    orders(first: 1, query: $query) {
      edges {
        node {
          id
          name
          email
          phone
          displayFinancialStatus
          displayFulfillmentStatus
          createdAt
          fulfillments {
            status
            trackingInfo {
              company
              number
              url
            }
          }
          lineItems(first: 10) {
            edges {
              node {
                title
                quantity
              }
            }
          }
        }
      }
    }
  }
`;

function normalizeOrderNumber(orderNumber: string): string {
  const cleaned = orderNumber.replace(/^#/, "").trim();
  return cleaned.startsWith("#") ? cleaned : `#${cleaned}`;
}

function maskTrackingNumber(num: string | null): string | null {
  if (!num || num.length <= 4) return num;
  return "*".repeat(num.length - 4) + num.slice(-4);
}

export async function fetchOrderByNumber(
  orderNumber: string
): Promise<{
  order: VerifiedOrder | null;
  email: string | null;
  phone: string | null;
}> {
  const name = normalizeOrderNumber(orderNumber);
  const data = await adminQuery<{
    orders: {
      edges: Array<{
        node: {
          name: string;
          email: string | null;
          phone: string | null;
          displayFinancialStatus: string;
          displayFulfillmentStatus: string;
          createdAt: string;
          fulfillments: Array<{
            status: string;
            trackingInfo: Array<{
              company: string | null;
              number: string | null;
              url: string | null;
            }>;
          }>;
          lineItems: { edges: Array<{ node: { title: string; quantity: number } }> };
        };
      }>;
    };
  }>(ORDER_BY_NAME_QUERY, { query: `name:${name}` });

  const node = data.orders.edges[0]?.node;
  if (!node) return { order: null, email: null, phone: null };

  const order: VerifiedOrder = {
    name: node.name,
    displayFinancialStatus: node.displayFinancialStatus,
    displayFulfillmentStatus: node.displayFulfillmentStatus,
    createdAt: node.createdAt,
    fulfillments: node.fulfillments.flatMap((f) =>
      f.trackingInfo.map((t) => ({
        status: f.status,
        trackingCompany: t.company,
        trackingNumber: maskTrackingNumber(t.number),
        trackingUrl: t.url,
      }))
    ),
    lineItems: node.lineItems.edges.map((e) => e.node),
  };

  return { order, email: node.email, phone: node.phone };
}

export function verifyOrderIdentity(
  order: { email: string | null; phone: string | null },
  customer: { email?: string; phone?: string }
): boolean {
  const emailMatch =
    customer.email &&
    order.email &&
    order.email.toLowerCase() === customer.email.toLowerCase();

  const normalizePhone = (p: string) => p.replace(/\D/g, "").slice(-10);
  const phoneMatch =
    customer.phone &&
    order.phone &&
    normalizePhone(customer.phone) === normalizePhone(order.phone);

  return !!(emailMatch || phoneMatch);
}

export function formatOrderContext(order: VerifiedOrder): string {
  const lines = [
    `Order: ${order.name}`,
    `Financial Status: ${order.displayFinancialStatus}`,
    `Fulfillment Status: ${order.displayFulfillmentStatus}`,
    `Placed: ${new Date(order.createdAt).toLocaleDateString()}`,
    `Items: ${order.lineItems.map((i) => `${i.title} x${i.quantity}`).join(", ")}`,
  ];

  if (order.fulfillments.length > 0) {
    for (const f of order.fulfillments) {
      lines.push(
        `Tracking: ${f.trackingCompany ?? "Carrier TBD"} — ${f.trackingNumber ?? "pending"}`
      );
      if (f.trackingUrl) lines.push(`Tracking URL: ${f.trackingUrl}`);
    }
  }

  return lines.join("\n");
}

export function isShopifyAdminConfigured(): boolean {
  return Boolean(ADMIN_TOKEN);
}
