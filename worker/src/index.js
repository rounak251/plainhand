// Plainhand Pro relay: Stripe checkout -> license key -> metered deep rewrites.
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, buildUserMessage, buildRevisionMessage, MAX_WORDS } from "../../prompt.js";

const MODEL = "claude-opus-5-5";

export default {
  async fetch(req, env) {
    const cors = {
      "access-control-allow-origin": env.ALLOWED_ORIGIN || "*",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-allow-methods": "POST, OPTIONS",
    };
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST") return json({ error: "not found" }, 404);

    const path = new URL(req.url).pathname;
    try {
      if (path === "/claim") return json(await claim(await req.json(), env));
      if (path === "/rewrite") return json(await rewrite(req, env));
      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: e.expose ? e.message : "server error" }, e.status || 500);
    }
  },
};

const fail = (status, message) => Object.assign(new Error(message), { status, expose: true });
const month = () => new Date().toISOString().slice(0, 7);

async function stripe(env, path) {
  const r = await fetch("https://api.stripe.com/v1/" + path, {
    headers: { authorization: "Bearer " + env.STRIPE_SECRET_KEY },
  });
  if (!r.ok) throw fail(400, "Stripe lookup failed");
  return r.json();
}

// Called once after checkout with ?session_id=. Idempotent per session.
async function claim({ session_id }, env) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(session_id || "")) throw fail(400, "bad session id");
  const existing = await env.LICENSES.get("session:" + session_id);
  if (existing) return { key: existing };
  const s = await stripe(env, "checkout/sessions/" + session_id);
  if (s.status !== "complete" || !["paid", "no_payment_required"].includes(s.payment_status))
    throw fail(402, "payment not complete");
  const key = "ph_live_" + [...crypto.getRandomValues(new Uint8Array(18))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const rec = { subscription: s.subscription || null, email: s.customer_details?.email || null, month: month(), used: 0, checked: Date.now() };
  await env.LICENSES.put("key:" + key, JSON.stringify(rec));
  await env.LICENSES.put("session:" + session_id, key);
  return { key };
}

async function rewrite(req, env) {
  const key = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const raw = key.startsWith("ph_live_") ? await env.LICENSES.get("key:" + key) : null;
  if (!raw) throw fail(401, "Unknown license key.");
  const rec = JSON.parse(raw);

  // Re-check the subscription once a day so cancelled plans stop working.
  if (rec.subscription && Date.now() - rec.checked > 864e5) {
    const sub = await stripe(env, "subscriptions/" + rec.subscription);
    rec.active = ["active", "trialing"].includes(sub.status);
    rec.checked = Date.now();
  }
  if (rec.active === false) throw fail(402, "Your Pro plan is not active.");

  const quota = Number(env.QUOTA || 30);
  if (rec.month !== month()) { rec.month = month(); rec.used = 0; }
  const body = await req.json();

  // Second pass on our own previous output: free, single use, expires in an hour.
  if (body.revise_id) {
    const revKey = "rev:" + String(body.revise_id).slice(0, 64);
    const prev = JSON.parse((await env.LICENSES.get(revKey)) || "null");
    if (!prev || prev.key !== key) throw fail(410, "That draft can no longer be revised.");
    await env.LICENSES.delete(revKey);
    const issues = (Array.isArray(body.issues) ? body.issues : []).slice(0, 12).map((i) => ({
      label: String(i.label || "").slice(0, 80),
      samples: (Array.isArray(i.samples) ? i.samples : []).slice(0, 2).map((x) => String(x).slice(0, 200)),
    }));
    const text = await callClaude(env, buildRevisionMessage(prev.text, issues, { mode: prev.mode }));
    return { text, remaining: quota - rec.used };
  }

  if (rec.used >= quota) throw fail(429, "You have used this month's deep rewrites.");
  const { text = "", mode, sample = "", flagged = [] } = body;
  const n = (text.trim().match(/\S+/g) || []).length;
  if (!n) throw fail(400, "Empty text.");
  if (n > MAX_WORDS) throw fail(413, `Up to ${MAX_WORDS} words per rewrite.`);
  if (String(sample).length > 6000) throw fail(413, "Voice sample is too long.");

  rec.used += 1;
  await env.LICENSES.put("key:" + key, JSON.stringify(rec));
  let out;
  try {
    out = await callClaude(env, buildUserMessage(text, { mode, sample: String(sample), flagged: flagged.slice(0, 40).map(String) }));
  } catch (e) {
    rec.used -= 1; // don't charge the user for our upstream failure
    await env.LICENSES.put("key:" + key, JSON.stringify(rec));
    throw e;
  }
  const revise_id = crypto.randomUUID();
  await env.LICENSES.put("rev:" + revise_id, JSON.stringify({ key, text: out, mode }), { expirationTtl: 3600 });
  return { text: out, remaining: quota - rec.used, revise_id };
}

async function callClaude(env, userMessage) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  let msg;
  try {
    msg = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw fail(503, "Busy right now. Retry in a minute.");
    throw fail(502, "Rewrite service error.");
  }
  if (msg.stop_reason === "refusal") throw fail(422, "The model declined this text.");
  return msg.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}
