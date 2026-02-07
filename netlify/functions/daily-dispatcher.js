// netlify/functions/daily-dispatcher.js
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const PROGRAM = "guided_foundations";
const WELCOME_TO_START_MINUTES = 5;
const DEFAULT_TEST_INTERVAL_MINUTES = 2;
const REAL_USER_DAYS_AFTER_START_HERE = 3;

// Safety buffer to prevent race conditions
const SAFETY_BUFFER_MS = 2 * 60 * 1000;

const nowIso = () => new Date().toISOString();
const addDaysISO = d => new Date(Date.now() + d * 86400000).toISOString();
const addMinutesISO = m => new Date(Date.now() + m * 60000).toISOString();

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

function loadSequence() {
  const data = JSON.parse(
    fs.readFileSync(path.join(__dirname, "foundations_email_sequence.json"), "utf8")
  );

  const seq = [];

  // INTRO
  ["hd-01-welcome.html", "hd-00-start-here.html"].forEach(f =>
    seq.push({ email: `hydration/${f}` })
  );

  // Hydration paths
  const hp = data?.phases?.hydration_paths || {};
  Object.keys(hp).forEach(g =>
    hp[g].forEach(f => seq.push({ email: `hydration/${g}/${f}` }))
  );

  // Remaining phases
  Object.keys(data.phases || {}).forEach(phase => {
    if (phase === "hydration" || phase === "hydration_paths") return;
    const folder = PHASE_FOLDER_MAP[phase];
    if (!folder) return;

    Object.keys(data.phases[phase]).forEach(g =>
      data.phases[phase][g].forEach(f =>
        seq.push({ email: `${folder}/${g}/${f}` })
      )
    );
  });

  return seq;
}

function findNextEmail(seq, current) {
  if (!current || current === "__START__") return seq[0];
  const i = seq.findIndex(e => e.email === current);
  return i === -1 || i + 1 >= seq.length ? null : seq[i + 1];
}

async function sendEmail(payload) {
  const r = await fetch("https://wholebodyreset.life/.netlify/functions/send_email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  return r.ok;
}

function getTestIntervalMinutes(u) {
  const h = Number(u.test_interval_hours);
  if (!Number.isFinite(h) || h <= 0) return DEFAULT_TEST_INTERVAL_MINUTES;
  return Math.max(1, Math.round(h * 60));
}

function isHydrationPathEmail(p = "") {
  return p.startsWith("hydration/") && /\/(bt|nc|os)\//.test(p);
}

function applyHydrationBranch(p, state) {
  return p.replace(/^hydration\/(bt|nc|os)\//, `hydration/${state}/`);
}

exports.handler = async function () {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const seq = loadSequence();
  const now = Date.now();

  const { data: users, error: fetchErr } = await supabase
    .from("guided_users")
    .select("*")
    .eq("program", PROGRAM)
    .in("status", ["active", "enrolled", "started"])
    .or("is_paused.is.null,is_paused.eq.false");

  if (fetchErr) {
    console.error("FETCH USERS ERROR:", fetchErr);
    return { statusCode: 500, body: "Fetch error" };
  }

  console.log("DD users found:", users?.length || 0);

  for (const user of users || []) {
    if (user.awaiting_input) continue;
    if (user.next_email_at && Date.parse(user.next_email_at) > now) continue;

    if (user.last_sent_at) {
      const last = Date.parse(user.last_sent_at);
      if (now - last < SAFETY_BUFFER_MS) continue;
    }

    const lastSent = user.current_email || "__START__";
    const next = findNextEmail(seq, lastSent);
    if (!next) continue;

    const state = (user.user_state || "nc").toLowerCase();
    const emailToSend = isHydrationPathEmail(next.email)
      ? applyHydrationBranch(next.email, state)
      : next.email;

    const sent = await sendEmail({ email: user.email, email_file: emailToSend });
    if (!sent) continue;

    const isTester = user.test_mode === true;
    const testMin = isTester ? getTestIntervalMinutes(user) : null;

    let nextAt = null;
    let awaiting = false;

    if (emailToSend === "hydration/hd-01-welcome.html") {
      nextAt = addMinutesISO(WELCOME_TO_START_MINUTES);
    } else if (emailToSend === "hydration/hd-00-start-here.html") {
      nextAt = isTester ? addMinutesISO(testMin) : addDaysISO(REAL_USER_DAYS_AFTER_START_HERE);
    } else if (isHydrationPathEmail(emailToSend)) {
      awaiting = true;
      nextAt = null;
    } else {
      nextAt = isTester ? addMinutesISO(testMin) : addDaysISO(1);
    }

    const patch = {
      current_email: emailToSend,
      current_module: moduleFromEmailPath(emailToSend),
      last_sent_at: nowIso(),
      next_email_at: nextAt,
      awaiting_input: awaiting
    };

    // ✅ Update by ID, then VERIFY it actually updated
    const { data: updatedById, error: updateErrById } = await supabase
      .from("guided_users")
      .update(patch)
      .eq("id", user.id)
      .select("id,email,program,current_email,last_sent_at,next_email_at,awaiting_input");

    if (updateErrById) {
      console.error("UPDATE FAILED (by id):", user.id, updateErrById);
      continue;
    }

    // 🔥 If zero rows updated, fallback to (email + program)
    if (!updatedById || updatedById.length === 0) {
      console.error("UPDATE AFFECTED 0 ROWS (by id). Falling back:", {
        user_id: user.id,
        email: user.email,
        program: user.program
      });

      const { data: updatedFallback, error: updateErrFallback } = await supabase
        .from("guided_users")
        .update(patch)
        .eq("email", user.email)
        .eq("program", PROGRAM)
        .select("id,email,program,current_email,last_sent_at,next_email_at,awaiting_input");

      if (updateErrFallback) {
        console.error("UPDATE FAILED (fallback):", updateErrFallback);
      } else {
        console.log("UPDATED (fallback):", updatedFallback?.[0] || null);
      }
    } else {
      console.log("UPDATED (by id):", updatedById[0]);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
