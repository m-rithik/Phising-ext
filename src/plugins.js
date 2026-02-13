const REGISTRY_URL = chrome.runtime.getURL("plugins/registry.json");

export const STORAGE_KEYS = {
  settings: "settings",
  plugins: "plugins",
  customPlugins: "customPlugins",
  lastScan: "lastScan",
  scanHistory: "scanHistory"
};

export const DEFAULT_SETTINGS = {
  mlBaseUrl: "http://localhost:8000",
  mlPath: "/predict",
  mlHealthPath: "/health",
  apiKey: "",
  autoScan: true,
  deepScan: false,
  globalThreshold: 0.7,
  storeHistory: false
};

export function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(keys, (result) => resolve(result || {}));
  });
}

export function storageSet(payload) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(payload, () => resolve());
  });
}

export async function getSettings() {
  const stored = await storageGet([STORAGE_KEYS.settings]);
  return { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
}

export async function setSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await storageSet({ [STORAGE_KEYS.settings]: next });
  return next;
}

export async function getLastScan() {
  const stored = await storageGet([STORAGE_KEYS.lastScan]);
  return stored.lastScan || null;
}

export async function setLastScan(scan) {
  await storageSet({ [STORAGE_KEYS.lastScan]: scan });
  const settings = await getSettings();
  if (!settings.storeHistory) {
    return;
  }
  const stored = await storageGet([STORAGE_KEYS.scanHistory]);
  const history = stored.scanHistory || [];
  history.unshift(scan);
  await storageSet({ [STORAGE_KEYS.scanHistory]: history.slice(0, 30) });
}

export async function loadRegistry() {
  const response = await fetch(REGISTRY_URL);
  const base = await response.json();
  const stored = await storageGet([STORAGE_KEYS.customPlugins]);
  const customPlugins = Array.isArray(stored.customPlugins)
    ? stored.customPlugins
    : [];
  return {
    ...base,
    plugins: [...(base.plugins || []), ...customPlugins]
  };
}

export function mergePluginState(registry, storedPlugins = {}) {
  return (registry.plugins || []).map((plugin) => {
    const stored = storedPlugins[plugin.id] || {};
    const enabled =
      typeof stored.enabled === "boolean"
        ? stored.enabled
        : plugin.defaultEnabled ?? false;
    const settingsMap = buildSettingsMap(plugin, stored.settings || {});
    return { ...plugin, enabled, settingsMap };
  });
}

export async function getPluginState() {
  const [registry, stored] = await Promise.all([
    loadRegistry(),
    storageGet([STORAGE_KEYS.plugins])
  ]);
  const plugins = mergePluginState(registry, stored.plugins || {});
  return { ...registry, plugins };
}

export async function setPluginState(pluginId, patch) {
  const stored = await storageGet([STORAGE_KEYS.plugins]);
  const plugins = stored.plugins || {};
  const current = plugins[pluginId] || {};
  plugins[pluginId] = { ...current, ...patch };
  await storageSet({ [STORAGE_KEYS.plugins]: plugins });
}

export async function updatePluginSetting(pluginId, settingId, value) {
  const stored = await storageGet([STORAGE_KEYS.plugins]);
  const plugins = stored.plugins || {};
  const current = plugins[pluginId] || {};
  const settings = { ...(current.settings || {}) };
  settings[settingId] = value;
  plugins[pluginId] = { ...current, settings };
  await storageSet({ [STORAGE_KEYS.plugins]: plugins });
}

export async function setCustomPlugins(list) {
  await storageSet({ [STORAGE_KEYS.customPlugins]: list });
}

export function buildSettingsMap(plugin, storedSettings) {
  const map = {};
  (plugin.settings || []).forEach((setting) => {
    if (storedSettings && storedSettings[setting.id] !== undefined) {
      map[setting.id] = storedSettings[setting.id];
    } else {
      map[setting.id] = setting.value;
    }
  });
  return map;
}

export function countActive(plugins) {
  return plugins.filter((plugin) => plugin.enabled).length;
}

export function formatTime(value) {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function riskLabel(score) {
  if (score >= 0.8) return "High risk";
  if (score >= 0.6) return "Elevated";
  if (score >= 0.4) return "Caution";
  return "Monitoring";
}

export function renderPluginGrid(container, plugins, options = {}) {
  const { limit, compact, onToggle, onSettingChange } = options;
  container.innerHTML = "";
  const list = limit ? plugins.slice(0, limit) : plugins;

  list.forEach((plugin) => {
    const card = document.createElement("div");
    card.className = "plugin-card";

    const head = document.createElement("div");
    head.className = "plugin-card__head";

    const title = document.createElement("div");
    title.className = "plugin-card__title";
    title.textContent = plugin.name;

    const toggleWrap = document.createElement("label");
    toggleWrap.className = "switch";
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = plugin.enabled;
    toggle.addEventListener("change", () => {
      onToggle?.(plugin.id, toggle.checked);
    });
    const toggleSpan = document.createElement("span");
    toggleWrap.append(toggle, toggleSpan);

    head.append(title, toggleWrap);
    card.append(head);

    const meta = document.createElement("div");
    meta.className = "plugin-card__meta";
    meta.textContent = plugin.category || "Plugin";
    card.append(meta);

    const desc = document.createElement("p");
    desc.className = "plugin-card__desc";
    desc.textContent = plugin.description || "";
    card.append(desc);

    if (!compact) {
      const controls = document.createElement("div");
      controls.className = "plugin-card__controls";
      (plugin.settings || []).forEach((setting) => {
        const field = document.createElement("div");
        field.className = "field";

        const label = document.createElement("label");
        label.textContent = setting.label || setting.id;
        field.append(label);

        if (setting.type === "toggle") {
          const switchWrap = document.createElement("label");
          switchWrap.className = "switch";
          const input = document.createElement("input");
          input.type = "checkbox";
          input.checked = Boolean(plugin.settingsMap?.[setting.id]);
          input.addEventListener("change", () => {
            onSettingChange?.(plugin.id, setting.id, input.checked);
          });
          const span = document.createElement("span");
          switchWrap.append(input, span);
          field.append(switchWrap);
        } else if (setting.type === "select") {
          const select = document.createElement("select");
          (setting.options || []).forEach((option) => {
            const opt = document.createElement("option");
            opt.value = option;
            opt.textContent = option;
            if (plugin.settingsMap?.[setting.id] === option) {
              opt.selected = true;
            }
            select.append(opt);
          });
          select.addEventListener("change", () => {
            onSettingChange?.(plugin.id, setting.id, select.value);
          });
          field.append(select);
        } else {
          const range = document.createElement("input");
          range.type = "range";
          range.min = setting.min ?? 0;
          range.max = setting.max ?? 1;
          range.step = setting.step ?? 0.05;
          range.value = plugin.settingsMap?.[setting.id] ?? setting.value ?? 0;
          const value = document.createElement("div");
          value.className = "meta";
          value.textContent = range.value;
          range.addEventListener("input", () => {
            value.textContent = range.value;
          });
          range.addEventListener("change", () => {
            onSettingChange?.(plugin.id, setting.id, Number(range.value));
          });
          field.append(range, value);
        }

        controls.append(field);
      });

      if (plugin.endpoint) {
        const route = document.createElement("div");
        route.className = "meta";
        route.textContent = `Route ${plugin.endpoint}`;
        controls.append(route);
      }

      card.append(controls);
    }

    container.append(card);
  });
}
