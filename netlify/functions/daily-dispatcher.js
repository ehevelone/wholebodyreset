import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// ============================
// NETLIFY CRON CONFIG
// ============================
export const config = {
  schedule: "0 * * * *" // hourly
};

const PROGRAM = "guided_foundations";
const MIN_NEXT_DELAY_MINUTES = 5;

// ============================
// TIME HELPERS
// ============================
const nowIso = () => new Date().toISOString();
const addDaysISO = d => new Date(Date.now() + d * 86400000).toISOString();
const addMinutesISO = m => new Date(Date.now() + m * 60000).toISOString();
const hoursBetween = (a, b) =>
  Math.abs(Date.parse(a) - Date.parse(b)) / 36e5;

// ============================
// MODULE DETECTION
// ============================
function moduleFromEmailFilename(name = "") {
  const n = name.toLowerCase();
  if (n.startsWith("hd-")) return "hydration";
  if (n.startsWith("mn-")) return "minerals";
  if (n.startsWith("pr-")) return "parasites";
  if (n.startsWith("mtc-")) return "maintenance";
  if (n.startsWith("mt-")) return "metals";
  return "foundations";
}

// ============================
// ESM __dirname FIX
// ============================
const __filename = new URL(import.meta.url).pathname;
const __dirname_esm = path.dirname(__filename);

// ============================
// LOAD + BUILD SEQUENCE
// Supports BOTH:
//  1) { sequence: [{email, cadence_days?}, ...] }
//  2) { phases: { module: { track: [ "file.html", ... ] } } }
// ============================
function loadSequence() {
  const filePath = path.join(__dirname_esm, "foundations_email_sequence.json");
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));

  // Format 1: already has a sequence array
  if (Array.isArray(raw.sequence)) {
    return raw.sequence.map(x => {
      if (typeof x === "string") return { email: x };
      return x;
    });
  }

  // Format 2: phases tree (your current file)
  if (raw.phases && typeof raw.phases === "object") {
    const out = [];

    // stable module order
    const moduleOrder = ["hydration", "minerals", "parasites", "metals", "maintenance"];

    for (const mod of moduleOrder) {
      const modNode = raw.phases[mod];
      if (!modNode) continue;

      // stable track order inside each module
      const trackOrder = ["intro", "bt", "nc", "os"];

      for (const track of trackOrder) {
        const arr = modNode[track];
        if (Array.isArray(arr)) {
          for (const email of arr) out.push({ email });
        }
      }

      // any other tracks not in trackOrder (just in case)
      for (const [track, arr] of Object.entries(modNode)) {
        if (trackOrder.includes(track)) continue;
        if (Array.isArray(arr)) {
          for (const email of arr) out.push({ email });
        }
      }
    }

    return out;
  }

  return [];
}

// ============================
// CADENCE RULES (Users only)
// Must be 3–7 days per your requirement.
// Intro emails default to 0 (immediate), everything else by module.
// ============================
function cadenceDaysFor(email) {
  const mod = moduleFromEmailFilename(email);

  // intro emails (welcome/orientation) can be immediate
  const n = (email || "").toLowerCase();
  const isIntro =
    n.includes("intro") ||
    n.includes("welcome") ||
    n.includes("expectations") ||
    n.includes("observation") ||
    n.endsWith("-e01.html"); // common "first email" pattern

  if (isIntro) return 0;

  // 3–7 day spacing by module
  if (mod === "hydration") return 3;
  if (mod === "minerals") return 4;
  if (mod === "parasites") return 5;
  if (mod === "metals") return 6;
  if (mod === "maintenance") return 7;

  // default safe
  return 3;
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
// SEND EMAIL
// ============================
async function sendEmail(siteUrl, payload) {
  const res = await fetch(`${siteUrl}/.netlify/functions/send_email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    let text = "";
    try { text = await res.text(); } catch {}
    console.log("❌ send_email failed", res.status, text);
    return false;
  }

  return true;
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
  if (!sequence.length) {
    console.log("⚠️ No email sequence loaded. Check foundations_email_sequence.json");
    return { statusCode: 200, body: JSON.stringify({ ok: false, reason: "no-sequence" }) };
  }

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
    console.log("❌ Supabase error:", error.message);
    return { statusCode: 500, body: error.message };
  }

  const now = Date.now();
  let considered = 0;
  let due = 0;
  let sentCount = 0;

  for (const user of users) {
    considered++;

    // ============================
    // DUE CHECK
    // ============================
    if (user.test_mode) {
      // testers: cadence via hours since last_sent_at
      if (!user.last_sent_at) {
        // if they have no last_sent_at, they probably only got first email from webhook;
        // allow dispatcher to move them forward by treating them as due now.
      } else {
        const interval =
          user.test_interval_hours && user.test_interval_hours > 0
            ? user.test_interval_hours
            : 4;

        const hrs = hoursBetween(user.last_sent_at, nowIso());
        if (hrs < interval) continue;
      }
    } else {
      // users: honor next_email_at
      if (user.next_email_at && Date.parse(user.next_email_at) > now) continue;
    }

    due++;

    const next = findNextEmail(sequence, user.current_email);
    if (!next || !next.email) continue;

    console.log("➡️ Sending", next.email, "to", user.email, user.test_mode ? "(TEST)" : "(USER)");

    const sent = await sendEmail(siteUrl, {
      email: user.email,
      email_file: next.email
    });

    if (!sent) continue;

    sentCount++;

    // ============================
    // SCHEDULE NEXT
    // ============================
    let nextAt;

    if (user.test_mode) {
      const interval =
        user.test_interval_hours && user.test_interval_hours > 0
          ? user.test_interval_hours
          : 4;
      nextAt = addMinutesISO(interval * 60);
    } else {
      const days = typeof next.cadence_days === "number"
        ? next.cadence_days
        : cadenceDaysFor(next.email);

      nextAt = days === 0
        ? addMinutesISO(MIN_NEXT_DELAY_MINUTES)
        : addDaysISO(days);
    }

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

  console.log("✅ Dispatcher summary:", { considered, due, sent: sentCount });

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, considered, due, sent: sentCount })
  };
}
