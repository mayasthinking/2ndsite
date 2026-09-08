let worker = null;
let seq = 0;
const pending = new Map();

function startWorker() {
  if (worker !== null) return worker;
  if (typeof Worker !== "function") {
    worker = false;
    return worker;
  }
  try {
    worker = new Worker(new URL("./image-worker.js?v=5", import.meta.url), { type: "module" });
    worker.onmessage = (event) => {
      const { id, ok, result, error } = event.data || {};
      const job = pending.get(id);
      if (!job) return;
      pending.delete(id);
      if (ok) job.resolve(result);
      else job.reject(new Error(error || "image worker failed"));
    };
    worker.onerror = () => {
      for (const job of pending.values()) job.reject(new Error("image worker failed"));
      pending.clear();
      worker = false;
    };
  } catch {
    worker = false;
  }
  return worker;
}

export function imageWork(type, payload = {}, transfer = []) {
  const node = startWorker();
  if (!node) return Promise.reject(new Error("image worker unavailable"));
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    try {
      node.postMessage({ id, type, ...payload }, transfer);
    } catch (err) {
      pending.delete(id);
      reject(err);
    }
  });
}
