import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import xiaohongshu from "../scripts/ad/xiaohongshu-ads/RedPaper_remove_ads.js";
import netease from "../scripts/music/netease/wyyad.js";
import wloc from "../scripts/tools/wloc/wloc.js";
import { concatBytes, encodeFieldForTest } from "../sources/tools/wloc/core.mjs";

const budgets = JSON.parse(await readFile(new URL("../benchmarks/budgets.json", import.meta.url)));
const results = [];

await measure("xiaohongshu-homefeed", async () => {
  const items = Array.from({ length: 20_000 }, (_, index) => index % 4 === 0
    ? { id: `${index}`, ads_info: { id: index }, model_type: "note" }
    : { id: `${index}`, model_type: "note", related_ques: [{ id: index }] });
  const result = await xiaohongshu(responseContext(items));
  assert.equal(JSON.parse(result.body).data.length, 15_000);
});

await measure("netease-batch", async () => {
  const comments = Array.from({ length: 5_000 }, (_, index) => ({
    id: index,
    user: { followed: false, vipRights: { level: 1 }, avatarDetail: { icon: "x" } },
    userBizLevels: [1],
    pendantData: { id: 1 },
    tag: { extDatas: [1], contentPicDatas: [1] },
  }));
  const result = await netease(neteaseContext({
    "/api/v2/resource/comments": { data: { comments } },
  }));
  assert.ok(result.body instanceof Uint8Array);
});

await measure("wloc-wifi-protobuf", async () => {
  const result = await wloc(wlocContext(makeWlocFrame(1_000)));
  assert.ok(result.body instanceof Uint8Array);
  assert.ok(result.body.length > 30_000);
});

console.log(JSON.stringify(results, null, 2));

async function measure(name, workload) {
  await workload();
  globalThis.gc?.();
  const before = process.memoryUsage().heapUsed;
  const start = performance.now();
  await workload();
  const durationMs = performance.now() - start;
  const heapDeltaMb = Math.max(0, process.memoryUsage().heapUsed - before) / 1024 / 1024;
  const budget = budgets[name];
  assert.ok(durationMs <= budget.max_duration_ms,
    `${name} ${durationMs.toFixed(1)}ms > ${budget.max_duration_ms}ms`);
  assert.ok(heapDeltaMb <= budget.max_heap_delta_mb,
    `${name} ${heapDeltaMb.toFixed(1)}MB > ${budget.max_heap_delta_mb}MB`);
  results.push({
    name,
    duration_ms: Number(durationMs.toFixed(2)),
    heap_delta_mb: Number(heapDeltaMb.toFixed(2)),
    budget,
  });
  globalThis.gc?.();
}

function responseContext(items) {
  return {
    request: { url: "https://edith.xiaohongshu.com/api/sns/v6/homefeed?benchmark=1" },
    response: {
      body: {},
      json: async () => ({ data: items }),
    },
    storage: { getJSON: () => null, setJSON: () => true },
  };
}

function neteaseContext(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return {
    env: {},
    request: { url: "https://interface.music.163.com/api/batch" },
    response: {
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    },
    storage: { get: () => null },
  };
}

function makeWlocFrame(count) {
  const location = concatBytes([
    encodeFieldForTest(1, 0, 2_210_000_000),
    encodeFieldForTest(2, 0, 11_310_000_000),
    encodeFieldForTest(3, 0, 50),
  ]);
  const records = Array.from({ length: count }, (_, index) => {
    const suffix = index.toString(16).padStart(4, "0");
    const mac = new TextEncoder().encode(`aa:bb:cc:dd:${suffix.slice(0, 2)}:${suffix.slice(2)}`);
    const wifi = concatBytes([
      encodeFieldForTest(1, 2, mac),
      encodeFieldForTest(2, 2, location),
    ]);
    return encodeFieldForTest(2, 2, wifi);
  });
  const payload = concatBytes(records);
  return concatBytes([
    new Uint8Array(8),
    Uint8Array.of((payload.length >> 8) & 0xff, payload.length & 0xff),
    payload,
  ]);
}

function wlocContext(bytes) {
  return {
    env: { longitude: "121.4737", latitude: "31.2304", accuracy: "18", logLevel: "off" },
    request: { url: "https://gs-loc.apple.com/clls/wloc" },
    response: {
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      headers: new Headers(),
    },
    storage: { getJSON: () => null },
  };
}
