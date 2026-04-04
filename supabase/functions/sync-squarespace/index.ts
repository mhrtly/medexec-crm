import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SQUARESPACE_API_KEY = Deno.env.get("SQUARESPACE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SQSP_BASE = "https://api.squarespace.com/1.0/commerce/orders";

// Discount code → comp type
const COMP_TYPE_MAP: Record<string, string> = {
  SPEAKER26: "speaker", SPEAKER25: "speaker", SPEAKER24: "speaker", SPEAKER: "speaker",
  BOARD: "board", PASTBOARD: "past_board",
  CHAMELEON: "in_kind",
  SCHOLAR: "scholarship",
};

const SPONSOR_CODES = new Set([
  "JANDJ", "JANDJ995", "PWC", "PWC995", "PHILIPS", "PHILIPS995",
  "ZS", "ZS995", "BCG", "BCG995", "BSCI", "BSCI995", "BAXTER", "BAXTER995",
  "GE", "GE995", "INTEGRA", "INTEGRA995", "INSULET", "INSULET995",
  "MCKINSEY", "MCKINSEY995", "OLYMPUS", "OLYMPUS995", "SOLVENTUM", "SOLVENTUM995",
  "SOLV", "SOLV995", "AVANIA", "AVANIA995", "GOODWIN", "GOODWIN995",
  "LANDW", "LANDW995", "VIZIENT", "VIZIENT995", "DLAPIPER", "DLAPIPER995",
  "HALLORAN", "HALLORAN995", "MEDIVANTAGE", "MEDIVANTAGE995",
  "LSI", "LSI995", "MASSMEDIC", "MASSMEDIC995", "MLSC", "MLSC995",
  "SMITHNEPHEW", "SMITHNEPHEW995", "SPONSOR2021",
]);

interface SquarespaceOrder {
  id: string;
  orderNumber: string;
  createdOn: string;
  customerEmail: string;
  fulfillmentStatus: string;
  grandTotal: { value: string };
  lineItems: Array<{ productName: string }>;
  discountLines: Array<{ promoCode?: string; amount: { value: string } }>;
  formSubmission: Array<{ label: string; value: string }> | null;
}

async function fetchAllOrders(year?: number): Promise<SquarespaceOrder[]> {
  const orders: SquarespaceOrder[] = [];
  let url: string | null = SQSP_BASE;

  while (url) {
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${SQUARESPACE_API_KEY}`,
        "User-Agent": "MedExecWomen-CRM/1.0",
      },
    });

    if (!resp.ok) {
      throw new Error(`Squarespace API error: ${resp.status} ${await resp.text()}`);
    }

    const data = await resp.json();
    orders.push(...(data.result || []));
    url = data.pagination?.hasNextPage ? data.pagination.nextPageUrl : null;
  }

  if (year) {
    return orders.filter((o) => {
      const ticketRaw = o.lineItems?.[0]?.productName || "";
      const yearMatch = ticketRaw.match(/20\d{2}/);
      const orderYear = yearMatch ? parseInt(yearMatch[0]) : parseInt(o.createdOn.slice(0, 4));
      return orderYear === year;
    });
  }

  return orders;
}

function parseOrder(order: SquarespaceOrder) {
  const form: Record<string, string> = {};
  for (const f of order.formSubmission || []) {
    form[f.label] = f.value;
  }

  const fullName = (form["Name"] || "").trim();
  const parts = fullName.split(" ", 2);
  const firstName = parts[0] || "";
  const lastName = parts[1] || "";

  const ticketRaw = order.lineItems?.[0]?.productName || "";
  const ticketType = ticketRaw.replace(/^MedExecWomen\d*\s*-?\s*/, "").trim() || ticketRaw;

  const discounts = order.discountLines || [];
  const promoCode = discounts[0]?.promoCode || "";
  const discountAmount = discounts.length > 0 ? parseFloat(discounts[0].amount.value) : 0;

  const promoUpper = promoCode.toUpperCase();
  let compType: string | null = null;
  if (COMP_TYPE_MAP[promoUpper]) compType = COMP_TYPE_MAP[promoUpper];
  else if (SPONSOR_CODES.has(promoUpper)) compType = "sponsor";

  // Also detect sponsorship by ticket type (catches orders without promo codes)
  const ticketLower = ticketType.toLowerCase();
  if (!compType && (
    ticketLower.includes("diamond") ||
    ticketLower.includes("platinum") ||
    ticketLower.includes("gold") ||
    ticketLower.includes("silver") ||
    ticketLower.includes("bronze") ||
    ticketLower.includes("emerald") ||
    ticketLower.includes("ruby") ||
    ticketLower.includes("sapphire") ||
    ticketLower.includes("sponsorship") ||
    ticketLower.includes("industry partner")
  )) {
    compType = "sponsor";
  }

  const grandTotal = parseFloat(order.grandTotal.value);
  const isPaid = grandTotal > 0;

  const yearMatch = ticketRaw.match(/20\d{2}/);
  const confYear = yearMatch ? parseInt(yearMatch[0]) : parseInt(order.createdOn.slice(0, 4));

  return {
    order_number: order.orderNumber,
    squarespace_id: order.id,
    email: (order.customerEmail || "").toLowerCase().trim(),
    first_name: firstName,
    last_name: lastName,
    title: (form["Title"] || "").trim(),
    company: (form["Company"] || "").trim(),
    conference_year: confYear,
    ticket_type: ticketType,
    promo_code: promoCode,
    comp_type: compType,
    is_paid: isPaid,
    amount_paid: grandTotal,
    discount_amount: discountAmount,
    status: order.fulfillmentStatus.toLowerCase(),
    registered_at: order.createdOn,
  };
}

Deno.serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  try {
    // Auth check — require a valid Supabase JWT
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const year = body.year || 2026;

    // Fetch from Squarespace
    const orders = await fetchAllOrders(year);
    const registrations = orders
      .map(parseOrder)
      .filter((r) => r.status !== "canceled");

    // Connect to Supabase with service role (bypasses RLS)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Match contacts by email
    let matched = 0;
    let unmatched = 0;

    for (const reg of registrations) {
      let contactId: number | null = null;

      if (reg.email) {
        // Check contacts.email
        const { data: contact } = await supabase
          .from("contacts")
          .select("id")
          .ilike("email", reg.email)
          .limit(1)
          .single();

        if (contact) {
          contactId = contact.id;
        } else {
          // Check contact_emails table
          const { data: altEmail } = await supabase
            .from("contact_emails")
            .select("contact_id")
            .ilike("email", reg.email)
            .limit(1)
            .single();

          if (altEmail) contactId = altEmail.contact_id;
        }
      }

      if (contactId) matched++;
      else unmatched++;

      // Upsert
      await supabase.from("registrations").upsert(
        {
          ...reg,
          contact_id: contactId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "squarespace_id" }
      );
    }

    const result = {
      success: true,
      year,
      synced: registrations.length,
      matched,
      unmatched,
      synced_at: new Date().toISOString(),
    };

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    console.error("Sync error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      }
    );
  }
});
