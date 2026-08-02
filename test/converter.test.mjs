import test from "node:test";
import assert from "node:assert/strict";
import YAML from "yaml";
import { convertSurgeModule, extractScriptUrls } from "../tools/convert-surge-module.mjs";

const source = `#!name=Example
#!desc=Test module
[Rule]
DOMAIN-SUFFIX,ads.example.com,REJECT
IP-CIDR,10.0.0.0/8,DIRECT,no-resolve
[Body Rewrite]
http-response-jq ^https:\\/\\/api\\.example\\.com\\/v1 '.data.ads = []'
[Map Local]
^https:\\/\\/api\\.example\\.com\\/splash data-type=text data="{}" status-code=200 header="Content-Type:application/json"
[Script]
clean = type=http-response, pattern=^https:\\/\\/api\\.example\\.com, script-path=https://example.com/clean.js, requires-body=true, max-size=-1, timeout=60
[MITM]
hostname = %APPEND% api.example.com
`;

test("converts common Surge sections to native Egern YAML", () => {
  const mapped = new Map([["https://example.com/clean.js", "https://raw.example/clean.js"]]);
  const result = convertSurgeModule(source, { scriptUrlMap: mapped });
  const parsed = YAML.parse(result.yaml);
  assert.equal(result.warnings.length, 0);
  assert.equal(parsed.rules[0].domain_suffix.match, "ads.example.com");
  assert.equal(parsed.rules[1].ip_cidr.no_resolve, true);
  assert.equal(parsed.body_rewrites[0].response_jq.filter, ".data.ads = []");
  assert.equal(parsed.map_locals[0].headers["Content-Type"], "application/json");
  assert.equal(parsed.scriptings[0].http_response.script_url, "https://raw.example/clean.js");
  assert.equal(parsed.scriptings[0].http_response.max_size, -1);
  assert.deepEqual(parsed.mitm.hostnames.includes, ["api.example.com"]);
});

test("extracts each remote script once", () => {
  assert.deepEqual(extractScriptUrls(source), ["https://example.com/clean.js"]);
});

test("reports unsupported input instead of silently dropping it", () => {
  const result = convertSurgeModule("#!name=X\n[Body Rewrite]\nunsupported thing");
  assert.deepEqual(result.warnings, ["未转换 Body Rewrite: unsupported thing"]);
});

test("converts logical rules and tiny GIF map-local without losing behavior", () => {
  const input = `#!name=X
[Rule]
AND,((DOMAIN,api.example.com),(PROTOCOL,QUIC)),REJECT
[Map Local]
^https:\\/\\/img\\.example\\.com\\/ad data-type=tiny-gif status-code=200
`;
  const result = convertSurgeModule(input);
  assert.equal(result.warnings.length, 0);
  assert.deepEqual(result.document.rules[0].and.match, [
    { domain: { match: "api.example.com" } },
    { protocol: { match: "QUIC" } }
  ]);
  assert.equal(result.document.url_rewrites[0].location, "http://reject-img/");
});
