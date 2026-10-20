/* Web Worker: runs the engine off the main thread. Message: {id, state, opts} -> {id, r} */
importScripts('rules.js?v=1', 'engine.js?v=1');
self.onmessage = function (e) {
  const d = e.data || {};
  try {
    const r = self.CkEngine.think(d.state, d.opts || {});
    self.postMessage({ id: d.id, r });
  } catch (err) {
    self.postMessage({ id: d.id, error: String(err && err.message || err) });
  }
};
