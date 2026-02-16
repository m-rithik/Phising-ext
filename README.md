<![CDATA[<div align="center">

# 🛡️ Vernacular Phishing Shield — Browser Extension

**Chrome Extension for Real-Time Phishing Detection in Regional Indian Languages**

[![Chrome](https://img.shields.io/badge/Chrome-Manifest_V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

*A plugin-based browser extension that detects phishing in Hindi, Tamil, Telugu, Bengali, and 8 more Indian languages — powered by ML with local heuristic fallback.*

---

</div>

## 📋 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [System Architecture](#-system-architecture)
- [Plugin System](#-plugin-system)
- [Technical Implementation](#-technical-implementation)
- [Project Structure](#-project-structure)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [How It Works](#-how-it-works)
- [Security Features](#-security-features)
- [Real-World Applicability](#-real-world-applicability)
- [Performance](#-performance)
- [Contributing](#-contributing)

---

## 🎯 Overview

**Vernacular Phishing Shield** is a Chrome Manifest V3 extension that protects users browsing the web from phishing attacks crafted in regional Indian languages. It combines a **server-side ML backend** with a robust **client-side heuristic engine**, ensuring protection even when the backend is offline.

### Why This Extension?

| Problem | Our Solution |
|---------|-------------|
| Phishing tools only detect English threats | Supports 12 Indian languages + code-mixed text |
| Static blacklists miss new phishing domains | Real-time ML analysis of page content and URLs |
| Single-signal detection has blind spots | 12-plugin pipeline with multi-signal fusion scoring |
| Cloud-only detection has privacy concerns | Local heuristic fallback — no data leaves your browser |
| One-size-fits-all thresholds cause false alarms | Per-user configurable thresholds and trusted domains |

---

## ✨ Key Features

### 🔍 Dual-Model Detection Engine
- **Server-side ML** — DistilBERT/XLM-RoBERTa NLP model for text analysis + XGBoost for URL classification
- **Client-side heuristics** — 20+ URL-level signals scored locally in the browser (zero-latency fallback)

### 🌍 Multilingual Support
Detects phishing in **12 Indian languages**:

> Hindi • Bengali • Tamil • Telugu • Marathi • Kannada • Malayalam • Gujarati • Punjabi • Urdu • Hinglish (Code-Mix) • Romanized Indian text

### 🔌 Plugin Pipeline Architecture
12 modular security plugins covering language detection, URL risk analysis, credential harvesting, UPI scam guard, brand impersonation, form siphoning, QR phishing, and more.

### 🔗 Community Ledger (SHA-256 Hash Chain)
A local blockchain-inspired domain reporting system that boosts risk scores for previously flagged domains.

### ⚡ Auto & Manual Scanning
- **Auto Scan** — analyzes every page on load and navigation
- **Deep Scan** — sends extended page context (text, links, forms) for thorough analysis
- **Manual Scan** — on-demand scanning via popup button

---

## 🏗️ System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    BROWSER EXTENSION ARCHITECTURE                │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐     ┌──────────────────────┐               │
│  │  CONTENT SCRIPT  │────▶│  BACKGROUND SERVICE   │               │
│  │  (Per-Tab)       │     │  WORKER               │               │
│  │                  │     │                        │               │
│  │ • Page text      │     │  ┌──────────────────┐ │               │
│  │   collection     │     │  │   ML BRIDGE       │ │               │
│  │ • Link scanning  │     │  │                  │ │               │
│  │ • Form detection │     │  │ Server ──▶ JSON  │ │               │
│  │ • Banner display │     │  │ Server ──▶ HTML  │ │               │
│  │ • URL change     │     │  │ Fallback ──▶     │ │               │
│  │   monitoring     │     │  │   Local Model    │ │               │
│  └─────────────────┘     │  └──────────────────┘ │               │
│          ▲                │           │            │               │
│          │                │           ▼            │               │
│          │                │  ┌──────────────────┐ │               │
│          │                │  │  SCORING ENGINE   │ │               │
│          │                │  │                  │ │               │
│          │                │  │ • Score fusion   │ │               │
│          │                │  │ • Trusted domain │ │               │
│          │                │  │   check          │ │               │
│          │                │  │ • Ledger boost   │ │               │
│          │                │  │ • Label derive   │ │               │
│          │                │  └──────────────────┘ │               │
│          │                └──────────┬───────────┘               │
│          │                           │                            │
│          │                           ▼                            │
│  ┌───────┴────────────────────────────────────┐                  │
│  │              UI LAYER                       │                  │
│  │                                             │                  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐ │                  │
│  │  │  Popup   │  │ Options  │  │ In-Page  │ │                  │
│  │  │  Panel   │  │  Page    │  │  Banner  │ │                  │
│  │  │          │  │          │  │          │ │                  │
│  │  │• Risk    │  │• ML URL  │  │• Risk %  │ │                  │
│  │  │  meter   │  │• Plugins │  │• Alert   │ │                  │
│  │  │• Signals │  │• Trusted │  │  level   │ │                  │
│  │  │• Plugins │  │  domains │  │• Dismiss │ │                  │
│  │  │• Ledger  │  │• Export  │  │          │ │                  │
│  │  └──────────┘  └──────────┘  └──────────┘ │                  │
│  └─────────────────────────────────────────────┘                  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                  ┌──────────────────────┐
                  │  ML BACKEND (FastAPI) │
                  │  localhost:8000       │
                  │                      │
                  │  /predict            │
                  │  /detect/language    │
                  │  /detect/url-risk    │
                  │  /predict/intent/*   │
                  └──────────────────────┘
```

### Message Flow

```
Page Load ──▶ Content Script collects text/links/forms
         ──▶ Sends PHISHING_ANALYZE to Background Worker
         ──▶ ML Bridge sends to backend (or uses local model)
         ──▶ Score fusion (URL score × 0.65 + Text score × 0.35)
         ──▶ Trusted domain check → Ledger boost
         ──▶ Result sent back to Content Script
         ──▶ In-page banner displayed with risk level
         ──▶ Badge updated on extension icon
```

---

## 🔌 Plugin System

The extension features a **modular plugin architecture** with 12 security plugins organized by category:

### Language Plugins
| Plugin | ID | Description | Default |
|--------|----|-------------|---------|
| **Language ID** | `lang-id` | Identifies regional Indian languages and code-mix patterns | ✅ ON |
| **Code-Mix Mapper** | `code-mix` | Detects code-mixed segments hiding phishing intent across scripts | ✅ ON |
| **Transliteration Normalizer** | `transliteration-normalizer` | Normalizes romanized Hindi, Tamil, Telugu for better scoring | ✅ ON |

### Link & URL Plugins
| Plugin | ID | Description | Default |
|--------|----|-------------|---------|
| **URL Risk Analyzer** | `url-risk` | Analyzes shorteners, redirects, and unicode spoofing | ✅ ON |
| **QR Phish Scanner** | `qr-phish` | Flags QR payment and login traps in pages | ❌ OFF |

### Intent Detection Plugins
| Plugin | ID | Description | Default |
|--------|----|-------------|---------|
| **Credential Harvest Intent** | `credential-harvest` | Detects OTP, password, account takeover language | ✅ ON |
| **UPI Scam Guard** | `upi-guard` | Flags UPI, wallet, and refund bait in regional languages | ✅ ON |

### Brand & Channel Plugins
| Plugin | ID | Description | Default |
|--------|----|-------------|---------|
| **Brand Impersonation** | `bank-brand` | Detects bank/government brand spoofing in content | ✅ ON |
| **SMS & WhatsApp Lure** | `sms-lure` | Detects messaging-based phishing patterns | ✅ ON |

### Form & File Plugins
| Plugin | ID | Description | Default |
|--------|----|-------------|---------|
| **Form Siphon Guard** | `form-siphon` | Detects suspicious forms requesting OTP/PIN/banking data | ✅ ON |
| **Attachment Risk** | `attachment-risk` | Detects suspicious download bait and attachment callouts | ❌ OFF |
| **Voice Note Transcripts** | `voice-note` | Analyzes transcript hints for voice phishing/deepfakes | ❌ OFF |

### Plugin Configuration
Each plugin has configurable settings (thresholds, modes, sensitivity levels) adjustable via the **Options page**. Custom plugins can be imported via JSON files.

---

## 🔧 Technical Implementation

### Core Modules

#### 1. Content Script (`src/contentScript.js`)
Runs on every web page — responsible for:
- **Text Collection**: Extracts up to 6,000 characters of page content
- **Link Scanning**: Captures up to 40 `<a>` elements for URL analysis
- **Form Detection**: Identifies sensitive forms (password, OTP, PIN, bank fields)
- **Banner Rendering**: Shows phishing alerts with risk scores and signals
- **Navigation Monitoring**: Hooks into `pushState`, `replaceState`, `popstate`, and `hashchange` for SPA support
- **Scan Throttling**: 1.2-second cooldown prevents redundant scans

#### 2. Background Service Worker (`src/background.js`)
Central orchestration layer:
- **Score Fusion Algorithm**: Combines URL and text model scores using weighted averaging
  ```
  If both scores available: fused = 0.65 × URL_score + 0.35 × Text_score
  If models disagree (diff ≥ 0.45): fused = 0.70 × low + 0.30 × high
  ```
- **Trusted Domain Bypass**: Whitelisted domains get a fixed 0.02 risk score
- **Ledger Integration**: Community reports boost risk scores by configurable amount (default +0.18, max 0.35)
- **Label Derivation**: Maps numerical scores to `phishing`, `review`, or `legitimate`
- **Badge Updates**: Chrome action badge shows `ALRT` (high risk), `CHK` (moderate), or clear

#### 3. ML Bridge (`src/ml-bridge.js`)
Handles all communication with the ML backend:
- **Multi-Format Response Parsing**: Handles JSON, HTML, and combined response formats
- **Automatic Fallback**: Falls back to local heuristic model on backend timeout/failure
- **Configurable Endpoints**: Base URL, prediction path, health check, and model type
- **Request Timeout**: 20-second timeout with graceful degradation

#### 4. Local Heuristic Model (`src/local-model.js`)
Client-side URL analysis with **20+ heuristic signals**:

| Signal Category | Checks |
|----------------|--------|
| **IP Address** | Raw IP in URL (+0.28 risk) |
| **URL Shorteners** | bit.ly, tinyurl.com, etc. (+0.22) |
| **Suspicious TLDs** | .tk, .ml, .xyz, .zip, etc. (+0.18) |
| **Punycode Domains** | Internationalized domain spoofing (+0.18) |
| **@ Symbol** | Credential embedding (+0.20) |
| **URL Length** | >75 chars (+0.10), >115 chars (+0.18) |
| **Domain Length** | >30 chars (+0.10), >40 chars (+0.14) |
| **Subdomain Count** | ≥3 subdomains (+0.14) |
| **Digit Ratio** | High digit-to-letter ratio (+0.12) |
| **Shannon Entropy** | Random-looking domain detection (+0.14) |
| **Suspicious Keywords** | login, verify, password, otp, bank (+0.08) |
| **Query Parameters** | Redirect params, session tokens (+0.12) |
| **Non-HTTPS** | HTTP connection (+0.05) |
| **Non-Standard Port** | Unusual port numbers (+0.10) |

#### 5. Community Ledger (`src/ledger.js`)
A **SHA-256 hash chain** for community-driven domain reputation:
- Each report creates a cryptographic chain entry: `SHA256(prevHash | domainHash | timestamp | source)`
- Domains are hashed for privacy — actual URLs are not stored
- Up to 500 entries maintained in local storage
- Auto-report cooldown (12 hours) prevents spam
- Boosts risk score for previously flagged domains

#### 6. Plugin Manager (`src/plugins.js`)
Manages the full plugin lifecycle:
- **Registry Loading**: Fetches built-in plugins from `plugins/registry.json`
- **Custom Plugin Support**: Import/export via JSON files
- **State Persistence**: Plugin states sync via `chrome.storage.sync`
- **Settings Management**: Per-plugin configuration with defaults
- **Scan History**: Optionally stores last 30 scans

---

## 📁 Project Structure

```
Phising-ext/
├── manifest.json               # Chrome Manifest V3 configuration
│
├── src/
│   ├── background.js           # Service worker: orchestration & scoring
│   ├── contentScript.js        # Per-tab: page scanning & banner UI
│   ├── ml-bridge.js            # ML backend communication layer
│   ├── local-model.js          # Client-side heuristic URL analyzer
│   ├── ledger.js               # SHA-256 hash chain for domain reports
│   ├── plugins.js              # Plugin registry & state management
│   ├── popup.js                # Popup panel controller
│   └── options.js              # Options page controller
│
├── ui/
│   ├── popup.html              # Extension popup panel
│   └── options.html            # Full-page settings & plugin config
│
├── plugins/
│   └── registry.json           # 12-plugin definition registry
│
├── assets/
│   ├── css/                    # Stylesheets (base, popup, content)
│   ├── fonts/                  # Custom typography
│   └── icons/                  # Extension icons
│
└── .gitignore
```

---

## 📥 Installation

### Developer Mode (Chrome)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/m-rithik/Phising-ext.git
   cd Phising-ext
   ```

2. **Open Chrome Extensions**:
   - Navigate to `chrome://extensions/`
   - Enable **Developer Mode** (toggle in top-right)

3. **Load the extension**:
   - Click **"Load unpacked"**
   - Select the `Phising-ext/` directory

4. **Pin the extension**:
   - Click the puzzle icon in Chrome's toolbar
   - Pin **Vernacular Phishing Shield**

### Start the ML Backend (Optional but Recommended)
```bash
# In the ML backend directory
cd ../phising-detection
source venv/bin/activate
uvicorn src.api:app --host 0.0.0.0 --port 8000
```
> **Note**: The extension works without the backend — it falls back to the local heuristic model automatically.

---

## ⚙️ Configuration

### Options Page Settings

Access via the popup's **"Configure plugins"** button or right-click the extension icon → **Options**.

| Setting | Default | Description |
|---------|---------|-------------|
| **ML Base URL** | `http://localhost:8000` | Backend server address |
| **ML Path** | `/predict` | Prediction API endpoint |
| **Model Type** | `xgboost` | ML model selection (`xgboost`, `random_forest`, `distilbert`) |
| **Auto Scan** | ✅ ON | Scan every page on load |
| **Deep Scan** | ❌ OFF | Send extended page context (text + links + forms) |
| **Global Threshold** | `0.70` | Risk score threshold for phishing alerts |
| **Ledger Enabled** | ✅ ON | Community domain reputation system |
| **Ledger Boost** | `0.18` | Score boost for ledger-flagged domains |
| **Store History** | ❌ OFF | Save scan history (last 30 scans) |
| **Trusted Domains** | `[]` | Whitelisted domains (supports wildcards: `*.google.com`) |

### Trusted Domain Syntax
```
google.com          # Exact match + subdomains
*.google.com        # Wildcard: all subdomains
.google.com         # Same as *.google.com
```

### Export/Import Configuration
- **Export**: Saves all settings and plugin states as JSON
- **Import Plugins**: Load custom plugin definitions from JSON files

---

## ⚡ How It Works

### Scanning Flow

1. **Page Load / Navigation** → Content script triggers scan
2. **Data Collection** → Extracts page text (up to 6KB), links (up to 40), and form metadata
3. **Backend Analysis** → ML bridge sends data to FastAPI backend
4. **Score Computation** → Backend returns URL and text model scores
5. **Score Fusion** → Background worker fuses scores with weighted average
6. **Trusted Check** → Bypasses scoring for whitelisted domains
7. **Ledger Boost** → Adds boost for community-reported domains
8. **Label Assignment** → Derives `phishing`, `review`, or `legitimate` label
9. **Alert Display** → Content script shows in-page banner with results
10. **Badge Update** → Extension icon badge reflects risk level

### Risk Levels & Visual Indicators

| Risk Score | Badge | Banner Color | Label |
|------------|-------|-------------|-------|
| ≥ threshold (0.70) | `ALRT` (blue) | 🔴 High | Phishing Alert |
| ≥ 0.50 | `CHK` (light blue) | 🟡 Caution | Check Required |
| < 0.50 | (none) | 🟢 Low | Scan Complete |
| Trusted domain | (none) | 🟢 Low | Trusted Domain |

### Fallback Behavior

```
ML Backend Available?
├── YES → Use server URL model + text model → fused score
├── NO  → Fall back to local heuristic URL model
│         └── 20+ signals scored client-side
│         └── "Text model offline" displayed
└── Text model offline? → URL-only scoring (weight = 1.0)
```

---

## 🔒 Security Features

### Privacy-First Design
- **No external data transmission without backend** — local heuristics run entirely in-browser
- **Domain hashing** — the community ledger stores SHA-256 hashes, not raw URLs
- **No tracking** — no analytics, telemetry, or third-party scripts
- **Minimal permissions** — only `storage`, `activeTab`, `scripting`, `alarms`

### Anti-Evasion Capabilities
- **Code-mix detection** — catches Hinglish phishing that evades English-only filters
- **Transliteration awareness** — detects romanized Indian language attacks
- **URL obfuscation handling** — catches IP addresses, punycode, shorteners, and redirect chains
- **Form analysis** — identifies sensitive field harvesting (OTP, PIN, banking data)
- **SPA support** — monitors `pushState`, `replaceState`, and hash changes

### Defense-in-Depth Layers
| Layer | Component | Description |
|-------|-----------|-------------|
| 1 | URL Heuristics | 20+ local signals (zero-latency) |
| 2 | ML URL Model | Server-side URL classification |
| 3 | ML Text Model | NLP-based content analysis |
| 4 | Plugin Pipeline | 12 specialized detection modules |
| 5 | Community Ledger | Hash-chain domain reputation |
| 6 | Trusted Domains | User-curated whitelist |

---

## 🌐 Real-World Applicability

### Deployment Scenarios

| Scenario | How It Helps |
|----------|-------------|
| **Individual Users** | Install extension → automatic protection on all websites |
| **Corporate IT** | Deploy via Chrome Enterprise policies with pre-configured trusted domains |
| **Banking Portals** | Detect phishing pages impersonating SBI, HDFC, ICICI |
| **Government Services** | Flag fake Aadhaar/PAN/DigiLocker phishing pages |
| **Education** | Protect non-tech-savvy users from regional language scams |
| **Telecom Operators** | Integrate with mobile web browsers for subscriber protection |

### India-Specific Threat Patterns Detected

- 🏦 **Bank KYC Fraud**: "आपका खाता ब्लॉक हो गया है। KYC अपडेट करें"
- 💳 **UPI Refund Scam**: "Refund pending hai. Details update karo"
- 📱 **OTP Harvesting**: "সন্দেহজনক লেনদেন. OTP দিন"
- 🔐 **PAN-Aadhaar Link Scam**: "PAN-Aadhaar లింక్ విఫలమైంది"
- 📞 **Prize/Lottery Fraud**: "You have won ₹10,00,000! Click here"
- 🏛️ **Government Impersonation**: QR codes leading to credential harvesting

---

## 📊 Performance

### Extension Metrics

| Metric | Value |
|--------|-------|
| **Local scan latency** | <50ms (heuristic only) |
| **Full scan latency** | <2s (with backend) |
| **Memory footprint** | ~15 MB |
| **Content script size** | ~6 KB |
| **Background worker size** | ~30 KB (all modules) |
| **Storage usage** | <100 KB (settings + ledger) |

### Scan Coverage
| Trigger | Coverage |
|---------|----------|
| Page load | Every new page load |
| SPA navigation | `pushState`, `replaceState`, `popstate`, `hashchange` |
| Manual | On-demand via popup button |
| Interval | 1-second URL change polling |

---

## 🤝 Contributing

### Adding a Custom Plugin

1. Create a JSON file following the plugin schema:
   ```json
   {
     "id": "my-plugin",
     "name": "My Custom Plugin",
     "category": "Detection",
     "description": "Custom detection logic",
     "endpoint": "/detect/custom",
     "inputs": ["page_text"],
     "defaultEnabled": true,
     "settings": [
       {
         "id": "threshold",
         "label": "Detection Threshold",
         "type": "range",
         "min": 0.5,
         "max": 0.95,
         "step": 0.05,
         "value": 0.7
       }
     ]
   }
   ```

2. Import via the **Options page** → Plugin Management → Import

### Development Setup
```bash
git clone https://github.com/m-rithik/Phising-ext.git
cd Phising-ext

# Load in Chrome as unpacked extension
# Make changes → refresh extension in chrome://extensions/
```

---

<div align="center">

**Built with ❤️ for Digital India** | Cybersecurity × NLP (AI/ML)

*Signal-first phishing protection for 1.7 billion regional language speakers*

</div>
]]>
