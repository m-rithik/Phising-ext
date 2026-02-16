(() => {
  const DEFAULT_SETTINGS = {
    autoScan: true,
    deepScan: false,
    globalThreshold: 0.7
  };
  const MAX_TEXT = 6000;
  const SCAN_COOLDOWN = 1200;
  let lastScanAt = 0;
  let bannerEl = null;
  let bannerTimer = null;
  let lastUrl = window.location.href;
  let scanInFlight = false;

  function getSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(["settings"], (result) => {
        resolve({ ...DEFAULT_SETTINGS, ...(result.settings || {}) });
      });
    });
  }

  function collectText() {
    const text = document.body?.innerText || "";
    return text.slice(0, MAX_TEXT);
  }

  function collectLinks() {
    const links = Array.from(document.querySelectorAll("a[href]")).map(
      (link) => link.href
    );
    return links.slice(0, 40);
  }

  function collectForms() {
    const forms = Array.from(document.querySelectorAll("form")).map((form) => {
      const inputs = Array.from(form.querySelectorAll("input"));
      const sensitive = inputs.some((input) => {
        const type = (input.getAttribute("type") || "").toLowerCase();
        const hint = `${input.name || ""} ${input.placeholder || ""}`.toLowerCase();
        return (
          ["password", "tel", "number"].includes(type) ||
          /otp|pin|password|passcode|bank|account/.test(hint)
        );
      });
      return { inputs: inputs.length, sensitive };
    });
    return forms.slice(0, 10);
  }

  function showBanner(result) {
    if (!bannerEl) {
      bannerEl = document.createElement("div");
      bannerEl.className = "phish-shield-banner";
      bannerEl.innerHTML = `
        <strong id="phishBannerTitle">Scan complete</strong>
        <p id="phishBannerCopy"></p>
        <p id="phishBannerMetrics" class="phish-banner-metrics"></p>
        <button type="button" id="phishBannerDismiss">Dismiss</button>
      `;
      document.body.appendChild(bannerEl);
      bannerEl
        .querySelector("#phishBannerDismiss")
        .addEventListener("click", () => {
          bannerEl?.remove();
          bannerEl = null;
        });
    }
    if (bannerTimer) {
      clearTimeout(bannerTimer);
      bannerTimer = null;
    }
    const title = bannerEl.querySelector("#phishBannerTitle");
    const copy = bannerEl.querySelector("#phishBannerCopy");
    const metrics = bannerEl.querySelector("#phishBannerMetrics");
    if (result?.state === "scanning") {
      bannerEl.dataset.level = "low";
      title.textContent = "Scanning";
      copy.textContent = "Analyzing current page...";
      if (metrics) metrics.textContent = "";
      return;
    }
    const scorePercent = Math.round((result.riskScore || 0) * 100);
    const isHigh = result.riskScore >= result.threshold;
    bannerEl.dataset.level = isHigh ? "high" : "low";
    title.textContent = isHigh ? "Phishing alert" : "Scan complete";
    copy.textContent = `Risk ${scorePercent}% | ${result.label || "analysis"} | ${result.engine || "local"}`;
    if (metrics) {
      const urlScore = Number.isFinite(result.urlScore)
        ? Math.round(result.urlScore * 100)
        : null;
      const textScore = Number.isFinite(result.textScore)
        ? Math.round(result.textScore * 100)
        : null;
      const urlLabel = result.urlLabel || "URL model";
      const textLabel =
        result.textLabel ||
        (Number.isFinite(result.textScore) ? "Text model" : "Text model offline");
      const urlPart = `${urlScore !== null ? urlScore + "%" : "--"} | ${urlLabel}`;
      const textPart = `${textScore !== null ? textScore + "%" : "--"} | ${textLabel}`;
      metrics.textContent = `URL ${urlPart} | TEXT ${textPart}`;
    }
    if (!isHigh) {
      bannerTimer = setTimeout(() => {
        clearBanner();
      }, 5000);
    }
  }

  function clearBanner() {
    if (bannerEl) {
      bannerEl.remove();
      bannerEl = null;
    }
  }

  async function runScan(trigger) {
    const now = Date.now();
    if (now - lastScanAt < SCAN_COOLDOWN) return;
    if (scanInFlight) return;
    lastScanAt = now;

    const settings = await getSettings();
    if (!settings.autoScan && trigger !== "manual") {
      scanInFlight = false;
      return;
    }
    scanInFlight = true;

    const pageText = collectText();
    const payload = {
      text: settings.deepScan ? pageText : pageText.slice(0, 800),
      url: window.location.href,
      title: document.title,
      lang: document.documentElement.lang || "",
      links: settings.deepScan ? collectLinks() : [],
      forms: settings.deepScan ? collectForms() : [],
      source: trigger
    };

    showBanner({ state: "scanning" });

    let responded = false;
    const fallbackTimer = setTimeout(() => {
      if (responded) return;
      showBanner({
        riskScore: 0,
        threshold: 1,
        label: "scan failed"
      });
      scanInFlight = false;
    }, 22000);

    chrome.runtime.sendMessage(
      { type: "PHISHING_ANALYZE", payload },
      (result) => {
        responded = true;
        clearTimeout(fallbackTimer);
        scanInFlight = false;
        if (chrome.runtime.lastError || !result) {
          showBanner({
            riskScore: 0,
            threshold: 1,
            label: "scan failed"
          });
          return;
        }
        showBanner(result);
      }
    );
  }

  function handleUrlChange() {
    if (window.location.href === lastUrl) return;
    lastUrl = window.location.href;
    runScan("navigation");
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "PHISHING_SCAN_NOW") {
      runScan("manual");
    }
  });

  if (document.readyState === "complete") {
    runScan("auto");
  } else {
    window.addEventListener("load", () => runScan("auto"), { once: true });
  }

  const originalPushState = history.pushState;
  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    window.dispatchEvent(new Event("phish-url-change"));
  };
  const originalReplaceState = history.replaceState;
  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    window.dispatchEvent(new Event("phish-url-change"));
  };

  window.addEventListener("phish-url-change", handleUrlChange);
  window.addEventListener("popstate", handleUrlChange);
  window.addEventListener("hashchange", handleUrlChange);
  setInterval(handleUrlChange, 1000);
})();
