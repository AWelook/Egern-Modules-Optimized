import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import YAML from "yaml";

const document = YAML.parse(await readFile(
  new URL("../converted/tools/wloc/unoptimized.yaml", import.meta.url),
  "utf8",
));

test("WLOC Egern conversion preserves arguments and binary response settings", () => {
  assert.deepEqual(document.compat_arguments, {
    经度: "113.94114",
    纬度: "22.544577",
    精度: "25",
    日志级别: "info",
  });
  const response = document.scriptings[0].http_response;
  assert.equal(response.max_size, 0);
  assert.equal(response.timeout, 30);
  assert.equal(response.body_required, true);
  assert.equal(response.binary_body, true);
  assert.equal(
    response.env["_compat.$argument"],
    "longitude={{{经度}}}&latitude={{{纬度}}}&accuracy={{{精度}}}&logLevel={{{日志级别}}}",
  );
});

test("WLOC Egern conversion keeps both original scripts and MITM hosts", () => {
  assert.deepEqual(
    document.scriptings.map((entry) => Object.values(entry)[0].script_url),
    [
      "https://raw.githubusercontent.com/Yu9191/wloc/refs/heads/main/dist/wloc.js",
      "https://raw.githubusercontent.com/Yu9191/wloc/refs/heads/main/dist/wloc-settings.js",
    ],
  );
  assert.deepEqual(document.mitm.hostnames.includes, [
    "gs-loc.apple.com",
    "gs-loc-cn.apple.com",
  ]);
});
