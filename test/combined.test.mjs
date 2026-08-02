import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { COMBINED_SOURCES, buildCombinedModule } from "../tools/build-combined-module.mjs";

test("combined module uses the same nine members as Surge", () => {
  assert.deepEqual(COMBINED_SOURCES.map(([slug]) => slug), [
    "12306",
    "amap-ads",
    "coolapk-ads",
    "didichuxing",
    "goofish-ads",
    "pinduoduo-ads",
    "reddit-ads",
    "weibo-intl-ads",
    "xiaohongshu-ads",
  ]);
});

test("combined module is a conflict-checked union with one shared AMDC", async () => {
  const root = path.resolve(import.meta.dirname, "..");
  const documents = new Map();
  for (const [slug] of COMBINED_SOURCES) {
    documents.set(slug, YAML.parse(await readFile(path.join(root, "modules/ad", `${slug}.yaml`), "utf8")));
  }
  const combined = buildCombinedModule(documents);
  const amdc = combined.scriptings.filter((item) => Object.values(item)[0]?.name?.includes("amdc"));
  assert.equal(amdc.length, 1);
  assert.equal(amdc[0].http_response.name, "combined_amdc");
  assert.equal(amdc[0].http_response.body_required, false);
  assert.equal("max_size" in amdc[0].http_response, false);
  assert.deepEqual(combined.compat_arguments, documents.get("reddit-ads").compat_arguments);
  for (const key of ["rules", "url_rewrites", "body_rewrites", "map_locals", "scriptings"]) {
    const fingerprints = (combined[key] ?? []).map(JSON.stringify);
    assert.equal(new Set(fingerprints).size, fingerprints.length, `${key} 含重复项`);
  }
  const hosts = combined.mitm.hostnames.includes;
  assert.equal(new Set(hosts).size, hosts.length);
});
