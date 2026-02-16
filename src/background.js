import { getSettings, setLastScan } from "./plugins.js";
import { analyzeText, pingBackend } from "./ml-bridge.js";
import { addLedgerEntry, getLedgerInfo } from "./ledger.js";

function normalizeDomain(raw) {
  if (!raw) return "";
  let value = raw.trim().toLowerCase();
  if (!value) return "";
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }
  try {
    const url = new URL(value);
    return url.hostname.replace(/^www\./i, "");
  } catch (error) {
    return value
      .replace(/^https?:\/\//i, "")
      .split("/")[0]
      .replace(/^www\./i, "");
  }
}

function isTrustedDomain(url, list = []) {
  const domain = normalizeDomain(url);
  if (!domain || !Array.isArray(list) || list.length === 0) return false;
  return list.some((entry) => {
    const needle = String(entry || "").trim().toLowerCase();
    if (!needle) return false;
    if (needle.startsWith("*.")) {
      const suffix = needle.slice(1);
      return domain.endsWith(suffix);
    }
    if (needle.startsWith(".")) {
      return domain.endsWith(needle);
    }
    return domain === needle || domain.endsWith(`.${needle}`);
  });
}



function clampScore(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function fuseScores(urlScore, textScore) {
  const hasUrl = Number.isFinite(urlScore);
  const hasText = Number.isFinite(textScore);
  if (!hasUrl && !hasText) return 0;
  if (!hasText) return clampScore(urlScore);
  if (!hasUrl) return clampScore(textScore);

  const url = clampScore(urlScore);
  const text = clampScore(textScore);
  const high = Math.max(url, text);
  const low = Math.min(url, text);
  const disagree = high - low >= 0.45;

  if (disagree && low < 0.35) {
    return clampScore(0.7 * low + 0.3 * high);
  }

  return clampScore(0.65 * url + 0.35 * text);
}

function deriveLabel(score, urlScore, textScore, threshold) {
  if (score >= threshold) return "phishing";
  const hasUrl = Number.isFinite(urlScore);
  const hasText = Number.isFinite(textScore);
  const high = Math.max(hasUrl ? urlScore : 0, hasText ? textScore : 0);
  if (hasUrl && hasText && high >= threshold) return "review";
  return "legitimate";
}


async function handleAnalyze(payload) {
  const settings = await getSettings();
  const result = await analyzeText(payload);
  const threshold = Number(settings.globalThreshold || 0.7);
  const urlScore = Number.isFinite(result.urlScore)
    ? result.urlScore
    : Number(result.score || 0);
  const urlLabel = result.urlLabel || result.label || "URL model";
  const textScore = Number.isFinite(result.textScore)
    ? result.textScore
    : null;
  const textLabel =
    result.textLabel ||
    (Number.isFinite(result.textScore) ? "Text model" : "Text model offline");
  const textError = result.textError || null;
  const signals = [...(result.signals || [])];

  if (Number.isFinite(urlScore) && Number.isFinite(textScore)) {
    const high = Math.max(urlScore, textScore);
    const low = Math.min(urlScore, textScore);
    if (high - low >= 0.45) {
      signals.push("model disagreement");
    }
  }

  let riskScore = fuseScores(urlScore, textScore);

  if (isTrustedDomain(payload.url || "", settings.trustedDomains)) {
    const final = {
      riskScore: 0.02,
      label: "trusted domain",
      signals: ["trusted list"],
      engine: result.source || "ml",
      urlScore: 0.02,
      urlLabel: "trusted list",
      textScore: 0.02,
      textLabel: "trusted list",
      textError: null,
      threshold,
      ledgerCount: 0,
      at: Date.now(),
      url: payload.url || ""
    };
    await setLastScan(final);
    updateBadge(final);
    return final;
  }

  const ledgerInfo = settings.ledgerEnabled
    ? await getLedgerInfo(payload.url || "")
    : { count: 0 };
  if (ledgerInfo.count > 0) {
    const boost = Math.min(
      Number(settings.ledgerBoost || 0.18),
      0.35
    );
    riskScore = Math.min(0.98, riskScore + boost);
    signals.push("ledger reports");
  }

  const label = deriveLabel(riskScore, urlScore, textScore, threshold);

  const final = {
    riskScore,
    label,
    signals,
    engine: result.source || "ml",
    urlScore,
    urlLabel,
    textScore,
    textLabel,
    textError,
    threshold,
    ledgerCount: ledgerInfo.count || 0,
    at: Date.now(),
    url: payload.url || ""
  };

  await setLastScan(final);
  updateBadge(final);
  return final;
}

function updateBadge(result) {
  const score = result.riskScore || 0;
  if (score >= result.threshold) {
    chrome.action.setBadgeText({ text: "ALRT" });
    chrome.action.setBadgeBackgroundColor({ color: "#1F6BFF" });
  } else if (score >= 0.5) {
    chrome.action.setBadgeText({ text: "CHK" });
    chrome.action.setBadgeBackgroundColor({ color: "#3AA6FF" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) {
    return;
  }

  if (message.type === "PHISHING_ANALYZE") {
    console.log("[PhishShield] analyze request", message.payload?.url);
    handleAnalyze(message.payload || {})
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({
          riskScore: 0,
          label: "error",
          signals: [String(error.message || "analysis failed")],
          engine: "error",
          threshold: 1
        })
      );
    return true;
  }

  if (message.type === "PHISHING_PING") {
    pingBackend()
      .then((result) => sendResponse(result))
      .catch(() => sendResponse({ ok: false, latency: "--" }));
    return true;
  }

  if (message.type === "PHISHING_GET_STATUS") {
    getSettings()
      .then((settings) =>
        sendResponse({
          ok: true,
          settings
        })
      )
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === "LEDGER_REPORT") {
    addLedgerEntry(message.payload?.url || "", "manual")
      .then((result) => sendResponse(result))
      .catch(() =>
        sendResponse({ ok: false, error: "Unable to add ledger entry." })
      );
    return true;
  }

  if (message.type === "LEDGER_STATUS") {
    getLedgerInfo(message.payload?.url || "")
      .then((info) => sendResponse({ ok: true, info }))
      .catch(() => sendResponse({ ok: false, info: { count: 0 } }));
    return true;
  }
});
