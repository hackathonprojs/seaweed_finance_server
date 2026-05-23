import "dotenv/config";
import express from "express";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";

// ── Config ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("❌  GEMINI_API_KEY environment variable is required.");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// ── Express + Multer setup ────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Accept the image in memory (no disk I/O needed)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB – Gemini inline-data limit
});

// ── Prompt helpers ────────────────────────────────────────────────────────────

/**
 * Build the structured-output prompt sent to Gemini.
 * We ask Gemini to return strict JSON so we can parse it reliably.
 */
function buildPrompt(currency, envelopes) {
  const envelopeList = Object.entries(envelopes)
    .map(([name, balance]) => `  - ${name}: ${balance} ${currency} remaining`)
    .join("\n");

  return `You are a smart shopping assistant helping with envelope budgeting.

Analyze the product shown in the image and return ONLY a JSON object — no markdown, no extra text.

The user's envelope balances (money left) are:
${envelopeList}

Your task:
1. Identify the product (brand / manufacturer, model / name, brief description).
2. Estimate its current retail price in ${currency}. Use your best knowledge; give a single number.
3. Decide which envelope category it best fits (must be one of: ${Object.keys(envelopes).join(", ")}).
4. Determine whether the user can afford it: they can afford it if the estimated price ≤ the envelope balance.

Respond with exactly this JSON schema (no extra keys):
{
  "item": {
    "brand": "<brand or manufacturer>",
    "name": "<product name / model>",
    "description": "<one-sentence description>",
    "estimated_price": <number>,
    "currency": "${currency}"
  },
  "envelope": "<matched category>",
  "envelope_balance": <number>,
  "can_afford": <true|false>,
  "reasoning": "<one sentence explaining price estimate and affordability>"
}`;
}

// ── Route ─────────────────────────────────────────────────────────────────────

/**
 * POST /check-budget
 *
 * multipart/form-data fields:
 *   data  – JSON string matching the envelope schema
 *   photo – image file (JPEG, PNG, WebP, …)
 */
app.post("/check-budget", upload.single("photo"), async (req, res) => {
  try {
    // ── 1. Validate inputs ───────────────────────────────────────────────────

    if (!req.file) {
      return res.status(400).json({ error: "A photo file is required (field: photo)." });
    }

    let budgetData;
    try {
      const raw = req.body.data;
      if (!raw) throw new Error("missing");
      budgetData = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return res.status(400).json({
        error: 'A JSON string is required in the "data" form field.',
        example: {
          currency: "USD",
          envelopes: { food: 450, clothes: 120.5, entertainment: 75 },
        },
      });
    }

    const { currency, envelopes } = budgetData;

    if (!currency || typeof currency !== "string") {
      return res.status(400).json({ error: '"currency" must be a non-empty string.' });
    }
    if (!envelopes || typeof envelopes !== "object" || Object.keys(envelopes).length === 0) {
      return res.status(400).json({ error: '"envelopes" must be a non-empty object.' });
    }

    // ── 2. Call Gemini with the image ────────────────────────────────────────

    const imagePart = {
      inlineData: {
        mimeType: req.file.mimetype,
        data: req.file.buffer.toString("base64"),
      },
    };

    const textPart = { text: buildPrompt(currency, envelopes) };

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [imagePart, textPart] }],
    });

    // @google/genai SDK exposes the text directly on the result object
    const rawText = result.text ?? "";

    // ── 3. Parse Gemini's JSON response ─────────────────────────────────────

    let analysis;
    try {
      // Strip accidental markdown code fences if present
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      analysis = JSON.parse(cleaned);
    } catch {
      // Return raw text so caller can debug
      return res.status(502).json({
        error: "AI returned an unexpected format.",
        raw_response: rawText,
      });
    }

    // ── 4. Build and return the final response ───────────────────────────────

    return res.json({
      item: analysis.item,
      envelope: analysis.envelope,
      envelope_balance: analysis.envelope_balance,
      can_afford: analysis.can_afford,
      verdict: analysis.can_afford
        ? `✅ You can afford this! It costs ~${analysis.item.estimated_price} ${currency} and you have ${analysis.envelope_balance} ${currency} left in your "${analysis.envelope}" envelope.`
        : `❌ You can't afford this right now. It costs ~${analysis.item.estimated_price} ${currency} but you only have ${analysis.envelope_balance} ${currency} left in your "${analysis.envelope}" envelope.`,
      reasoning: analysis.reasoning,
    });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Internal server error.", details: err.message });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🪙  Envelope Finance Server running on http://localhost:${PORT}`);
  console.log(`📸  POST /check-budget  — multipart/form-data: data (JSON) + photo (image)`);
});
