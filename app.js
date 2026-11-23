import { SYSTEM_PROMPT, buildUserMessage, buildRevisionMessage, MAX_WORDS } from "./prompt.js";
import { humanize } from "./humanize.js";
import { localRewrite, webgpuReady, LOCAL_MODEL_LABEL } from "./localai.js";
import { API_BASE, PAYMENT_LINK, PRO_PRICE, PRO_QUOTA } from "./config.js";

const $ = (id) => document.getElementById(id);
const input = $("input"), output = $("output");
const MODEL = "claude-opus-5-5";

// ---------- scanner (Pyodide worker) ----------
const py = new Worker("pyworker.js");
const pending = new Map();
let seq = 0, engineReady = false;
py.onmessage = (e) => {
  const p = pending.get(e.data.id);
  if (!p) return;
  pending.delete(e.data.id);
  e.data.ok ? p.resolve(e.data.out) : p.reject(new Error(e.data.error));
};
const callPy = (op, text = "") => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, { resolve, reject });
  py.postMessage({ id, op, text });
});
callPy("ping").then(() => {
  engineReady = true;
  $("engineHint").textContent = "Scanner ready. Scan and quick clean run in your browser.";
}).catch((err) => {
  $("engineHint").textContent = "The scanner failed to load: " + err.message;
  $("engineHint").classList.add("err");
});

async function scan(text) {
  return JSON.parse(await callPy("scan", text));
}

function flaggedLabels(report) {
  return Object.entries(report)
    .filter(([k, v]) => k !== "_metrics" && v && v.count > 0)
    .map(([, v]) => v.label);
}

function paintScore(el, report) {
  const m = report._metrics || {};
  const s = Math.round(m.ai_tell_score ?? 0);
  el.className = "score " + levelClass(s);
  const short = m.confidence === "none";
  el.querySelector(".num").textContent = short ? "n/a" : s;
  el.querySelector(".band").textContent = short ? "too short to score" : (m.ai_tell_band || "");
  if (short) el.className = "score";
}
const levelClass = (s) => s <= 20 ? "lvl-clean" : s <= 40 ? "lvl-light" : s <= 60 ? "lvl-mixed" : "lvl-heavy";
const resetScore = (el) => { el.className = "score"; el.querySelector(".num").textContent = "-"; el.querySelector(".band").textContent = ""; };

function paintFindings(report, title) {
  const box = $("findings");
  box.innerHTML = "";
  const items = Object.entries(report).filter(([k, v]) => k !== "_metrics" && v && v.count > 0)
    .sort((a, b) => b[1].count - a[1].count);
  const h = document.createElement("p");
  h.className = "hint";
  h.textContent = items.length ? `${title}: ${items.length} pattern${items.length > 1 ? "s" : ""} found` : `${title}: no patterns found`;
  box.appendChild(h);
  for (const [, v] of items) {
    const d = document.createElement("div");
    d.className = "find";
    const b = document.createElement("b"); b.textContent = v.label;
    const n = document.createElement("span"); n.className = "n"; n.textContent = "x" + v.count;
    d.append(b, n);
    for (const s of (v.samples || []).slice(0, 2)) {
      const c = document.createElement("code"); c.textContent = "..." + s.trim() + "..."; d.appendChild(c);
    }
    box.appendChild(d);
  }
}

// ---------- helpers ----------
const words = (t) => (t.trim().match(/\S+/g) || []).length;
function toast(msg, ms = 2600) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
}
function busy(btn, on, label) {
  if (on) { btn.dataset.label = btn.textContent; btn.textContent = label; btn.disabled = true; }
  else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
}
function needText() {
  const t = input.value;
  if (!t.trim()) { toast("Paste some text first."); return null; }
  if (!engineReady) { toast("The scanner is still loading. Try again in a few seconds."); return null; }
  return t;
}
input.addEventListener("input", () => ($("inCount").textContent = words(input.value) + " words"));

// ---------- actions ----------
$("scanBtn").onclick = async () => {
  const t = needText(); if (!t) return;
  busy($("scanBtn"), true, "Scanning...");
  try {
    const r = await scan(t);
    paintScore($("scoreBefore"), r); resetScore($("scoreAfter")); paintFindings(r, "Draft");
  } catch (e) { toast("Scan failed: " + e.message); }
  busy($("scanBtn"), false);
};

$("cleanBtn").onclick = async () => {
  const t = needText(); if (!t) return;
  busy($("cleanBtn"), true, "Cleaning...");
  try {
    const [before, charClean] = await Promise.all([scan(t), callPy("clean", t)]);
    const cleaned = humanize(charClean, $("mode").value);
    output.value = cleaned;
    const after = await scan(cleaned);
    paintScore($("scoreBefore"), before); paintScore($("scoreAfter"), after); paintFindings(after, after._metrics?.ai_tell_score > 20 ? "Still flagged (AI rewrite fixes these)" : "Still flagged");
  } catch (e) { toast("Quick clean failed: " + e.message); }
  busy($("cleanBtn"), false);
};

