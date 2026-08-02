import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { convertSurgeModule, extractScriptUrls } from "./convert-surge-module.mjs";
import {
  assertSegment, extensionFromUrl, fetchText, parseArgs, sha256, slugify
} from "./module-tools.mjs";

const root = path.resolve(import.meta.dirname, "..");
const args = parseArgs(process.argv.slice(2));
if (!args.url) throw new Error("必须提供 --url");
const category = assertSegment(args.category ?? "misc", "category");
const slug = assertSegment(args.slug ?? slugify(new URL(args.url).pathname), "slug");
const sourceText = await fetchText(args.url);
const conversionText = args.converted_url ? await fetchText(args.converted_url) : sourceText;
const isEgern = /\.ya?ml(?:$|\?)/i.test(args.converted_url ?? args.url) && !/^\s*\[[^\]]+]/m.test(conversionText);
const egernDocument = isEgern ? YAML.parse(conversionText) : null;
const upstreamDir = path.join(root, "upstream", category, slug);
const convertedDir = path.join(root, "converted", category, slug);
const scriptDir = path.join(root, "scripts", category, slug);
await Promise.all([mkdir(upstreamDir, { recursive: true }), mkdir(convertedDir, { recursive: true }), mkdir(scriptDir, { recursive: true })]);

const sourceName = `source${extensionFromUrl(args.url)}`;
await writeFile(path.join(upstreamDir, sourceName), sourceText);
const normalizationName = args.converted_url ? `script-hub${extensionFromUrl(args.converted_url)}` : null;
if (normalizationName) await writeFile(path.join(upstreamDir, normalizationName), conversionText);

const scriptUrls = isEgern
  ? [...new Set((egernDocument.scriptings ?? []).flatMap((entry) => Object.values(entry)).map((entry) => entry?.script_url).filter((url) => typeof url === "string" && url.startsWith("http")))]
  : extractScriptUrls(conversionText);
const scriptRecords = [];
const scriptUrlMap = new Map();
for (let index = 0; index < scriptUrls.length; index += 1) {
  const url = scriptUrls[index];
  const base = slugify(path.basename(new URL(url).pathname, path.extname(new URL(url).pathname))) || `script-${index + 1}`;
  const fileName = `${base}.js`;
  const raw = await fetchText(url);
  await writeFile(path.join(upstreamDir, fileName), raw);
  const publishedPath = `scripts/${category}/${slug}/${fileName}`;
  scriptUrlMap.set(url, `https://raw.githubusercontent.com/AWelook/Egern-Modules-Optimized/main/${publishedPath}`);
  scriptRecords.push({ upstream_url: url, upstream_path: `upstream/${category}/${slug}/${fileName}`, published_path: publishedPath, sha256: sha256(raw) });
}

let convertedYaml;
let warnings = [];
if (isEgern) {
  for (const entry of egernDocument.scriptings ?? []) {
    for (const scripting of Object.values(entry)) {
      if (scriptUrlMap.has(scripting?.script_url)) scripting.script_url = scriptUrlMap.get(scripting.script_url);
    }
  }
  convertedYaml = YAML.stringify(egernDocument, { lineWidth: 0 });
} else {
  const converted = convertSurgeModule(conversionText, { scriptUrlMap });
  convertedYaml = converted.yaml;
  warnings = converted.warnings;
}
const convertedPath = `converted/${category}/${slug}/unoptimized.yaml`;
await writeFile(path.join(root, convertedPath), convertedYaml);

const nativeScriptsReady = await Promise.all(scriptRecords.map(async ({ published_path: publishedPath }) => {
  try {
    const code = await readFile(path.join(root, publishedPath), "utf8");
    return /export\s+default\s+async\s+function/.test(code);
  } catch { return false; }
}));
const canPublish = warnings.length === 0 && nativeScriptsReady.every(Boolean);
if (args.publish && !canPublish) {
  throw new Error(`拒绝发布：${warnings.length} 条未转换内容，${nativeScriptsReady.filter((ready) => !ready).length} 个脚本尚未迁移为 Egern 原生格式`);
}
const publishedPath = `modules/${category}/${slug}.yaml`;
if (args.publish) await writeFile(path.join(root, publishedPath), convertedYaml);

const registryPath = path.join(root, "registry.json");
const registry = JSON.parse(await readFile(registryPath, "utf8"));
const record = {
  slug, category, upstream_url: args.url,
  normalization_url: args.converted_url ?? null,
  normalization_path: normalizationName ? `upstream/${category}/${slug}/${normalizationName}` : null,
  normalization_sha256: args.converted_url ? sha256(conversionText) : null,
  upstream_path: `upstream/${category}/${slug}/${sourceName}`,
  converted_path: convertedPath,
  published_path: args.publish ? publishedPath : null,
  scripts: scriptRecords,
  status: args.publish ? "published" : "needs-optimization",
  upstream_sha256: sha256(sourceText),
  warnings
};
const existing = registry.findIndex((item) => item.slug === slug && item.category === category);
if (existing >= 0) registry[existing] = record; else registry.push(record);
registry.sort((a, b) => `${a.category}/${a.slug}`.localeCompare(`${b.category}/${b.slug}`));
await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

console.log(JSON.stringify({ category, slug, status: record.status, scripts: scriptRecords.length, warnings }, null, 2));
