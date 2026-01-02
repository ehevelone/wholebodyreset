import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// ============================
// NETLIFY CRON CONFIG
// ============================
export const config = {
  schedule: "0 * * * *" // runs hourly (UTC)
};

const PROGRAM = "guided_foundations";
const MIN_NEXT_DELAY_MINUTES = 5;

// ============================
// TIME HELPERS
// ============================
const nowIso = () => new Date().toISOString();
const addDaysISO = d => new Date(Date.now() + d * 86400000).toISOString();
const addMinutesISO = m => new Date(Date.now() + m * 60000).toISOString();

// ============================
// MODULE DETECTION
// ============================
function moduleFromEmailFilename(name = "") {
  const n = name.toLowerCase();
  if (n.startsWith("hd-")) return "hydration";
  if (n.startsWith("mr-")) return "minerals";
  if (n.startsWith("tr-")) return "terrain";
  if (n.startsWith("gt-")) return "gut";
  if (n.startsWith("lv-")) return "liver";
  if (n.startsWith("kd-")) return "kidneys";
  if (n.startsWith("ad-")) return "adrenals";
  if (n.startsWith("bd-")) return "binders";
  if (n.startsWith("th-")) return "thyroid";
  if (n.startsWith("pr-")) return "parasites";
  if (n.startsWith("mt-")) return "metals";
  if (n.startsWith("eb-")) return "ebv";
  if (n.startsWith("ns-")) return "nervous-system";
  return "foundations";
}

// ============================
// LOAD SEQUENCE (FINAL PATH)
// ============================
function loadSequence() {
  const filePath = path.join(
    __dirname,
    "foundations_email_sequence.json"
  );

  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw).sequence;
}

// ============================
// FIND NEXT EMAIL
// ============================
function findNextEmail(sequence, current) {
  if (!sequence.length) return null;
  if (!current) return sequence[0];

  const idx = sequence.findIndex(e => e.email === current);
  return idx === -1 || idx + 1 >= sequence.length
    ? null
    : sequence[idx + 1];
}

// ============================
// SEND EMAIL (CALLS send_email)
// ============================
async function sendEmail(siteUrl, payload) {
  const res = await fetch(`${siteUrl}/.netlify/functions/send_email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  return res.ok;
}

// ============================
// HANDLER
// ============================
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

  for (const user of users) {
    if (user.next_email_at && Date.parse(user.next_email_at) > now) continue;

    const next = findNextEmail(sequence, user.current_email);
    if (!next) continue;

    const sent = await sendEmail(siteUrl, {
      to: user.email,
      program: PROGRAM,
      email_file: next.email
    });

    if (!sent) continue;

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
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true })
  };
}
