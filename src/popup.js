import {
  countActive,
  getLastScan,
  getPluginState,
  getSettings,
  renderPluginGrid,
  riskLabel,
  setPluginState,
  setSettings,
  updatePluginSetting,
  formatTime
} from "./plugins.js";

async function updateStatus() {
  const lastScan = await getLastScan();
  if (!lastScan) {
    const ledgerCount = document.getElementById("ledgerCount");
    if (ledgerCount) {
      ledgerCount.textContent = "0 reports";
    }
    return;
  }
  const riskMeter = document.getElementById("riskMeter");
  const riskLabelEl = document.getElementById("riskLabel");
  const scanTime = document.getElementById("scanTime");
  const engineLabel = document.getElementById("engineLabel");
  const signalList = document.getElementById("signalList");
  const ledgerCount = document.getElementById("ledgerCount");
  const urlMetric = document.getElementById("urlMetric");
  const textMetric = document.getElementById("textMetric");

  const score = Number(lastScan.riskScore || 0);
  riskMeter.style.setProperty("--risk", Math.min(score, 1));
  riskLabelEl.textContent = riskLabel(score);
  scanTime.textContent = `Last scan: ${formatTime(lastScan.at)}`;
  engineLabel.textContent = `Engine: ${lastScan.engine}`;
  if (ledgerCount) {
    const count = lastScan.ledgerCount || 0;
    ledgerCount.textContent = `${count} report${count === 1 ? "" : "s"}`;
  }
  if (urlMetric) {
    if (Number.isFinite(lastScan.urlScore)) {
      const score = Math.round(lastScan.urlScore * 100);
      urlMetric.textContent = `${score}% | ${lastScan.urlLabel || "URL model"}`;
    } else {
      urlMetric.textContent = "--";
    }
  }
  if (textMetric) {
    if (Number.isFinite(lastScan.textScore)) {
      const score = Math.round(lastScan.textScore * 100);
      textMetric.textContent = `${score}% | ${lastScan.textLabel || "Text model"}`;
    } else {
      textMetric.textContent = lastScan.textLabel || "Text model offline";
    }
  }

  signalList.innerHTML = "";
  if (lastScan.signals && lastScan.signals.length) {
    lastScan.signals.slice(0, 4).forEach((signal) => {
      const p = document.createElement("p");
      p.textContent = signal;
      signalList.append(p);
    });
  } else {
    const p = document.createElement("p");
    p.textContent = "No active signals yet.";
    signalList.append(p);
  }
}

async function updatePluginGrid() {
  const registry = await getPluginState();
  const activeCount = document.getElementById("activeCount");
  activeCount.textContent = countActive(registry.plugins);

  renderPluginGrid(document.getElementById("pluginGrid"), registry.plugins, {
    limit: 4,
    compact: true,
    onToggle: async (pluginId, enabled) => {
      await setPluginState(pluginId, { enabled });
      updatePluginGrid();
    },
    onSettingChange: async (pluginId, settingId, value) => {
      await updatePluginSetting(pluginId, settingId, value);
    }
  });
}

async function updateSettings() {
  const settings = await getSettings();
  const autoScanToggle = document.getElementById("autoScanToggle");
  const deepScanToggle = document.getElementById("deepScanToggle");

  autoScanToggle.checked = settings.autoScan;
  deepScanToggle.checked = settings.deepScan;

  autoScanToggle.addEventListener("change", async () => {
    await setSettings({ autoScan: autoScanToggle.checked });
  });

  deepScanToggle.addEventListener("change", async () => {
    await setSettings({ deepScan: deepScanToggle.checked });
  });
}

async function wireActions() {
  document.getElementById("scanNow").addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { type: "PHISHING_SCAN_NOW" });
  });

  document
    .getElementById("openOptions")
    .addEventListener("click", () => chrome.runtime.openOptionsPage());

  const modelStatus = document.getElementById("modelStatus");
  chrome.runtime.sendMessage({ type: "PHISHING_PING" }, (response) => {
    if (response?.ok) {
      modelStatus.textContent =
        response.latency === "local"
          ? "Local model active"
          : `Backend online (${response.latency})`;
    } else {
      modelStatus.textContent = "Model offline (local fallback)";
    }
  });

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });
  if (tab?.url) {
    chrome.runtime.sendMessage(
      { type: "LEDGER_STATUS", payload: { url: tab.url } },
      (response) => {
        const ledgerCount = document.getElementById("ledgerCount");
        if (!ledgerCount || !response?.ok) return;
        const count = response.info?.count || 0;
        ledgerCount.textContent = `${count} report${count === 1 ? "" : "s"}`;
      }
    );
  }

  const ledgerReport = document.getElementById("ledgerReport");
  if (ledgerReport) {
    ledgerReport.addEventListener("click", async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });
      if (!tab?.url) return;
      ledgerReport.textContent = "Reporting...";
      chrome.runtime.sendMessage(
        { type: "LEDGER_REPORT", payload: { url: tab.url } },
        (response) => {
          if (response?.ok) {
            ledgerReport.textContent = "Reported";
          } else {
            ledgerReport.textContent = "Report failed";
          }
          setTimeout(() => {
            ledgerReport.textContent = "Report this domain";
          }, 2000);
          updateStatus();
        }
      );
    });
  }
}

async function init() {
  await updateSettings();
  await updatePluginGrid();
  await updateStatus();
  await wireActions();
}

init();
