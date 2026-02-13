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
    return;
  }
  const riskMeter = document.getElementById("riskMeter");
  const riskLabelEl = document.getElementById("riskLabel");
  const scanTime = document.getElementById("scanTime");
  const engineLabel = document.getElementById("engineLabel");
  const signalList = document.getElementById("signalList");

  const score = Number(lastScan.riskScore || 0);
  riskMeter.style.setProperty("--risk", Math.min(score, 1));
  riskLabelEl.textContent = riskLabel(score);
  scanTime.textContent = `Last scan: ${formatTime(lastScan.at)}`;
  engineLabel.textContent = `Engine: ${lastScan.engine}`;

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
      modelStatus.textContent = "Model offline";
    }
  });
}

async function init() {
  await updateSettings();
  await updatePluginGrid();
  await updateStatus();
  await wireActions();
}

init();
