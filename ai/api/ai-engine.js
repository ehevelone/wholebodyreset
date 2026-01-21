/**
 * AI ENGINE — Whole Body Reset
 * -----------------------------------------
 * Purpose:
 * Central orchestrator that:
 * - Accepts validated user input
 * - Routes decisions using ai-config rules
 * - Selects a response state
 * - Assembles safe, non-prescriptive output
 *
 * This file contains NO medical logic.
 * All intelligence lives in /ai-config.
 */

import fs from "fs";
import path from "path";

/* ============================
   CONFIG LOADING
   ============================ */

const CONFIG_PATH = path.resolve(process.cwd(), "ai-config");

function loadJSON(fileName) {
  const filePath = path.join(CONFIG_PATH, fileName);
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

const inputSchema = loadJSON("input-schema.json");
const decisionRules = loadJSON("decision-rules.json");
const decisionRouter = loadJSON("decision-router.json");
const outputStates = loadJSON("output-states.json");
const responseTemplates = loadJSON("response-templates.json");
const safetyOverrides = loadJSON("safety-overrides.json");
const stateMemory = loadJSON("state-memory.json");

/* ============================
   CORE ENGINE
   ============================ */

export function runAIEngine(userInput, sessionState = {}) {
  // 1️⃣ Validate input shape (not meaning)
  const validatedInput = validateInput(userInput);

  // 2️⃣ Detect safety overrides first
  const safetyResult = checkSafetyOverrides(validatedInput);
  if (safetyResult.triggered) {
    return assembleResponse({
      outputState: safetyResult.outputState,
      input: validatedInput,
      reason: safetyResult.reason
    });
  }

  // 3️⃣ Determine decision path
  const decision = routeDecision(validatedInput, sessionState);

  // 4️⃣ Select output state
  const outputState = selectOutputState(decision);

  // 5️⃣ Assemble final response
  return assembleResponse({
    outputState,
    input: validatedInput,
    decision,
    sessionState
  });
}

/* ============================
   VALIDATION
   ============================ */

function validateInput(input) {
  // This does NOT judge meaning — only structure
  if (!input || typeof input !== "object") {
    throw new Error("Invalid input: expected object.");
  }

  // Optional: strict category enforcement
  return input;
}

/* ============================
   SAFETY CHECKS
   ============================ */

function checkSafetyOverrides(input) {
  // Example placeholder logic
  // (Rules live in safety-overrides.json)
  return {
    triggered: false,
    outputState: null,
    reason: null
  };
}

/* ============================
   DECISION ROUTING
   ============================ */

function routeDecision(input, sessionState) {
  // Evaluate patterns, tolerance, duration, intent
  // No diagnoses, no prescriptions
  return {
    decisionKey: "hold_steady",
    confidence: "moderate"
  };
}

/* ============================
   OUTPUT STATE SELECTION
   ============================ */

function selectOutputState(decision) {
  return decision.decisionKey;
}

/* ============================
   RESPONSE ASSEMBLY
   ============================ */

function assembleResponse({ outputState, input, decision, reason }) {
  const stateConfig = outputStates.output_states[outputState];

  if (!stateConfig) {
    throw new Error(`Unknown output state: ${outputState}`);
  }

  return {
    output_state: outputState,
    message: generateLanguage(stateConfig),
    printable_summary: generatePrintableSummary(outputState),
    metadata: {
      decision,
      reason,
      timestamp: new Date().toISOString()
    }
  };
}

/* ============================
   LANGUAGE GENERATION
   ============================ */

function generateLanguage(stateConfig) {
  // Select safe language only
  const allowed = stateConfig.allowed_language;
  return allowed[Math.floor(Math.random() * allowed.length)];
}

/* ============================
   PRINTABLE SUMMARY (OPTIONAL)
   ============================ */

function generatePrintableSummary(outputState) {
  return {
    title: "Current Focus",
    state: outputState,
    reminder: "No action is required. This summary is for reflection only."
  };
}
