import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { classifyProviderError } from "../server/provider.js";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY is not configured; smoke test not run.");
  process.exit(2);
}

const configured = process.env.GEMINI_VISION_MODEL?.trim() || "gemini-2.5-flash";
const fallbacks = (process.env.GEMINI_FALLBACK_MODELS || "")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);
const models = [...new Set([configured, ...fallbacks])];
const client = new GoogleGenAI({ apiKey, httpOptions: { timeout: 20_000, retryOptions: { attempts: 1 } } });

for (const model of models) {
  const startedAt = Date.now();
  try {
    const response = await client.models.generateContent({
      model,
      contents: "Reply with OK",
      config: { temperature: 0, responseMimeType: "text/plain" }
    });
    console.log(JSON.stringify({ model, durationMs: Date.now() - startedAt, success: true, response: response.text?.trim().slice(0, 20) || "" }));
  } catch (error) {
    const failure = classifyProviderError(error);
    const rawMessage = error instanceof Error ? error.message : String(error);
    const safeMessage = rawMessage
      .replace(/([?&]key=)[^&\s]+/gi, "$1<redacted>")
      .replace(/AIza[\w-]+/g, "<redacted>")
      .slice(0, 240);
    console.log(JSON.stringify({ model, durationMs: Date.now() - startedAt, success: false, errorCategory: failure.category, status: failure.status, message: safeMessage }));
  }
}
