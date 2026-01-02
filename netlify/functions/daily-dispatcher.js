import { createClient } from "@supabase/supabase-js";
import sequenceData from "../../emails/foundations_email_sequence.json" assert { type: "json" };

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
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function addMinutesISO(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function moduleFromEmailFilename(email = "") {
  const e = email.toLowerCase();

  if (e.startsWith("hd-")) return "hydration";
  if (e.startsWith("mr-")) return "minerals";
  if (e.startsWith("tr-")) return "terrain";
  if (e.startsWith("gt-")) return "gut";
  if (e.startsWith("lv-")) return "liver";
  if (e.startsWith("kd-")) return "kidneys";
  if (e.startsWith("ad-")) return "adrenals";
  if (e.startsWith("bd-")) return "binders";
  if (e.startsWith("th-")) return "thyroid";
  if (e.startsWith("pr-")) return "parasites";
  if (e.startsWith("mt-")) return "metals";
  if (e.startsWith("eb-")) return "ebv";
  if (e.startsWith("ns-")) return "nervous-system";

  return "foundations";
}

function findNextEmail(sequence, currentEmail) {
  if (!currentEmail) return sequence[0];
  const idx = sequence.findIndex(e => e.email === currentEmail);
  return idx === -1 || idx + 1 >= sequence.length
    ? null
    : sequence[idx + 1];
}

async function sendEmail(siteUrl, payload) {
  const res = await fetch(`${siteUrl}/.netlify/functions/send_email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  return res.ok;
}

export async function handler() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const sequence = sequenceData.sequence;

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
    return { statusCode: 500, body: error.message };
  }

  const now = Date.now();
  let processed = 0;

  for (const user of users) {
    if (user.next_email_at && Date.parse(user.next_email_at) > now) continue;

    const next = findNextEmail(sequence, user.current_email);

    if (!next) {
      await supabase
        .from("guided_users")
        .update({ status: "completed", next_email_at: null })
        .eq("id", user.id);
      continue;
    }

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

    processed++;
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, processed })
  };
}
