import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Netlify Scheduled Function (CRON)
export const config = {
  schedule: "0 * * * *" // every hour (UTC)
};

const PROGRAM = "guided_foundations";
const MIN_NEXT_DELAY_MINUTES = 5;

function nowIso() {
  return new Date().toISOString();
}

function addDaysISO(days) {
  const ms = days * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms).toISOString();
}

function addMinutesISO(minutes) {
  const ms = minutes * 60 * 1000;
  return new Date(Date.now() + ms).toISOString();
}

function moduleFromEmailFilename(emailFilename = "") {
  const name = emailFilename.toLowerCase();

  if (name.startsWith("hd-")) return "hydration";
  if (name.startsWith("mr-")) return "minerals";
  if (name.startsWith("tr-")) return "terrain";
  if (name.startsWith("gt-")) return "gut";
  if (name.startsWith("lv-")) return "liver";
  if (name.startsWith("kd-")) return "kidneys";
  if (name.startsWith("ad-")) return "adrenals";
  if (name.startsWith("bd-")) return "binders";
  if (name.startsWith("th-")) return "thyroid";
  if (name.startsWith("pr-")) return "parasites";
  if (name.startsWith("mt-")) return "metals";
  if (name.startsWith("eb-")) return "ebv";
  if (name.startsWith("ns-")) return "nervous-system";

  return "foundations";
}

// Load canonical sequence (safe on Netlify)
function loadSequence() {
  const filePath = path.join(
    process.cwd(),
    "netlify",
    "emails",
    "foundations_email_sequence.json"
  );

  const raw = fs.readFileSync(filePath, "utf-8");
  const json = JSON.parse(raw);
  return json.sequence;
}

function findNextEmail(sequence, currentEmail) {
  if (!sequence.length) return null;

  if (!currentEmail) return sequence[0];

  const idx = sequence.findIndex(e => e.email === currentEmail);
  return idx === -1 || idx + 1 >= sequence.length
    ? null
    : sequence[idx + 1];
}

async function sendEmail({ siteUrl, payload }) {
  const res = await fetch(`${siteUrl}/.netlify/functions/send_email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  return { ok: res.ok, status: res.status };
}

export async function handler() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const sequence = loadSequence();

  const siteUrl =
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    `https://${process.env.SITE_NAME}.netlify.app`;

  const { data: users, error } = await supabase
    .from("guided_users")
    .select("*")
    .eq("program", PROGRAM)
    .eq("status", "active")
    .eq("is_paused", false);

  if (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }

  const now = Date.now();

  const dueUsers = users.filter(u => {
    if (!u.next_email_at) return true;

    const due = Date.parse(u.next_email_at) <= now;
    if (!due) return false;

    if (u.last_sent_at) {
      const minutesSinceLast =
        (now - Date.parse(u.last_sent_at)) / 60000;
      return minutesSinceLast >= MIN_NEXT_DELAY_MINUTES;
    }

    return true;
  });

  const results = [];

  for (const user of dueUsers) {
    const next = findNextEmail(sequence, user.current_email);

    if (!next) {
      await supabase
        .from("guided_users")
        .update({ status: "completed", next_email_at: null })
        .eq("id", user.id);
      continue;
    }

    const send = await sendEmail({
      siteUrl,
      payload: {
        to: user.email,
        program: PROGRAM,
        email_file: next.email
      }
    });

    if (!send.ok) continue;

    const nextAt =
      next.cadence_days === 0
        ? addMinutesISO(MIN_NEXT_DELAY_MINUTES)
        : addDaysISO(next.cadence_days);

    await supabase
      .from("guided_users")
      .update({
        current_email: next.email,
        current_module: moduleFromEmailFilename(next.email),
        last_sent_at: nowIso(),
        next_email_at: nextAt
      })
      .eq("id", user.id);

    results.push({
      email: user.email,
      sent: next.email,
      next_email_at: nextAt
    });
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      processed: results.length,
      results
    })
  };
}
