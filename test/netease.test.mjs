import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import YAML from "yaml";
import netease from "../scripts/music/netease/wyyad.js";
import { decodeBody } from "../sources/music/netease/function/Crypto.mjs";

const moduleDocument = YAML.parse(await readFile(
  new URL("../modules/music/netease.yaml", import.meta.url),
  "utf8",
));

test("Netease module preserves all parameters and binary settings", () => {
  assert.equal(Object.keys(moduleDocument.compat_arguments).length, 28);
  assert.equal(moduleDocument.scriptings.length, 1);
  const scripting = moduleDocument.scriptings[0].http_response;
  assert.equal(scripting.max_size, 0);
  assert.equal(scripting.timeout, 20);
  assert.equal(scripting.body_required, true);
  assert.equal(scripting.binary_body, true);
  assert.equal(Object.keys(scripting.env).length, 25);
});

test("Netease preserves REJECT-NO-DROP semantics", () => {
  assert.equal(moduleDocument.rules.length, 5);
  assert.deepEqual(
    moduleDocument.rules.map((rule) => Object.values(rule)[0].policy),
    Array(5).fill("REJECT-NO-DROP"),
  );
});

test("Netease combined matcher covers every optimized handler", () => {
  const matcher = new RegExp(moduleDocument.scriptings[0].http_response.match, "u");
  for (const route of [
    "batch",
    "v2/resource/comment/floor/get",
    "v1/user/info",
    "sp/flow/popup/query",
    "vipactivity/app/cashier/setting/get",
    "homepage/block/page",
    "user/follow/users/mixed/get/v2",
    "link/position/show/resource",
    "link/home/framework/tab",
    "link/home/framework/top/tab",
    "link/page/discovery/resource/show",
    "link/page/rcmd/resource/show",
    "link/page/rcmd/block/resource/multi/refresh",
  ]) {
    assert.equal(matcher.test(`https://interface.music.163.com/api/${route}`), true, route);
  }
  assert.equal(matcher.test("https://interface.music.163.com/api/unrelated"), false);
});

test("Netease native entry returns byte-compatible AES output", async () => {
  const result = await netease(context(
    "https://interface.music.163.com/api/sp/flow/popup/query",
    { data: { advertisement: true } },
  ));
  assert.ok(result.body instanceof Uint8Array);
  assert.deepEqual(decodeBody(result.body, true), { data: {} });
});

test("Netease native ctx env still controls bottom tabs", async () => {
  const result = await netease(context(
    "https://interface.music.163.com/api/link/home/framework/tab",
    { data: { commonResourceList: [
      { title: "发现" },
      { title: "漫游" },
      { title: "首页" },
    ] } },
    { FX: "1", MY: "0", SY_NAME: "推荐" },
  ));
  assert.deepEqual(
    decodeBody(result.body, true).data.commonResourceList.map((item) => item.title),
    ["漫游", "推荐"],
  );
});

test("Netease remains outside the ad-only combined module", async () => {
  const combined = YAML.parse(await readFile(
    new URL("../modules/ad/ad-combined.yaml", import.meta.url),
    "utf8",
  ));
  const serializedContent = JSON.stringify({
    rules: combined.rules,
    scriptings: combined.scriptings,
    url_rewrites: combined.url_rewrites,
    map_locals: combined.map_locals,
    mitm: combined.mitm,
  });
  assert.doesNotMatch(serializedContent, /scripts\/music\/netease|music\.163\.com/u);
});

function context(url, value, env = {}) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return {
    env,
    request: { url },
    response: {
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    },
    storage: { get: () => null },
  };
}
