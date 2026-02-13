import { getPluginState, getSettings, setLastScan } from "./plugins.js";
import { analyzeText, pingBackend } from "./ml-bridge.js";

async function handleAnalyze(payload) {
  const settings = await getSettings();
  const registry = await getPluginState();
  const result = await analyzeText(payload, registry.plugins);
  const riskScore = Number(result.score || 0);
  const threshold = Number(settings.globalThreshold || 0.7);
  const final = {
    riskScore,
    label: result.label || "unknown",
    signals: result.signals || [],
    engine: result.source || "ml",
    threshold,
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
    chrome.action.setBadgeBackgroundColor({ color: "#DB4A2B" });
  } else if (score >= 0.5) {
    chrome.action.setBadgeText({ text: "CHK" });
    chrome.action.setBadgeBackgroundColor({ color: "#F8A348" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) {
    return;
  }

  if (message.type === "PHISHING_ANALYZE") {
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
});
