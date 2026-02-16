import { getSettings } from "./plugins.js";
import { localUrlScore } from "./local-model.js";

const REQUEST_TIMEOUT = 20000;

function joinUrl(base, path) {
  if (!base) return path;
  const trimmedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const trimmedPath = path?.startsWith("/") ? path : `/${path || ""}`;
  return `${trimmedBase}${trimmedPath}`;
}

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function normalizeJson(data) {
  if (!data || typeof data !== "object") return null;
  const phishingProb =
    data.phishing_probability ??
    data.phishingProbability ??
    data.risk_score ??
    data.riskScore ??
    data.score ??
    data.probability ??
    null;
  const prediction = data.prediction;
  const label =
    data.result_text ||
    data.label ||
    data.prediction_label ||
    (prediction === 0 ? "Phishing Website" : "Legit Website");
  if (phishingProb === null && prediction === undefined) return null;
  const score = phishingProb !== null ? Number(phishingProb) : prediction === 0 ? 0.85 : 0.15;
  return {
    score: Number.isFinite(score) ? score : 0,
    label,
    urlScore: Number.isFinite(score) ? score : 0,
    urlLabel: label,
    signals: ["phishguard api"],
    source: "server"
  };
}

function normalizeCombinedJson(data) {
  if (!data || typeof data !== "object") return null;
  const urlModel = data.url_model || data.urlModel || data.url || null;
  const textModel = data.text_model || data.textModel || data.text || null;
  const textModelError = data.text_model_error || data.textModelError || null;
  if (!urlModel && !textModel) return null;

  const urlPrediction = urlModel?.prediction;
  const urlScoreRaw =
    urlModel?.phishing_probability ??
    urlModel?.phishingProbability ??
    (urlPrediction === 0 ? 0.85 : urlPrediction === 1 ? 0.15 : null);
  const urlScore = Number.isFinite(Number(urlScoreRaw))
    ? Number(urlScoreRaw)
    : null;

  const textPrediction = textModel?.prediction;
  const textScoreRaw =
    textModel?.phishing_probability ??
    textModel?.phishingProbability ??
    (textPrediction === 1 ? 0.85 : textPrediction === 0 ? 0.15 : null);
  const textScore = Number.isFinite(Number(textScoreRaw))
    ? Number(textScoreRaw)
    : null;

  const combined = Math.max(urlScore ?? 0, textScore ?? 0);
  const label = combined >= 0.5 ? "phishing" : "legitimate";

  return {
    score: combined,
    label,
    urlScore,
    urlLabel: urlModel?.result_text || urlModel?.label || "URL model",
    textScore,
    textLabel:
      textModel?.label ||
      textModel?.result_text ||
      (textModelError ? "Text model offline" : "Text model"),
    textError: textModelError,
    signals: ["phishguard api"],
    source: "server"
  };
}

function parseHtmlPrediction(html) {
  if (!html) return null;
  const probMatch = html.match(/Phishing Probability:<\/b>\s*([0-9.]+)%/i);
  const tagMatch = html.match(/class="tag\s+(legit|phish)"/i);
  const resultMatch = html.match(/<b>Result:<\/b>\s*([^<]+)/i);
  const resultText = resultMatch ? resultMatch[1].trim() : null;
  const isPhish = tagMatch ? tagMatch[1].toLowerCase() === "phish" : null;
  const score = probMatch ? Number(probMatch[1]) / 100 : isPhish === true ? 0.85 : 0.15;
  if (!Number.isFinite(score)) return null;
  return {
    score,
    label: resultText || (isPhish ? "Phishing Website" : "Legit Website"),
    urlScore: score,
    urlLabel: resultText || (isPhish ? "Phishing Website" : "Legit Website"),
    signals: ["phishguard api"],
    source: "server"
  };
}

export async function pingBackend() {
  const settings = await getSettings();
  const base = settings.mlBaseUrl || "http://localhost:8000";
  const url = joinUrl(base, settings.mlHealthPath || "/");
  const started = performance.now();
  try {
    const response = await withTimeout(fetch(url, { method: "GET" }), 2500);
    return {
      ok: response.ok,
      latency: `${Math.round(performance.now() - started)}ms`
    };
  } catch (error) {
    return { ok: false, latency: "--" };
  }
}

export async function analyzeText(payload, _plugins = []) {
  const settings = await getSettings();
  const base = settings.mlBaseUrl || "http://localhost:8000";
  const path = settings.mlPath || "/predict";
  const modelType = settings.mlModelType || "xgboost";
  const url = joinUrl(base, path);

  if (!payload?.url) {
    return localUrlScore(payload || {});
  }

  try {
    console.log("[PhishShield] ML request", { url, target: payload.url, modelType });
    const form = new URLSearchParams();
    form.set("url", payload.url);
    form.set("model_type", modelType);
    if (payload.text) {
      form.set("text", payload.text);
    }

    const response = await withTimeout(
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json"
        },
        body: form.toString()
      }),
      REQUEST_TIMEOUT
    );
    const contentType = response.headers.get("content-type") || "";
    console.log("[PhishShield] ML response", response.status, contentType);
    if (!response.ok) {
      throw new Error(`ML responded ${response.status}`);
    }
    if (contentType.includes("application/json")) {
      const data = await response.json();
      const combined = normalizeCombinedJson(data);
      if (combined) return combined;
      const normalized = normalizeJson(data);
      if (normalized) return normalized;
    }
    const html = await response.text();
    const parsed = parseHtmlPrediction(html);
    if (parsed) return parsed;
    throw new Error("Unexpected response");
  } catch (error) {
    console.warn("[PhishShield] ML fallback", error);
    const fallback = localUrlScore(payload);
    fallback.urlScore = fallback.score;
    fallback.urlLabel = fallback.label || "URL heuristic";
    fallback.textLabel = "Text model offline";
    fallback.signals = [...(fallback.signals || []), "fallback: server"];
    return fallback;
  }
}
