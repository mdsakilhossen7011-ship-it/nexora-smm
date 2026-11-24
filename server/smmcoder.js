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

function serviceKindFor(service) {
  const text = (String(service.category || "") + " " + String(service.name || "")).toLowerCase();
  if (/watch[ -]?time|watch hours?|hours? watch/.test(text)) return "watchtime";
  if (/subscriber|\bsubs?\b/.test(text)) return "subscribers";
  if (/follower|\bfollows?\b/.test(text)) return "followers";
  if (/comment|\breply\b/.test(text)) return "comments";
  if (/story[ -]?views?/.test(text)) return "story_views";
  if (/live[ -]?views?|live stream/.test(text)) return "live_views";
  if (/\bviews?\b/.test(text)) return "views";
  if (/\blikes?\b/.test(text)) return "likes";
  if (/\bmembers?\b|group joins?|channel joins?/.test(text)) return "members";
  if (/reaction/.test(text)) return "reactions";
  if (/shares?/.test(text)) return "shares";
  if (/saves?/.test(text)) return "saves";
  return "other";
}

function selectBalancedServices(services, limit = 100) {
  const groups = new Map();
  for (const service of services) {
    const key = service.__category + ":" + service.__kind;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(service);
  }
  const buckets = [...groups.values()];
  for (const bucket of buckets) {
    bucket.sort((a, b) => Number(a.rate) - Number(b.rate) ||
      Number(b.max) - Number(a.max) || String(a.service).localeCompare(String(b.service)));
  }
  const selected = [];
  for (let round = 0; selected.length < limit; round++) {
    let added = false;
    for (const bucket of buckets) {
      if (bucket[round] && selected.length < limit) {
        selected.push(bucket[round]);
        added = true;
      }
    }
    if (!added) break;
  }
  return selected;
}

module.exports = { request, categoryFor, serviceKindFor, selectBalancedServices };
