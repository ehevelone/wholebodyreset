import { readFileSync } from "fs";
import path from "path";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // Parse form data
  const params = new URLSearchParams(event.body);

  const input = {
    current_symptoms: params.get("current_symptoms"),
    symptom_duration: params.get("symptom_duration"),
    symptom_intensity: params.get("symptom_intensity"),
    pattern_observations: params.get("pattern_observations"),
    current_supports: params.get("current_supports"),
    medications_and_conditions: params.get("medications_and_conditions"),
    tolerance_and_capacity: params.get("tolerance_and_capacity"),
    goals_and_intent: params.get("goals_and_intent")
  };

  // VERY SIMPLE decision logic (safe default)
  let state = "hold_steady";

  if (
    input.symptom_intensity === "Intense" ||
    input.tolerance_and_capacity === "Easily overwhelmed"
  ) {
    state = "slow_down";
  }

  if (
    input.symptom_intensity === "Mild" &&
    input.tolerance_and_capacity === "Generally stable"
  ) {
    state = "integration";
  }

  // Pass decision forward via query params (no DB yet)
  const redirectUrl = `/intake/results.html?state=${state}`;

  return {
    statusCode: 303,
    headers: {
      Location: redirectUrl
    }
  };
}
