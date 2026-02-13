import { localUrlScore } from "./local-model.js";

export async function pingBackend() {
  return { ok: true, latency: "local" };
}

export async function analyzeText(payload) {
  return localUrlScore(payload);
}
