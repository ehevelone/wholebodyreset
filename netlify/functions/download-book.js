// 🔧 touch: force commit to sync ebook verification changes


const Stripe = require("stripe");
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function (event) {
  try {
    const qs = event.queryStringParameters || {};
    const sessionId = qs.session_id;
    const email = qs.email?.trim().toLowerCase();

    let verified = false;

    /* ======================================================
       PATH 1 — STRIPE VERIFICATION (FIRST-TIME DOWNLOAD)
    ====================================================== */
    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status === "paid") {
        verified = true;
      }
    }

    /* ======================================================
       PATH 2 — SUPABASE EMAIL VERIFICATION (RE-DOWNLOAD)
    ====================================================== */
    if (!verified && email) {
      const { data: guided } = await supabase
        .from("guided_users")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      const { data: ai } = await supabase
        .from("ai_journey")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (guided || ai) {
        verified = true;
      }
    }

    /* ======================================================
       BLOCK ACCESS IF NOT VERIFIED
    ====================================================== */
    if (!verified) {
      return {
        statusCode: 403,
        body: "Missing purchase verification"
      };
    }

    /* ======================================================
       SERVE PDF
    ====================================================== */
    const filePath = path.join(
      __dirname,
      "assets",
      "Whole-Body-Reset-Foundations.pdf"
    );

    const fileBuffer = fs.readFileSync(filePath);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          "inline; filename=\"Whole-Body-Reset-Foundations.pdf\"",
        "Cache-Control": "no-store"
      },
      body: fileBuffer.toString("base64"),
      isBase64Encoded: true
    };

  } catch (err) {
    console.error("❌ dl-book error:", err);
    return {
      statusCode: 500,
      body: "Server error"
    };
  }
};
