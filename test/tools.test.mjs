import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs, slugify, splitCommaFields } from "../tools/module-tools.mjs";

test("slugifies names safely", () => assert.equal(slugify("A Map Ads.js"), "a-map-ads-js"));
test("parses CLI flags", () => assert.deepEqual(parseArgs(["--url", "https://x", "--publish"]), { url: "https://x", publish: true }));
test("does not split commas inside quotes", () => assert.deepEqual(splitCommaFields('a,"b,c",d'), ["a", '"b,c"', "d"]));
test("does not split commas inside logical groups", () => assert.deepEqual(splitCommaFields("AND,((DOMAIN,a),(PROTOCOL,QUIC)),REJECT"), ["AND", "((DOMAIN,a),(PROTOCOL,QUIC))", "REJECT"]));
