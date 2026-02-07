const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const PROGRAM = "guided_foundations";

// ⏱️ Delay between Welcome → Start Here
const WELCOME_TO_START_MINUTES = 5;

// Tester default (minutes)
const DEFAULT_TEST_INTERVAL_MINUTES = 2;

const nowIso = () => new Date().toISOString();
const addDaysISO = (d) => new Date(Date.now() + d * 86400000).toISOString();
const addMinutesISO = (m) => new Date(Date.now() + m * 60000).toISOString();

/**
 * JSON PHASE → ACTUAL FOLDER MAP
 */
const PHASE_FOLDER_MAP = {
  hydration: "hydration",
  hydration_paths: "hydration",
  minerals: "minerals",
  parasites: "parasites",
  metals: "metals",
  maintenance: "maintenance"
};

function moduleFromEmailPath(p = "") {
  if (p.startsWith("hydration/")) return "hydration";
  if (p.startsWith("minerals/")) return "minerals";
  if (p.startsWith("parasites/")) return "parasites";
  if (p.startsWith("metals/")) return "metals";
  if (p.startsWith("maintenance/")) return "maintenance";
  return "foundations";
}

/**
 * Build FULL RELATIVE PATHS
 */
function loadSequence() {
  const filePath = path.join(__dirname, "foundations_email_sequence.json");
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

  const sequence = [];

  // ✅ INTRO (AUTO FLOW) — ALWAYS FIRST, ALWAYS ONLY ONCE IN SEQUENCE
  const INTRO_ORDER = ["hd-01-welcome.html", "hd-00-start-here.html"];

  for (const email of INTRO_ORDER) {
    sequence.push({
      email: `hydration/${email}`,
      cadence_days: 0
    });
  }

  // 🔁 ALL OTHER PHASES
  for (const phaseKey of Object.keys(data.phases)) {
    // 🚫 DO NOT re-add hydration here (intro already handled above)
    if (phaseKey === "hydration") continue;

    const folder = PHASE_FOLDER_MAP[phaseKey];
    if (!folder) continue;

    const phase = data.phases[phaseKey];

    for (const groupKey of Object.keys(phase)) {
      for (const filename of phase[groupKey]) {
        // hydration_paths go to hydration/<bt|nc|os>/
        if (phaseKey === "hydration_paths") {
          sequence.push({
            email: `hydration/${groupKey}/${filename}`,
            cadence_days: 1
          });
        } else {
          sequence.push({
            email: `${folder}/${groupKey}/${filename}`,
            cadence_days: 1
          });
        }
      }
    }
  }

  return sequence;
}

function findNextEmail(sequence, current) {
  if (!current || current === "__START__") return sequence[0];
  const idx = sequence.findIndex((e) => e.email === current);
  return idx === -1 || idx + 1 >= sequence.length ? null : sequence[idx + 1];
}

async function sendEmail(payload) {
  const res = await fetch(
    "https://wholebodyreset.life/.netlify/functions/send_email",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    }
  );
  return res.ok;
}

function getTestIntervalMinutes(user) {
  const hours = Number(user.test_interval_hours);
  if (!Number.isFinite(hours) || hours <= 0) {
    return DEFAULT_TEST_INTERVAL_MINUTES;
  }
  return Math.max(1, Math.round(hours * 60));
}

exports.handler = async function () {
  console.log("DAILY DISPATCH RUN", new Date().toISOString());

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const sequence = loadSequence();

  const { data: users, error } = await supabase
    .from("guided_users")
    .select("*")
    .eq("program", PROGRAM)
    .eq("status", "active")
    .eq("is_paused", false);

  if (error) {
    console.error("Supabase error:", error);
    return { statusCode: 500, body: error.message };
  }

  const now = Date.now();

  for (const user of users) {
    // ⛔ STOP if waiting for BT / NC / OS input
    if (user.awaiting_input === true) continue;

    // ⏳ Too early
    if (user.next_email_at && Date.parse(user.next_email_at) > now) continue;

    const next = findNextEmail(sequence, user.current_email);
    if (!next) continue;

    console.log("SENDING", next.email, "TO", user.email);

    const sent = await sendEmail({
      email: user.email,
      email_file: next.email
    });

    if (!sent) {
      console.error("FAILED SEND", user.email, next.email);
      continue;
    }

    const isTester = user.test_mode === true;
    const testMinutes = isTester ? getTestIntervalMinutes(user) : null;

    let nextAt = null;
    let awaitingInput = false;

    // 🚫 HARD LOCK: Start Here should NEVER repeat
    if (next.email === "hydration/hd-00-start-here.html") {
      // after Start Here, continue on cadence (tester fast, real daily)
      nextAt = isTester ? addMinutesISO(testMinutes) : addDaysISO(1);
    }
    // 🚦 FIRST HYDRATION PATH EMAIL → INTERACTIVE MODE
    else if (next.email.startsWith("hydration/") && next.email.includes("/bt/")) {
      awaitingInput = true;
      nextAt = null;
    }
    // ⏱ Welcome → Start Here delay
    else if (next.email === "hydration/hd-01-welcome.html") {
      nextAt = addMinutesISO(WELCOME_TO_START_MINUTES);
    }
    // 🔁 Normal cadence
    else {
      nextAt = isTester ? addMinutesISO(testMinutes) : addDaysISO(1);
    }

    await supabase
      .from("guided_users")
      .update({
        current_email: next.email,
        current_module: moduleFromEmailPath(next.email),
        last_sent_at: nowIso(),
        next_email_at: nextAt,
        awaiting_input: awaitingInput
      })
      .eq("id", user.id);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true })
  };
};
