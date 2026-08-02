import test from "node:test";
import assert from "node:assert/strict";
import {
  hasEgernDefaultExport, parseArgs, parseBoolean, slugify, splitCommaFields, uniqueFileName,
} from "../tools/module-tools.mjs";

test("slugifies names safely", () => assert.equal(slugify("A Map Ads.js"), "a-map-ads-js"));
test("parses CLI flags", () => assert.deepEqual(parseArgs(["--url", "https://x", "--publish"]), { url: "https://x", publish: true }));
test("does not split commas inside quotes", () => assert.deepEqual(splitCommaFields('a,"b,c",d'), ["a", '"b,c"', "d"]));
test("does not split commas inside logical groups", () => assert.deepEqual(splitCommaFields("AND,((DOMAIN,a),(PROTOCOL,QUIC)),REJECT"), ["AND", "((DOMAIN,a),(PROTOCOL,QUIC))", "REJECT"]));
test("parses Surge boolean spellings", () => {
  for (const value of [true, "true", "1", "yes", "on"]) assert.equal(parseBoolean(value), true);
  for (const value of [false, "false", "0", "no", "off"]) assert.equal(parseBoolean(value), false);
  assert.throws(() => parseBoolean("maybe"), /无效布尔值/u);
});
test("recognizes source and bundled Egern default exports", () => {
  assert.equal(hasEgernDefaultExport("export default async function (ctx) {}"), true);
  assert.equal(hasEgernDefaultExport("export{handler as default}"), true);
  assert.equal(hasEgernDefaultExport("$done({})"), false);
});
test("keeps colliding remote script names unique", () => {
  const used = new Set();
  const first = uniqueFileName("index", ".js", "https://a.example/index.js", used);
  const second = uniqueFileName("index", ".js", "https://b.example/index.js", used);
  assert.equal(first, "index.js");
  assert.match(second, /^index-[a-f0-9]{8}\.js$/u);
  assert.notEqual(first, second);
});
