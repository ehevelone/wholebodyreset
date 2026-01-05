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
    const { email } = JSON.parse(event.body || "{}");
    if (!email) {
      return { statusCode: 400, body: JSON.stringify({ ok:false }) };
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const expires = new Date();
    expires.setDate(expires.getDate() + 30);

    const { error } = await supabase.from("invites").insert({
      email,
      token_hash: tokenHash,
      expires_at: expires.toISOString(),
      max_uses: 1,
      uses: 0
    });

    if (error) {
      console.error(error);
      return { statusCode: 500, body: JSON.stringify({ ok:false }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        link: `${process.env.SITE_URL}/wholebodyreset/gift/?k=${token}`
      })
    };

  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ ok:false }) };
  }
}
