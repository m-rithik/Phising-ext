import {
  countActive,
  getLastScan,
  getPluginState,
  getSettings,
  renderPluginGrid,
  setCustomPlugins,
  setPluginState,
  setSettings,
  updatePluginSetting,
  storageGet,
  STORAGE_KEYS
} from "./plugins.js";

function updateOverview(registry, lastScan) {
  document.getElementById("langCount").textContent =
    registry.languages?.length || 0;
  document.getElementById("pluginCount").textContent = countActive(
    registry.plugins
  );
  document.getElementById("lastScan").textContent = lastScan
    ? riskSummary(lastScan)
    : "--";
}

function riskSummary(lastScan) {
  const score = lastScan?.riskScore ?? 0;
  return `${Math.round(score * 100)}%`;
}

async function updatePluginGrid() {
  const registry = await getPluginState();
  renderPluginGrid(document.getElementById("pluginGrid"), registry.plugins, {
    onToggle: async (pluginId, enabled) => {
      await setPluginState(pluginId, { enabled });
      const refreshed = await getPluginState();
      updateOverview(refreshed, await getLastScan());
    },
    onSettingChange: async (pluginId, settingId, value) => {
      await updatePluginSetting(pluginId, settingId, value);
    }
  });
  updateOverview(registry, await getLastScan());
}

async function hydrateSettings() {
  const settings = await getSettings();
  document.getElementById("mlBaseUrl").value = settings.mlBaseUrl || "";
  document.getElementById("mlPath").value = settings.mlPath || "/predict";
  document.getElementById("mlHealthPath").value =
    settings.mlHealthPath || "/health";
  document.getElementById("apiKey").value = settings.apiKey || "";
  document.getElementById("autoScan").checked = settings.autoScan;
  document.getElementById("deepScan").checked = settings.deepScan;
  document.getElementById("storeHistory").checked = settings.storeHistory;

  const threshold = document.getElementById("globalThreshold");
  const thresholdValue = document.getElementById("globalThresholdValue");
  threshold.value = settings.globalThreshold;
  thresholdValue.textContent = settings.globalThreshold;
  threshold.addEventListener("input", () => {
    thresholdValue.textContent = threshold.value;
  });
}

async function saveSettings() {
  const updated = {
    mlBaseUrl: document.getElementById("mlBaseUrl").value.trim(),
    mlPath: document.getElementById("mlPath").value.trim() || "/predict",
    mlHealthPath:
      document.getElementById("mlHealthPath").value.trim() || "/health",
    apiKey: document.getElementById("apiKey").value.trim(),
    autoScan: document.getElementById("autoScan").checked,
    deepScan: document.getElementById("deepScan").checked,
    storeHistory: document.getElementById("storeHistory").checked,
    globalThreshold: Number(document.getElementById("globalThreshold").value)
  };
  await setSettings(updated);
}

function attachActions() {
  document.getElementById("saveSettings").addEventListener("click", saveSettings);
  document
    .getElementById("testConnection")
    .addEventListener("click", async () => {
      const status = document.getElementById("mlStatus");
      const latency = document.getElementById("mlLatency");
      status.textContent = "Checking...";
      chrome.runtime.sendMessage({ type: "PHISHING_PING" }, (response) => {
        if (response?.ok) {
          status.textContent = "Online";
          latency.textContent = response.latency;
        } else {
          status.textContent = "Offline";
          latency.textContent = "--";
        }
      });
    });

  document.getElementById("resetPlugins").addEventListener("click", async () => {
    await setCustomPlugins([]);
    await chrome.storage.sync.set({ [STORAGE_KEYS.plugins]: {} });
    await updatePluginGrid();
  });

  document
    .getElementById("pluginImport")
    .addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const parsed = JSON.parse(text);
        const list = Array.isArray(parsed) ? parsed : parsed.plugins;
        if (!Array.isArray(list)) {
          throw new Error("Invalid plugin list");
        }
        const sanitized = list
          .filter((plugin) => plugin?.id && plugin?.name)
          .map((plugin) => ({
            ...plugin,
            defaultEnabled: plugin.defaultEnabled ?? false
          }));
        await setCustomPlugins(sanitized);
        await updatePluginGrid();
      } catch (error) {
        console.error(error);
      }
    });

  document.getElementById("exportConfig").addEventListener("click", async () => {
    const settings = await getSettings();
    const stored = await storageGet([STORAGE_KEYS.plugins]);
    const payload = {
      settings,
      plugins: stored.plugins || {}
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "phishing-shield-config.json";
    anchor.click();
    URL.revokeObjectURL(url);
  });
}

async function init() {
  await hydrateSettings();
  await updatePluginGrid();
  attachActions();

  const lastScan = await getLastScan();
  if (lastScan) {
    document.getElementById("lastScan").textContent = `${Math.round(
      (lastScan.riskScore || 0) * 100
    )}%`;
  }

  const status = document.getElementById("mlStatus");
  const latency = document.getElementById("mlLatency");
  chrome.runtime.sendMessage({ type: "PHISHING_PING" }, (response) => {
    if (response?.ok) {
      status.textContent = "Online";
      latency.textContent = response.latency;
    } else {
      status.textContent = "Offline";
      latency.textContent = "--";
    }
  });
}

init();
