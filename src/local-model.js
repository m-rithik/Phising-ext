const SHORTENERS = new Set([
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "cutt.ly",
  "buff.ly",
  "is.gd",
  "soo.gd",
  "s.id",
  "rebrand.ly"
]);

const SUSPICIOUS_TLDS = new Set([
  "tk",
  "ml",
  "ga",
  "cf",
  "gq",
  "xyz",
  "top",
  "zip",
  "mov",
  "cam",
  "cfd",
  "gdn",
  "icu",
  "link",
  "click",
  "work",
  "support",
  "monster",
  "stream",
  "bond",
  "loan",
  "life",
  "asia"
]);

const SUSPICIOUS_QUERY_KEYS = new Set([
  "redirect",
  "redirect_url",
  "url",
  "next",
  "target",
  "dest",
  "destination",
  "continue",
  "return",
  "session",
  "token",
  "auth",
  "login"
]);

const SUSPICIOUS_WORDS = [
  "login",
  "signin",
  "secure",
  "account",
  "verify",
  "update",
  "wallet",
  "bank",
  "payment",
  "otp",
  "password",
  "refund"
];

function safeUrl(raw) {
  if (!raw) return null;
  let value = raw.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }
  try {
    return new URL(value);
  } catch (error) {
    return null;
  }
}

function isIp(hostname) {
  if (!hostname) return false;
  const ipv4 =
    /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
  const ipv6 = /^[0-9a-f:]+$/i;
  return ipv4.test(hostname) || (hostname.includes(":") && ipv6.test(hostname));
}

function countOccurrences(text, token) {
  if (!text || !token) return 0;
  return (text.match(new RegExp(token, "gi")) || []).length;
}

function shannonEntropy(value) {
  if (!value) return 0;
  const cleaned = value.replace(/[^a-z0-9]/gi, "");
  if (!cleaned) return 0;
  const map = new Map();
  for (const char of cleaned) {
    map.set(char, (map.get(char) || 0) + 1);
  }
  let entropy = 0;
  const length = cleaned.length;
  for (const count of map.values()) {
    const p = count / length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function countParams(query) {
  if (!query) return { count: 0, keys: [] };
  try {
    const params = new URLSearchParams(query);
    const keys = Array.from(params.keys());
    return { count: keys.length, keys };
  } catch (error) {
    const parts = query.replace(/^\?/, "").split("&").filter(Boolean);
    const keys = parts.map((part) => part.split("=")[0]).filter(Boolean);
    return { count: keys.length, keys };
  }
}

export function localUrlScore(payload) {
  const url = safeUrl(payload.url || "");
  const signals = [];
  let score = 0.06;

  if (!url) {
    return {
      score: 0,
      label: "unknown",
      signals: ["invalid url"],
      source: "local"
    };
  }

  const href = url.href;
  const hostname = url.hostname.replace(/^www\./i, "");
  const pathname = url.pathname || "";
  const query = url.search || "";

  const hasAt = href.includes("@");
  const hasIp = isIp(hostname);
  const shortener = SHORTENERS.has(hostname);
  const hasDash = hostname.includes("-");
  const doubleSlash = href.replace(/^https?:\/\//i, "").includes("//");
  const parts = hostname.split(".");
  const subdomainCount = Math.max(0, parts.length - 2);
  const tld = parts[parts.length - 1] || "";
  const tldSuspicious = SUSPICIOUS_TLDS.has(tld);
  const dashCount = (hostname.match(/-/g) || []).length;
  const urlLength = href.length;
  const pathLength = pathname.length;
  const httpTokens = countOccurrences(pathname + query, "http");
  const nonHttps = url.protocol !== "https:";
  const digitCount = (hostname.match(/\d/g) || []).length;
  const digitRatio = hostname.length ? digitCount / hostname.length : 0;
  const port = url.port ? Number(url.port) : null;
  const entropy = shannonEntropy(hostname);
  const { count: paramCount, keys: paramKeys } = countParams(query);
  const hasSuspiciousParam = paramKeys.some((key) =>
    SUSPICIOUS_QUERY_KEYS.has((key || "").toLowerCase())
  );
  const punycode = hostname.includes("xn--");
  const suspiciousWord = SUSPICIOUS_WORDS.find((word) =>
    href.toLowerCase().includes(word)
  );

  if (hasIp) {
    score += 0.28;
    signals.push("ip address in url");
  }
  if (hasAt) {
    score += 0.2;
    signals.push("@ symbol in url");
  }
  if (shortener) {
    score += 0.22;
    signals.push("url shortener");
  }
  if (punycode) {
    score += 0.18;
    signals.push("punycode domain");
  }
  if (tldSuspicious) {
    score += 0.18;
    signals.push("risky tld");
  }
  if (hasDash) {
    score += 0.08;
    signals.push("dash in domain");
  }
  if (dashCount >= 4) {
    score += 0.08;
    signals.push("many dashes");
  }
  if (doubleSlash) {
    score += 0.12;
    signals.push("redirecting slashes");
  }
  if (subdomainCount >= 3) {
    score += 0.14;
    signals.push("many subdomains");
  }
  if (urlLength > 115) {
    score += 0.18;
    signals.push("very long url");
  } else if (urlLength > 75) {
    score += 0.1;
    signals.push("long url");
  }
  if (hostname.length > 40) {
    score += 0.14;
    signals.push("very long domain");
  } else if (hostname.length > 30) {
    score += 0.1;
    signals.push("long domain");
  }
  if (pathLength > 35) {
    score += 0.08;
    signals.push("long path");
  }
  if (query.length > 140) {
    score += 0.18;
    signals.push("very long query");
  } else if (query.length > 80) {
    score += 0.12;
    signals.push("long query");
  }
  if (paramCount >= 6) {
    score += 0.12;
    signals.push("many parameters");
  } else if (paramCount >= 3) {
    score += 0.08;
    signals.push("multiple parameters");
  }
  if (hasSuspiciousParam) {
    score += 0.12;
    signals.push("suspicious redirect param");
  }
  if (httpTokens > 0) {
    score += 0.1;
    signals.push("http token in path");
  }
  if (port && ![80, 443].includes(port)) {
    score += 0.1;
    signals.push("nonstandard port");
  }
  if (nonHttps) {
    score += 0.05;
    signals.push("non-https");
  }
  if (digitRatio >= 0.3) {
    score += 0.12;
    signals.push("digit-heavy domain");
  } else if (digitCount >= 4) {
    score += 0.06;
    signals.push("many digits in domain");
  }
  if (entropy >= 4) {
    score += 0.14;
    signals.push("random-looking domain");
  } else if (entropy >= 3.5) {
    score += 0.1;
    signals.push("high entropy domain");
  }
  if (suspiciousWord) {
    score += 0.08;
    signals.push(`keyword: ${suspiciousWord}`);
  }

  score = Math.min(0.98, score);
  const label =
    score >= 0.7 ? "phishing" : score >= 0.4 ? "suspicious" : "legitimate";

  return { score, label, signals, source: "local" };
}