$("rewriteBtn").onclick = async () => {
  const t = needText(); if (!t) return;
  if (words(t) > MAX_WORDS) return toast(`AI rewrite takes up to ${MAX_WORDS} words at a time. Split the text.`, 4000);
  const license = localStorage.getItem("ph_license") || "";
  const apiKey = localStorage.getItem("ph_apikey") || "";
  const pro = !!(license && API_BASE);
  if (!pro && !apiKey) return runLocal(t);
  busy($("rewriteBtn"), true, "Rewriting...");
  try {
    const before = await scan(t);
    paintScore($("scoreBefore"), before); resetScore($("scoreAfter"));
    const opts = { mode: $("mode").value, sample: $("sample").value, flagged: flaggedLabels(before) };
    const polish = async (raw) => humanize(await callPy("clean", raw), opts.mode);

    const r1 = pro ? await callPro(license, { text: t, ...opts }) : { text: await callClaude(apiKey, buildUserMessage(t, opts)) };
    let text = await polish(r1.text), after = await scan(text);

    const issues = issuesOf(after);
    if ((after._metrics?.ai_tell_score ?? 0) > 20 && issues.length) {
      $("rewriteBtn").textContent = "Second pass...";
      const r2 = pro ? await callPro(license, { revise_id: r1.revise_id, issues, mode: opts.mode })
                     : { text: await callClaude(apiKey, buildRevisionMessage(text, issues, opts)) };
      const text2 = await polish(r2.text), after2 = await scan(text2);
      if (after2._metrics.ai_tell_score <= after._metrics.ai_tell_score) { text = text2; after = after2; }
    }
    output.value = text;
    paintScore($("scoreAfter"), after); paintFindings(after, "Result");
  } catch (e) { toast(e.message, 5000); }
  busy($("rewriteBtn"), false);
};

// Free path: the small model on the visitor's GPU, then the rule engine.
async function runLocal(t) {
  const st = $("aiStatus");
  if (!(await webgpuReady())) {
    st.hidden = false;
    st.textContent = "The free AI needs WebGPU (desktop Chrome or Edge, or Safari 26+). On this browser, use Humanize, or add a key below.";
    return;
  }
  const mode = $("mode").value;
  busy($("rewriteBtn"), true, "Loading AI...");
  st.hidden = false; st.classList.remove("err");
  try {
    const before = await scan(t);
    paintScore($("scoreBefore"), before); resetScore($("scoreAfter"));
    output.value = "";
    let started = false;
    const pre = humanize(await callPy("clean", t), mode);  // strip the obvious tells first so the small model copies fewer of them
    const raw = await localRewrite(pre, mode, {
      onProgress: (p, attempt) => { st.textContent = (attempt > 1 ? "Connection dropped, resuming. " : "") + "First run downloads the free AI model (about 2-3 GB, then cached): " + Math.round((p.progress || 0) * 100) + "%. " + (p.text || "").replace(/\[.*?\]\s*/g, "").slice(0, 80); },
      onText: (txt) => {
        if (!started) { started = true; $("rewriteBtn").textContent = "Rewriting..."; st.textContent = `Rewriting on your device with ${LOCAL_MODEL_LABEL}...`; }
        output.value = txt;
      },
    });
    const text = humanize(await callPy("clean", raw), mode), after = await scan(text);
    output.value = text;
    paintScore($("scoreAfter"), after); paintFindings(after, "Result");
    st.textContent = `Rewritten on your device by ${LOCAL_MODEL_LABEL}. Pro uses Claude for stronger rewrites.`;
  } catch (e) {
    const msg = (e && (e.message || e.reason || (typeof e === "string" ? e : JSON.stringify(e)))) || "unknown error";
    console.error("local AI", e);
    st.textContent = "The free AI failed: " + msg + ". Click AI rewrite again to resume; downloaded parts are kept.";
    st.classList.add("err");
  }
  busy($("rewriteBtn"), false);
}

const issuesOf = (report) => Object.entries(report)
  .filter(([k, v]) => k !== "_metrics" && v && v.count > 0)
  .map(([, v]) => ({ label: v.label, samples: (v.samples || []).slice(0, 2) }));

let sdk;
async function callClaude(apiKey, userMessage) {
  sdk ||= (await import("https://esm.sh/@anthropic-ai/sdk@1.12.0")).default;
  const client = new sdk({ apiKey, dangerouslyAllowBrowser: true });
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });
  output.value = "";
  stream.on("text", (d) => (output.value += d));
  let msg;
  try { msg = await stream.finalMessage(); }
  catch (e) {
    if (e instanceof sdk.AuthenticationError) throw new Error("Anthropic rejected that API key.");
    if (e instanceof sdk.RateLimitError) throw new Error("Rate limited by Anthropic. Wait a minute and retry.");
    if (e instanceof sdk.APIError) throw new Error("Anthropic API error: " + e.message);
    throw e;
  }
  if (msg.stop_reason === "refusal") throw new Error("The model declined this text.");
  if (msg.stop_reason === "max_tokens") toast("The rewrite hit the length limit and may be cut off.", 4000);
  return msg.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}

