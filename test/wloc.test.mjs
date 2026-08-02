import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import vm from "node:vm";
import YAML from "yaml";
import wloc from "../scripts/tools/wloc/wloc.js";
import wlocSettings from "../scripts/tools/wloc/wloc-settings.js";
import { concatBytes, encodeFieldForTest } from "../sources/tools/wloc/core.mjs";

const moduleDocument = YAML.parse(await readFile(
  new URL("../modules/tools/wloc.yaml", import.meta.url),
  "utf8",
));
const convertedDocument = YAML.parse(await readFile(
  new URL("../converted/tools/wloc/unoptimized.yaml", import.meta.url),
  "utf8",
));
const legacyWloc = await readFile(
  new URL("../upstream/tools/wloc/wloc.js", import.meta.url),
  "utf8",
);

test("WLOC native module preserves arguments and response settings", () => {
  assert.deepEqual(moduleDocument.compat_arguments, {
    经度: "113.94114",
    纬度: "22.544577",
    精度: "25",
    日志级别: "info",
  });
  const response = moduleDocument.scriptings[0].http_response;
  assert.equal(response.max_size, 0);
  assert.equal(response.timeout, 30);
  assert.equal(response.body_required, true);
  assert.equal(response.binary_body, true);
  assert.deepEqual(response.env, {
    longitude: "{{{经度}}}",
    latitude: "{{{纬度}}}",
    accuracy: "{{{精度}}}",
    logLevel: "{{{日志级别}}}",
  });
  assert.deepEqual(moduleDocument.mitm.hostnames.includes, [
    "gs-loc.apple.com",
    "gs-loc-cn.apple.com",
  ]);
});

test("WLOC unoptimized snapshot keeps official compatibility arguments", () => {
  const response = convertedDocument.scriptings[0].http_response;
  assert.equal(
    response.env["_compat.$argument"],
    "longitude={{{经度}}}&latitude={{{纬度}}}&accuracy={{{精度}}}&logLevel={{{日志级别}}}",
  );
  assert.match(response.script_url, /Yu9191\/wloc/u);
});

test("WLOC native output matches the upstream compatibility script", async () => {
  const source = makeFrame(22.1, 113.1, 50);
  const env = { longitude: "121.4737", latitude: "31.2304", accuracy: "18", logLevel: "off" };
  const native = await wloc(responseContext(source, env));
  const legacy = await runLegacyWloc(source, env);
  assert.deepEqual([...native.body], [...legacy]);
});

test("WLOC native build preserves gzip coverage", async () => {
  const source = makeFrame(22.1, 113.1, 50);
  const compressed = gzipSync(source);
  const env = { longitude: "-73.9857", latitude: "40.7484", accuracy: "12", logLevel: "off" };
  const native = await wloc(responseContext(compressed, env, { "Content-Encoding": "gzip" }));
  const legacy = await runLegacyWloc(compressed, env);
  assert.deepEqual([...native.body], [...legacy]);
  assert.equal(native.headers.get("Content-Encoding"), null);
});

test("WLOC default coordinates pass through without consuming the body", async () => {
  let consumed = false;
  const result = await wloc({
    env: { longitude: "113.94114", latitude: "22.544577", accuracy: "25", logLevel: "off" },
    response: { arrayBuffer: async () => { consumed = true; return new ArrayBuffer(0); }, headers: new Headers() },
    storage: storage(),
  });
  assert.equal(result, undefined);
  assert.equal(consumed, false);
});

test("WLOC malformed protobuf returns the original binary body", async () => {
  const source = Uint8Array.of(1, 2, 3, 4);
  const result = await wloc(responseContext(source, {
    longitude: "121.4737", latitude: "31.2304", accuracy: "18", logLevel: "off",
  }));
  assert.deepEqual([...result.body], [...source]);
});

test("WLOC settings save, query, and clear through native storage", async () => {
  const store = storage();
  const saved = await wlocSettings(requestContext(
    "https://gs-loc.apple.com/wloc-settings/save?lon=121.4737&lat=31.2304&acc=18",
    store,
  ));
  assert.deepEqual(JSON.parse(saved.body), {
    success: true, longitude: 121.4737, latitude: 31.2304, accuracy: 18,
  });
  const queried = await wlocSettings(requestContext(
    "https://gs-loc.apple.com/wloc-settings/save?action=query",
    store,
  ));
  assert.equal(JSON.parse(queried.body).longitude, 121.4737);
  const cleared = await wlocSettings(requestContext(
    "https://gs-loc.apple.com/wloc-settings/save?action=clear",
    store,
  ));
  assert.deepEqual(JSON.parse(cleared.body), { success: true });
  assert.equal(store.getJSON("wloc_settings"), null);
});

function makeFrame(latitude, longitude, accuracy) {
  const location = concatBytes([
    encodeFieldForTest(1, 0, Math.round(latitude * 1e8)),
    encodeFieldForTest(2, 0, Math.round(longitude * 1e8)),
    encodeFieldForTest(3, 0, accuracy),
  ]);
  const wifi = concatBytes([
    encodeFieldForTest(1, 2, new TextEncoder().encode("aa:bb:cc:dd:ee:ff")),
    encodeFieldForTest(2, 2, location),
  ]);
  const payload = encodeFieldForTest(2, 2, wifi);
  return concatBytes([
    new Uint8Array(8),
    Uint8Array.of((payload.length >> 8) & 0xff, payload.length & 0xff),
    payload,
  ]);
}

function responseContext(bytes, env, headerValues = {}) {
  const copy = Uint8Array.from(bytes);
  return {
    env,
    request: { url: "https://gs-loc.apple.com/clls/wloc" },
    response: {
      arrayBuffer: async () => copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength),
      headers: new Headers(headerValues),
    },
    storage: storage(),
  };
}

function requestContext(url, store) {
  return {
    request: { url },
    storage: store,
    respond: (response) => response,
  };
}

function storage(initial = null) {
  let value = initial;
  return {
    getJSON: () => structuredClone(value),
    setJSON: (_key, next) => { value = structuredClone(next); },
    delete: () => { value = null; },
  };
}

async function runLegacyWloc(bytes, env) {
  let finish;
  const completed = new Promise((resolve) => { finish = resolve; });
  const argument = new URLSearchParams(env).toString();
  vm.runInNewContext(legacyWloc, {
    Egern: {},
    $argument: argument,
    $done: finish,
    $persistentStore: { read: () => null, write: () => true },
    $request: { url: "https://gs-loc.apple.com/clls/wloc" },
    $response: { body: Uint8Array.from(bytes), headers: {} },
    console: { log: () => {} },
    Uint8Array,
    ArrayBuffer,
    TextEncoder,
    TextDecoder,
  }, { timeout: 2_000 });
  const output = await completed;
  const body = output?.response?.body ?? output?.response?.bodyBytes ?? output?.body ?? output?.bodyBytes;
  assert.ok(body, "upstream script did not return a binary body");
  return new Uint8Array(body);
}
