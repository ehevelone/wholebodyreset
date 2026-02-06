const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Resend } = require("resend");
const { createClient } = require("@supabase/supabase-js");

// 🔥 HARD LOAD PROOF — this CANNOT break anything
console.log("🔥🔥🔥 registerUser FILE LOADED");

const resend = new Resend(process.env.RESEND_API_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * 🔒 NETLIFY-SAFE TEMPLATE ROOT
 * Templates live in:
 * netlify/functions/emails/templates/
 */
const EMAIL_ROOT = path.join(__dirname, "emails", "templates");

function hashEmail(email) {
  return crypto
    .createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex");
}

/* ======================================================
   CORE LOGIC — used internally AND by HTTP handler
   ====================================================== */
exports.registerUser = async function ({ email, product = "guided" }) {
  if (!email) throw new Error("registerUser: missing email");

  console.log("registerUser START:", email, "product:", product);

  /* ===============================
     AI FLOW — ai_journey (DO NOT TOUCH)
     =============================== */
  if (product === "ai") {
    const htmlFile = "ai-01-welcome.html";
    const subjectFile = "ai-01-welcome.subject.txt";

    const html = fs.readFileSync(
      path.join(EMAIL_ROOT, htmlFile),
      "utf8"
    );
    const subject = fs
      .readFileSync(path.join(EMAIL_ROOT, subjectFile), "utf8")
      .trim();

    const email_hash = hashEmail(email);

    const { error } = await supabase
      .from("ai_journey")
      .insert({
        email,
        email_hash,
        current_state: "entry",
        session_count: 1
      });

    if (error) throw error;

    await resend.emails.send({
      from:
        process.env.EMAIL_FROM ||
        "Whole Body Reset <support@wholelifereset.life>",
      to: email,
      subject,
      html
    });

    console.log("AI welcome email sent");

    return { email, program: "ai" };
  }

  /* ===============================
     GUIDED FOUNDATIONS FLOW
     =============================== */

  const htmlFile = "hd-01-welcome.html";
  const subjectFile = "hd-01-welcome.subject.txt";

  const html = fs.readFileSync(
    path.join(EMAIL_ROOT, htmlFile),
    "utf8"
  );
  const subject = fs
    .readFileSync(path.join(EMAIL_ROOT, subjectFile), "utf8")
    .trim();

  const { data: user, error } = await supabase
    .from("guided_users")
    .upsert(
      {
        email,
        program: "guided_foundations",
        status: "active",

        // 🔑 FIX: mark welcome as already sent in the sequence
        current_email: "hydration/hd-01-welcome.html",

        current_module: "hydration"
      },
      { onConflict: "email" }
    )
    .select("id,email")
    .single();

  if (error) throw error;

  await resend.emails.send({
    from:
      process.env.EMAIL_FROM ||
      "Whole Body Reset <support@wholelifereset.life>",
    to: email,
    subject,
    html
  });

  console.log("Guided welcome email sent");

  await supabase
    .from("guided_users")
    .update({
      welcome_sent: true,
      last_sent_at: new Date().toISOString(),
      next_email_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
    })
    .eq("id", user.id);

  console.log("welcome_sent + timing fields set for", email);

  return { user_id: user.id, program: "guided" };
};

/* ======================================================
   NETLIFY HTTP HANDLER — REQUIRED
   ====================================================== */
exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed"
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      body: "Invalid JSON"
    };
  }

  const { email, product } = payload;

  try {
    await exports.registerUser({ email, product });
    return {
      statusCode: 200,
      body: "ok"
    };
  } catch (err) {
    console.error("registerUser failed", err);
    return {
      statusCode: 500,
      body: "error"
    };
  }
};
