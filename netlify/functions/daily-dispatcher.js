// netlify/functions/daily-dispatcher.js
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const PROGRAM = "guided_foundations";

// ⏱️ Delay between Welcome → Start Here (ALWAYS 5 minutes)
const WELCOME_TO_START_MINUTES = 5;

// Tester default (minutes) if test_interval_hours missing/invalid
const DEFAULT_TEST_INTERVAL_MINUTES = 2;

// Real users cadence AFTER Start Here (until first hydration interactive email)
const REAL_USER_DAYS_AFTER_START_HERE = 3;

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
 * Build FULL SEQUENCE (PRODUCTION, ORDERED)
 * - Intro is ALWAYS first
 * - hydration_paths ALWAYS comes immediately after intro (order is enforced)
 * - then everything else
 */
function loadSequence() {
  const filePath = path.join(__dirname, "foundations_email_sequence.json");
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

  const sequence = [];

  // ✅ INTRO — ALWAYS FIRST
  const INTRO_ORDER = ["hd-01-welcome.html", "hd-00-start-here.html"];
  for (const email of INTRO_ORDER) {
    sequence.push({ email: `hydration/${email}` });
  }

  // ✅ hydration_paths — ALWAYS NEXT (order enforced)
  const hydrationPaths = data?.phases?.hydration_paths || {};
  for (const groupKey of Object.keys(hydrationPaths)) {
    for (const filename of hydrationPaths[groupKey]) {
      sequence.push({ email: `hydration/${groupKey}/${filename}` });
    }
  }

  // 🔁 ALL OTHER PHASES (excluding hydration + hydration_paths)
  for (const phaseKey of Object.keys(data.phases || {})) {
    if (phaseKey === "hydration") continue;
    if (phaseKey === "hydration_paths") continue;

    const folder = PHASE_FOLDER_MAP[phaseKey];
    if (!folder) continue;

    const phase = data.phases[phaseKey];
    for (const groupKey of Object.keys(phase)) {
      for (const filename of phase[groupKey]) {
        sequence.push({ email: `${folder}/${groupKey}/${filename}` });
      }
    }
  }

  return sequence;
}

/**
 * IMPORTANT:
 * We do NOT filter the sequence before calling findNextEmail.
 */
function findNextEmail(sequence, current) {
  if (!current || current === "__START__") return sequence[0];
  const idx = sequence.findIndex((e) => e.email === current);
  return idx === -1 || idx + 1 >= sequence.length ? null : sequence[idx + 1];
}

async function sendEmail(payload) {
  const res = await fetch("https://wholebodyreset.life/.netlify/functions/send_email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  return res.ok;
}

// supports int OR decimal hours (0.25 = 15 mins)
function getTestIntervalMinutes(user) {
  const hours = Number(user.test_interval_hours);
  if (!Number.isFinite(hours) || hours <= 0) return DEFAULT_TEST_INTERVAL_MINUTES;
  return Math.max(1, Math.round(hours * 60));
}

// hydration path email = anything inside hydration/(bt|nc|os)/
function isHydrationPathEmail(emailPath = "") {
  return (
    emailPath.startsWith("hydration/") &&
    (emailPath.includes("/bt/") || emailPath.includes("/nc/") || emailPath.includes("/os/"))
  );
}

// Force hydration path folder to match user_state (bt|nc|os)
function applyHydrationBranch(emailPath, userState) {
  if (!isHydrationPathEmail(emailPath)) return emailPath;

  const state = String(userState || "").toLowerCase();
  if (!["bt", "nc", "os"].includes(state)) return emailPath;

  return emailPath.replace(/^hydration\/(bt|nc|os)\//, `hydration/${state}/`);
}

exports.handler = async function () {
  console.log("DAILY DISPATCH RUN", new Date().toISOString());

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const fullSequence = loadSequence();

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
    // ⛔ WAITING FOR USER INPUT (interactive mode)
    if (user.awaiting_input === true) continue;

    // ⏳ TOO EARLY
    if (user.next_email_at && Date.parse(user.next_email_at) > now) continue;

    // ✅ Determine next from FULL sequence (no filtering)
    const nextBase = findNextEmail(fullSequence, user.current_email);
    if (!nextBase) continue;

    // ✅ If hydration path email and user has no state yet, default to NC for the FIRST interactive send
    const effectiveState = user.user_state ? String(user.user_state).toLowerCase() : "nc";

    const nextEmail = isHydrationPathEmail(nextBase.email)
      ? applyHydrationBranch(nextBase.email, effectiveState)
      : nextBase.email;

    console.log("SENDING", nextEmail, "TO", user.email);

    const sent = await sendEmail({
      email: user.email,
      email_file: nextEmail
    });

    if (!sent) {
      console.error("FAILED SEND", user.email, nextEmail);
      continue;
    }

    const isTester = user.test_mode === true;
    const testMinutes = isTester ? getTestIntervalMinutes(user) : null;

    let nextAt = null;
    let awaitingInput = false;

    // ⏱ Welcome → Start Here (always 5 min)
    if (nextEmail === "hydration/hd-01-welcome.html") {
      nextAt = addMinutesISO(WELCOME_TO_START_MINUTES);
    }
    // ✅ After Start Here, schedule next send:
    // - testers: their interval
    // - real users: 3 days
    else if (nextEmail === "hydration/hd-00-start-here.html") {
      nextAt = isTester ? addMinutesISO(testMinutes) : addDaysISO(REAL_USER_DAYS_AFTER_START_HERE);
    }
    // 🚦 First hydration path email sent → LOCK and wait for click (bt/nc/os)
    else if (isHydrationPathEmail(nextEmail)) {
      awaitingInput = true;
      nextAt = null;
    }
    // 🔁 Everything else (post-hydration branches + later phases)
    else {
      nextAt = isTester ? addMinutesISO(testMinutes) : addDaysISO(1);
    }

    // ✅ CRITICAL: advance current_email to what we ACTUALLY sent
    await supabase
      .from("guided_users")
      .update({
        current_email: nextEmail,
        current_module: moduleFromEmailPath(nextEmail),
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
