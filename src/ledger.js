const LEDGER_KEY = "ledgerChain";

const EMPTY_HEAD = "0".repeat(64);

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

function bufferToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return bufferToHex(hash);
}

async function loadLedger() {
  return new Promise((resolve) => {
    chrome.storage.local.get([LEDGER_KEY], (result) => {
      const ledger = result[LEDGER_KEY] || {
        head: EMPTY_HEAD,
        chain: [],
        domains: {}
      };
      resolve(ledger);
    });
  });
}

async function saveLedger(ledger) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [LEDGER_KEY]: ledger }, () => resolve());
  });
}

export async function hashDomain(raw) {
  const domain = normalizeDomain(raw);
  if (!domain) return { domain: "", hash: "" };
  const hash = await sha256Hex(domain);
  return { domain, hash };
}

export async function getLedgerInfo(raw) {
  const { hash } = await hashDomain(raw);
  if (!hash) {
    return { hash: "", count: 0, lastAt: null };
  }
  const ledger = await loadLedger();
  const record = ledger.domains[hash];
  return {
    hash,
    count: record?.count || 0,
    lastAt: record?.lastAt || null
  };
}

export async function addLedgerEntry(raw, source = "manual") {
  const { domain, hash } = await hashDomain(raw);
  if (!hash) {
    return { ok: false, error: "Invalid domain." };
  }
  const ledger = await loadLedger();
  const now = Date.now();
  const prevHash = ledger.head || EMPTY_HEAD;
  const chainHash = await sha256Hex(`${prevHash}|${hash}|${now}|${source}`);

  const entry = {
    hash,
    domain,
    at: now,
    source,
    prevHash,
    chainHash
  };

  ledger.chain.unshift(entry);
  ledger.chain = ledger.chain.slice(0, 500);
  ledger.head = chainHash;

  const record = ledger.domains[hash] || { count: 0, lastAt: null };
  record.count += 1;
  record.lastAt = now;
  ledger.domains[hash] = record;

  await saveLedger(ledger);
  return { ok: true, hash, domain, count: record.count, lastAt: record.lastAt };
}

export async function shouldAutoReport(raw, cooldownMs = 1000 * 60 * 60 * 12) {
  const info = await getLedgerInfo(raw);
  if (!info.lastAt) return true;
  return Date.now() - info.lastAt > cooldownMs;
}
