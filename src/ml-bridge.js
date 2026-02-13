import { getSettings } from "./plugins.js";

const REQUEST_TIMEOUT = 8000;

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

export async function pingBackend() {
  const settings = await getSettings();
  const url = joinUrl(settings.mlBaseUrl, settings.mlHealthPath);
  const started = performance.now();
  try {
    const response = await withTimeout(fetch(url, { method: "GET" }), 3000);
    const ok = response.ok;
    return {
      ok,
      latency: `${Math.round(performance.now() - started)}ms`
    };
  } catch (error) {
    return { ok: false, latency: "--" };
  }
}

function normalizeResponse(payload, response) {
  if (!response || typeof response !== "object") {
    return null;
  }
  const score =
    response.risk_score ??
    response.riskScore ??
    response.score ??
    response.probability ??
    0;
  const label = response.label || response.prediction || "unknown";
  const signals = response.signals || response.reasons || [];
  return {
    score: Number(score),
    label,
    signals: Array.isArray(signals) ? signals : [],
    source: "ml"
  };
}

function heuristicScore(payload) {
  const text = (payload.text || "").toLowerCase();
  const signals = [];
  let score = 0.12;

  const bump = (regex, weight, label) => {
    if (regex.test(text)) {
      score += weight;
      signals.push(label);
    }
  };

  bump(
    /(otp|one time password|verification code|pin|password|login|signin)/i,
    0.28,
    "credential bait"
  );
  bump(
    /(bank|account|kyc|suspend|blocked|verify|update|refund|reward|lottery|gift)/i,
    0.22,
    "account urgency"
  );
  bump(
    /(upi|paytm|gpay|phonepe|bhim|netbank|ifsc|wallet|debit|credit)/i,
    0.2,
    "payment lure"
  );
  bump(/(click|tap|open|link|download|install)/i, 0.12, "link push");

  if (payload.links?.length) {
    const shorteners = /(bit\.ly|tinyurl\.com|t\.co|goo\.gl)/i;
    const suspicious = payload.links.filter((link) => shorteners.test(link));
    if (suspicious.length) {
      score += 0.18;
      signals.push("shortened links");
    }
    const httpLinks = payload.links.filter((link) => link.startsWith("http://"));
    if (httpLinks.length) {
      score += 0.14;
      signals.push("insecure links");
    }
  }

  if (payload.forms?.length) {
    score += 0.15;
    signals.push("sensitive form");
  }

  score = Math.min(0.98, score);
  return {
    score,
    label: score >= 0.7 ? "phishing" : "suspicious",
    signals,
    source: "heuristic"
  };
}

export async function analyzeText(payload, plugins) {
  const settings = await getSettings();
  const url = joinUrl(settings.mlBaseUrl, settings.mlPath);
  const activePlugins = (plugins || [])
    .filter((plugin) => plugin.enabled)
    .map((plugin) => ({
      id: plugin.id,
      endpoint: plugin.endpoint,
      settings: plugin.settingsMap || {}
    }));

  const body = {
    text: payload.text || "",
    url: payload.url || "",
    title: payload.title || "",
    lang: payload.lang || "",
    links: payload.links || [],
    forms: payload.forms || [],
    plugins: activePlugins,
    metadata: {
      deepScan: settings.deepScan,
      source: payload.source || "page"
    }
  };

  try {
    const response = await withTimeout(
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {})
        },
        body: JSON.stringify(body)
      }),
      REQUEST_TIMEOUT
    );
    if (!response.ok) {
      throw new Error(`ML responded ${response.status}`);
    }
    const data = await response.json();
    const normalized = normalizeResponse(payload, data);
    if (normalized) {
      return normalized;
    }
    throw new Error("Unexpected response");
  } catch (error) {
    return heuristicScore(payload);
  }
}
