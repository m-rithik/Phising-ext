(() => {
  const DEFAULT_SETTINGS = {
    autoScan: true,
    deepScan: false,
    globalThreshold: 0.7
  };
  const MAX_TEXT = 6000;
  const SCAN_COOLDOWN = 5000;
  let lastScanAt = 0;
  let bannerEl = null;

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
        <strong>Phishing Alert</strong>
        <p id="phishBannerCopy"></p>
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
    const copy = bannerEl.querySelector("#phishBannerCopy");
    copy.textContent = `Risk ${Math.round(
      (result.riskScore || 0) * 100
    )}% | ${result.label || "phishing detected"}`;
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
    lastScanAt = now;

    const settings = await getSettings();
    if (!settings.autoScan && trigger !== "manual") {
      return;
    }

    const payload = {
      text: collectText(),
      url: window.location.href,
      title: document.title,
      lang: document.documentElement.lang || "",
      links: collectLinks(),
      forms: collectForms(),
      source: trigger
    };

    chrome.runtime.sendMessage(
      { type: "PHISHING_ANALYZE", payload },
      (result) => {
        if (!result) return;
        if (result.riskScore >= result.threshold) {
          showBanner(result);
        } else {
          clearBanner();
        }
      }
    );
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
})();