async function callPro(license, body) {
  const r = await fetch(API_BASE + "/rewrite", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + license },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Rewrite failed (" + r.status + ").");
  if (typeof j.remaining === "number") $("keyStatus").textContent = `Pro: ${j.remaining} rewrites left this month.`;
  return j;
}

$("copyBtn").onclick = async () => {
  if (!output.value) return toast("Nothing to copy yet.");
  await navigator.clipboard.writeText(output.value); toast("Copied.");
};
$("useBtn").onclick = () => {
  if (!output.value) return;
  input.value = output.value; input.dispatchEvent(new Event("input")); toast("Moved into the draft box.");
};

// ---------- input sources ----------
async function ocr(file) {
  const st = $("ocrStatus"); st.hidden = false; st.classList.remove("err");
  if (!window.Tesseract) { st.textContent = "OCR is still loading. Try again in a moment."; return; }
  try {
    const { data } = await Tesseract.recognize(file, "eng", {
      logger: (m) => { if (m.status) st.textContent = `Reading image: ${m.status} ${m.progress ? Math.round(m.progress * 100) + "%" : ""}`; },
    });
    const text = data.text.replace(/-\n(\w)/g, "$1").replace(/([^\n])\n(?!\n)/g, "$1 ").trim();
    input.value = input.value.trim() ? input.value.trim() + "\n\n" + text : text;
    input.dispatchEvent(new Event("input"));
    st.textContent = `Read ${words(text)} words from the image. Check the text for OCR mistakes before rewriting.`;
  } catch (e) { st.textContent = "Could not read that image: " + e.message; st.classList.add("err"); }
}
async function takeFile(file) {
  if (!file) return;
  if (file.type.startsWith("image/")) return ocr(file);
  if (file.size > 2e6) return toast("That file is over 2 MB.");
  input.value = await file.text(); input.dispatchEvent(new Event("input"));
}
$("imgIn").onchange = (e) => takeFile(e.target.files[0]);
$("fileIn").onchange = (e) => takeFile(e.target.files[0]);
input.addEventListener("paste", (e) => {
  const img = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
  if (img) { e.preventDefault(); ocr(img.getAsFile()); }
});
input.addEventListener("dragover", (e) => { e.preventDefault(); document.body.classList.add("dropping"); });
input.addEventListener("dragleave", () => document.body.classList.remove("dropping"));
input.addEventListener("drop", (e) => { e.preventDefault(); document.body.classList.remove("dropping"); takeFile(e.dataTransfer.files[0]); });

$("sampleBtn").onclick = () => {
  input.value = `Great question! In today's fast-paced digital landscape, remote work isn't just a trend — it's a fundamental shift in how we operate. Additionally, it fosters collaboration, enhances productivity, and empowers employees to thrive.

**Key Benefits:**
- **Flexibility:** Workers can seamlessly navigate their schedules.
- **Savings:** Companies leverage reduced overhead to unlock growth.

At its core, this transformation underscores a pivotal moment in the evolution of work. The future looks bright. I hope this helps!`;
  input.dispatchEvent(new Event("input"));
};

// ---------- keys, pricing, checkout ----------
$("licenseKey").value = localStorage.getItem("ph_license") || "";
$("apiKey").value = localStorage.getItem("ph_apikey") || "";
$("saveKeys").onclick = () => {
  const l = $("licenseKey").value.trim(), a = $("apiKey").value.trim();
  l ? localStorage.setItem("ph_license", l) : localStorage.removeItem("ph_license");
  a ? localStorage.setItem("ph_apikey", a) : localStorage.removeItem("ph_apikey");
  $("keyStatus").textContent = l || a ? "Saved in this browser." : "Keys cleared.";
};

$("proPrice").textContent = PRO_PRICE;
$("proQuota").textContent = PRO_QUOTA;
if (PAYMENT_LINK && API_BASE) $("buyBtn").href = PAYMENT_LINK;
else {
  $("buyBtn").removeAttribute("href");
  $("buyBtn").classList.add("ghost"); $("buyBtn").classList.remove("primary");
  $("buyBtn").textContent = "Coming soon";
  $("buyNote").textContent = "Pro checkout opens shortly. Free mode works today.";
}

(async function claimAfterCheckout() {
  const sid = new URLSearchParams(location.search).get("session_id");
  if (!sid || !API_BASE) return;
  history.replaceState(null, "", location.pathname + "#tool");
  try {
    const r = await fetch(API_BASE + "/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session_id: sid }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "claim failed");
    localStorage.setItem("ph_license", j.key); $("licenseKey").value = j.key;
    $("keyStatus").textContent = `Pro is active. Your license key is ${j.key}. Save it somewhere: it works in any browser.`;
    $("keys").scrollIntoView({ behavior: "smooth" });
  } catch (e) { toast("Could not activate Pro: " + e.message + ". Email support with your receipt.", 6000); }
})();
