import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

/* =========================
   CLIENT SETUP
========================= */

const resend = new Resend(process.env.RESEND_API_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EMAIL_ROOT = path.join(process.cwd(), "emails", "templates");

/* =========================
   FILE LOADERS
========================= */

function loadFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function loadEmailAssets(emailFile) {
  const htmlPath = path.join(EMAIL_ROOT, emailFile);
  const subjectPath = htmlPath.replace(".html", ".subject.txt");

  if (!fs.existsSync(htmlPath)) {
    throw new Error(`Missing HTML file: ${emailFile}`);
  }

  if (!fs.existsSync(subjectPath)) {
    throw new Error(`Missing subject file: ${emailFile}`);
  }

  return {
    html: loadFile(htmlPath),
    subject: loadFile(subjectPath).trim()
  };
}

/* =========================
   TIME / CADENCE
========================= */

function daysSince(dateString) {
  if (!dateString) return Infinity;
  const last = new Date(dateString);
  const now = new Date();
  return (now - last) / (1000 * 60 * 60 * 24);
}

/* =========================
   STATE RESOLUTION
========================= */

function resolveNextEmail(user) {
  const state = user.user_state || "bt";

  if (state === "os") {
    return user.os_queue?.[0] || null;
  }

  if (state === "nc") {
    return user.nc_queue?.[0] || null;
  }

  return user.bt_queue?.[0] || null;
}

/* =========================
   MAIN HANDLER
========================= */

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "POST only" };
  }

  try {
    const { user_id } = JSON.parse(event.body || "{}");

    if (!user_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing user_id" })
      };
    }

    /* =========================
       LOAD USER
    ========================= */

    const { data: user, error } = await supabase
      .from("guided_users")
      .select("*")
      .eq("id", user_id)
      .single();

    if (error || !user) {
      throw new Error("User not found");
    }

    /* =========================
       CADENCE SAFETY
    ========================= */

    const cadenceDays =
      user.phase === "hydration" ? 3 : 6;

    if (daysSince(user.last_sent_at) < cadenceDays) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "Cadence hold" })
      };
    }

    /* =========================
       DETERMINE EMAIL
    ========================= */

    const emailFile = resolveNextEmail(user);

    if (!emailFile) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "No email to send" })
      };
    }

    const { html, subject } = loadEmailAssets(emailFile);

    /* =========================
       SEND EMAIL
    ========================= */

    const { error: sendError } = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject,
      html
    });

    if (sendError) {
      throw new Error(sendError.message);
    }

    /* =========================
       UPDATE STATE
    ========================= */

    const updates = {
      last_email_sent: emailFile,
      last_sent_at: new Date().toISOString()
    };

    const state = user.user_state || "bt";

    if (state === "os") {
      updates.os_queue = user.os_queue.slice(1);
    } else if (state === "nc") {
      updates.nc_queue = user.nc_queue.slice(1);
    } else {
      updates.bt_queue = user.bt_queue.slice(1);
    }

    await supabase
      .from("guided_users")
      .update(updates)
      .eq("id", user_id);

    return {
      statusCode: 200,
      body: JSON.stringify({
        sent: emailFile,
        state
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}
