"use strict";

const DEFAULT_BASE_URL = "https://smmcoder.com/api/v2";

function getBaseUrl() {
  const value = String(process.env.SMM_PROVIDER_BASE_URL || DEFAULT_BASE_URL).trim();
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "smmcoder.com" || !url.pathname.replace(/\/+$/, "").endsWith("/api/v2")) {
    throw new Error("SMMCoder API URL is not valid. Use https://smmcoder.com/api/v2.");
  }
  return url.toString();
}

async function request(action, params = {}) {
  const key = String(process.env.SMM_PROVIDER_API_KEY || "").trim();
  if (!key) throw new Error("SMM_PROVIDER_API_KEY is not configured.");
  const body = new URLSearchParams({ key, action, ...Object.fromEntries(Object.entries(params).map(([k,v]) => [k, String(v)])) });
  let response;
  try {
    response = await fetch(getBaseUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
      body,
      signal: AbortSignal.timeout(20000)
    });
  } catch {
    throw Object.assign(new Error("SMMCoder did not respond. Check provider status before retrying."), { uncertain: true });
  }
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error("SMMCoder returned an invalid JSON response."); }
  if (!response.ok || (data && !Array.isArray(data) && data.error)) {
    const message = String(data?.error || data?.message || ("SMMCoder HTTP " + response.status)).slice(0, 300);
    throw Object.assign(new Error(message), { providerRejected: true });
  }
  return data;
}

function categoryFor(service) {
  const text = (String(service.category || "") + " " + String(service.name || "")).toLowerCase();
  if (/facebook|\bfb\b|meta/.test(text)) return "facebook";
  if (/instagram|\big\b/.test(text)) return "instagram";
  if (/tiktok|tik tok/.test(text)) return "tiktok";
  if (/youtube|\byt\b/.test(text)) return "youtube";
  if (/telegram|\btg\b/.test(text)) return "telegram";
  return null;
}

module.exports = { request, categoryFor };
