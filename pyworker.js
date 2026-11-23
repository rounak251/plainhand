// Runs sloptrim's detect.py (Apache-2.0) inside Pyodide, off the main thread.
importScripts("https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js");

const ready = (async () => {
  const py = await loadPyodide();
  const src = await (await fetch("py/detect.py")).text();
  py.FS.writeFile("/home/pyodide/detect.py", src);
  py.runPython("import sys, json; sys.path.insert(0, '/home/pyodide'); import detect");
  return py;
})();

onmessage = async (e) => {
  const { id, op, text } = e.data;
  try {
    const py = await ready;
    if (op === "ping") return postMessage({ id, ok: true, out: "ready" });
    py.globals.set("_t", text);
    const out = op === "scan"
      ? py.runPython("json.dumps(detect.scan(_t), ensure_ascii=False)")
      : py.runPython("detect.clean_text(_t)");
    postMessage({ id, ok: true, out });
  } catch (err) {
    postMessage({ id, ok: false, error: String(err) });
  }
};
