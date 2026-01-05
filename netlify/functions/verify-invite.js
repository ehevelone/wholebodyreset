import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { email, notes = "" } = JSON.parse(event.body || "{}");

    if (!email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Email is required" })
      };
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString("hex");

    // Hash token (never store raw)
    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    // Expiration: 30 days
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const { error } = await supabase
      .from("invites")
      .insert([
        {
          email,
          token_hash: tokenHash,
          expires_at: expiresAt.toISOString(),
          max_uses: 1,
          uses: 0,
          notes
        }
      ]);

    if (error) {
      console.error(error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Database insert failed" })
      };
    }

    const inviteLink = `${process.env.SITE_URL}/wholebodyreset/gift/?k=${token}`;

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        inviteLink
      })
    };

  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error" })
    };
  }
}
