import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MS_TENANT_ID = Deno.env.get("MS_TENANT_ID")!;
const MS_CLIENT_ID = Deno.env.get("MS_CLIENT_ID")!;
const MS_CLIENT_SECRET = Deno.env.get("MS_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Map CRM user emails to their O365 sender addresses
const SENDER_MAP: Record<string, string> = JSON.parse(
  Deno.env.get("SENDER_MAP") || '{}'
);

async function getMsAccessToken(): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    client_secret: MS_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Token request failed: ${resp.status} ${err}`);
  }

  const data = await resp.json();
  return data.access_token;
}

async function sendViaMsGraph(
  accessToken: string,
  senderAddress: string,
  to: string[],
  cc: string[],
  bcc: string[],
  subject: string,
  bodyHtml: string,
  bodyText?: string
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const message: Record<string, unknown> = {
    subject,
    body: {
      contentType: "HTML",
      content: bodyHtml,
    },
    toRecipients: to.map((addr) => ({
      emailAddress: { address: addr },
    })),
  };

  if (cc.length > 0) {
    message.ccRecipients = cc.map((addr) => ({
      emailAddress: { address: addr },
    }));
  }
  if (bcc.length > 0) {
    message.bccRecipients = bcc.map((addr) => ({
      emailAddress: { address: addr },
    }));
  }

  const graphUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderAddress)}/sendMail`;

  const resp = await fetch(graphUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });

  if (resp.status === 202 || resp.ok) {
    return { ok: true };
  }

  const errBody = await resp.text();
  return { ok: false, error: `MS Graph error ${resp.status}: ${errBody}` };
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  try {
    // 1. Get user from JWT
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    // Create a Supabase client with the user's JWT to get their identity
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid auth token" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const userEmail = user.email!;
    const senderAddress = SENDER_MAP[userEmail];
    if (!senderAddress) {
      return new Response(JSON.stringify({ error: `User ${userEmail} is not authorized to send emails` }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    // 2. Parse request body
    const { contact_id, to, cc = [], bcc = [], subject, body_html, body_text } = await req.json();

    if (!contact_id || !to || !subject || !body_html) {
      return new Response(JSON.stringify({ error: "Missing required fields: contact_id, to, subject, body_html" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // 3. Service role client for DB operations
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 4. Insert email record with status='sending'
    const toArray = Array.isArray(to) ? to : [to];
    const { data: emailRow, error: insertError } = await adminClient
      .from("emails")
      .insert({
        contact_id,
        sender_address: senderAddress,
        sent_by: userEmail,
        to_addresses: toArray,
        cc_addresses: cc,
        bcc_addresses: bcc,
        subject,
        body_html,
        body_text: body_text || "",
        status: "sending",
      })
      .select("id")
      .single();

    if (insertError) {
      return new Response(JSON.stringify({ error: `DB insert failed: ${insertError.message}` }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    // 5. Get MS Graph access token
    const accessToken = await getMsAccessToken();

    // 6. Send via MS Graph
    const result = await sendViaMsGraph(
      accessToken,
      senderAddress,
      toArray,
      cc,
      bcc,
      subject,
      body_html,
      body_text
    );

    if (result.ok) {
      // 7a. Update email status to 'sent'
      await adminClient
        .from("emails")
        .update({ status: "sent", ms_message_id: result.messageId || null })
        .eq("id", emailRow.id);

      // 7b. Log as interaction
      await adminClient.from("interactions").insert({
        contact_id,
        interaction_type: "email_sent",
        subject,
        body: body_text || body_html.replace(/<[^>]*>/g, "").substring(0, 2000),
        logged_by: userEmail,
        occurred_at: new Date().toISOString(),
      });

      // 7c. Update contact's last_contacted
      await adminClient
        .from("contacts")
        .update({ last_contacted: new Date().toISOString() })
        .eq("id", contact_id);

      return new Response(JSON.stringify({ success: true, email_id: emailRow.id }), {
        status: 200,
        headers: corsHeaders,
      });
    } else {
      // 8. Update email status to 'failed'
      await adminClient
        .from("emails")
        .update({ status: "failed", error_message: result.error })
        .eq("id", emailRow.id);

      return new Response(JSON.stringify({ success: false, email_id: emailRow.id, error: result.error }), {
        status: 502,
        headers: corsHeaders,
      });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
