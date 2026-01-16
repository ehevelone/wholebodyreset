export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "POST only" })
    };
  }

  let input;
  try {
    input = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON" })
    };
  }

  // ---- SAFE DEFAULT ----
  let state = "hold_steady";

  const intensity = (input.symptom_intensity || "").toLowerCase();
  const tolerance = (input.tolerance_and_capacity || "").toLowerCase();
  const duration = (input.symptom_duration || "").toLowerCase();
  const patterns = (input.pattern_observations || "").toLowerCase();

  // ---- DECISION LOGIC ----

  // SLOW DOWN
  if (
    intensity.includes("intense") ||
    tolerance.includes("overwhelmed") ||
    tolerance.includes("sensitive") ||
    patterns.includes("worse")
  ) {
    state = "slow_down";
  }

  // INTEGRATION
  if (
    intensity.includes("mild") &&
    tolerance.includes("stable") &&
    patterns.includes("improving")
  ) {
    state = "integration";
  }

  // HOLD STEADY (explicit override)
  if (
    duration.includes("months") ||
    duration.includes("years")
  ) {
    state = "hold_steady";
  }

  // ---- RESPONSE ----
  return {
    statusCode: 200,
    body: JSON.stringify({
      state
    })
  };
}
