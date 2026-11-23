// Free AI rewrite that runs on the visitor's own GPU through WebLLM.
import { SMALL_PROMPT, buildSmallMessage, chunkText } from "./prompt.js";

export const LOCAL_MODEL = "Qwen3-4B-q4f16_1-MLC";
export const LOCAL_MODEL_LABEL = "Qwen3 4B";
let enginePromise = null;

export const hasWebGPU = () => !!navigator.gpu;

export async function webgpuReady() {
  if (!navigator.gpu) return false;
  try { return !!(await navigator.gpu.requestAdapter()); } catch { return false; }
}

export function loadEngine(onProgress) {
  if (!enginePromise) {
    enginePromise = (async () => {
      const webllm = await import("https://esm.run/@mlc-ai/web-llm@0.2.89");
      const worker = new Worker(new URL("./llmworker.js", import.meta.url), { type: "module" });
      // Large downloads sometimes drop; finished shards are cached, so a retry resumes.
      let lastErr;
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          return await webllm.CreateWebWorkerMLCEngine(worker, LOCAL_MODEL, {
            initProgressCallback: (p) => onProgress?.(p, attempt),
          });
        } catch (e) {
          lastErr = e;
          await new Promise((r) => setTimeout(r, 2000 * attempt));
        }
      }
      throw lastErr;
    })().catch((e) => { enginePromise = null; throw e; });
  }
  return enginePromise;
}

// Rewrites chunk by chunk, streaming into onText(fullTextSoFar).
export async function localRewrite(text, mode, { onProgress, onText } = {}) {
  const engine = await loadEngine(onProgress);
  const chunks = chunkText(text);
  const done = [];
  for (const chunk of chunks) {
    let cur = "";
    const stream = await engine.chat.completions.create({
      messages: [{ role: "system", content: SMALL_PROMPT }, { role: "user", content: buildSmallMessage(chunk, mode) }],
      temperature: 0.7, top_p: 0.9, max_tokens: 900, stream: true,
      extra_body: { enable_thinking: false },
    });
    for await (const part of stream) {
      cur += part.choices[0]?.delta?.content || "";
      onText?.([...done, clean(cur)].join("\n\n"));
    }
    done.push(clean(cur) || chunk);
  }
  return done.join("\n\n");
}

const clean = (s) => s.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").replace(/^\s*"""\s*|\s*"""\s*$/g, "").trim();
