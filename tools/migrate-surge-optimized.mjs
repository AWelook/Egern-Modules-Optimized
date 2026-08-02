import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { convertSurgeModule } from "./convert-surge-module.mjs";
import { sha256 } from "./module-tools.mjs";

const root = path.resolve(import.meta.dirname, "..");
const surgeRoot = path.resolve(root, "..", "Surge-Modules-Optimized");
const surgeRegistry = JSON.parse(await readFile(path.join(surgeRoot, "registry.json"), "utf8"));
const rawRoot = "https://raw.githubusercontent.com/AWelook/Egern-Modules-Optimized/main";
const records = [];

for (const source of surgeRegistry) {
  const { category, slug } = source;
  const upstreamDir = path.join(root, "upstream", category, slug);
  const convertedDir = path.join(root, "converted", category, slug);
  await Promise.all([
    mkdir(upstreamDir, { recursive: true }),
    mkdir(convertedDir, { recursive: true }),
    mkdir(path.join(root, "modules", category), { recursive: true }),
  ]);
  await cp(path.join(surgeRoot, "upstream", category, slug), upstreamDir, { recursive: true });

  const scriptMap = new Map();
  for (const script of source.scripts ?? []) {
    scriptMap.set(
      script.url,
      `${rawRoot}/scripts/${category}/${slug}/${script.fileName}`,
    );
  }
  const surgeRawPrefix =
    "https://raw.githubusercontent.com/AWelook/Surge-Modules-Optimized/refs/heads/main/scripts/";
  const optimizedModuleText = await readFile(path.join(surgeRoot, source.moduleFile), "utf8");
  for (const match of optimizedModuleText.matchAll(/script-path=(https?:[^,\s]+)/g)) {
    const url = match[1];
    if (url.startsWith(surgeRawPrefix)) scriptMap.set(url, `${rawRoot}/scripts/${url.slice(surgeRawPrefix.length)}`);
  }

  const normalizedSurgePath = source.conversion?.snapshot
    ? path.join(surgeRoot, source.conversion.snapshot)
    : path.join(surgeRoot, source.upstreamFile);
  const normalizedSurgeText = await readFile(normalizedSurgePath, "utf8");
  if (source.conversion?.snapshot) {
    await cp(normalizedSurgePath, path.join(upstreamDir, "script-hub.sgmodule"));
  }
  const unoptimized = convertSurgeModule(normalizedSurgeText, { scriptUrlMap: scriptMap });
  if (slug === "reddit-ads") applyRedditTranslation(unoptimized.document);
  await writeFile(
    path.join(convertedDir, "unoptimized.yaml"),
    YAML.stringify(unoptimized.document, { lineWidth: 0 }),
  );

  const optimized = convertSurgeModule(optimizedModuleText, { scriptUrlMap: scriptMap });
  const allowedWarnings = [];
  if (slug === "reddit-ads") {
    if (
      optimized.warnings.length !== 3 ||
      !optimized.warnings.includes("未转换区段 [general]") ||
      optimized.warnings.filter((warning) => warning.startsWith("未转换 Header Rewrite:")).length !== 2
    ) {
      throw new Error(`Reddit 出现意外转换警告:\n${optimized.warnings.join("\n")}`);
    }
    allowedWarnings.push("[General] 为 Surge HTTP 引擎开关，Egern 原生重写不需要该开关");
    allowedWarnings.push("两个参数化 Header Rewrite 已迁移为 Egern 原生请求脚本");
    applyRedditTranslation(optimized.document);
  } else if (optimized.warnings.length) {
    throw new Error(`${slug} 存在未转换内容:\n${optimized.warnings.join("\n")}`);
  }
  for (const entry of optimized.document.scriptings ?? []) {
    const scripting = Object.values(entry)[0];
    if (scripting?.name === "amdc") {
      scripting.body_required = false;
      delete scripting.max_size;
      allowedWarnings.push("AMDC 原生脚本不读取上游响应体，已关闭 body_required 并移除无效的无限正文上限");
    }
  }
  optimized.document.homepage = "https://github.com/AWelook/Egern-Modules-Optimized";
  const publishedText = YAML.stringify(optimized.document, { lineWidth: 0 });
  const publishedPath = `modules/${category}/${slug}.yaml`;
  await writeFile(path.join(root, publishedPath), publishedText);

  const scripts = [];
  for (const script of source.scripts ?? []) {
    const upstreamPath = `upstream/${category}/${slug}/${script.fileName}`;
    const upstreamText = await readFile(path.join(root, upstreamPath), "utf8");
    scripts.push({
      upstream_url: script.url,
      upstream_path: upstreamPath,
      published_path: `scripts/${category}/${slug}/${script.fileName}`,
      runtime: "egern-native",
      sha256: sha256(upstreamText),
    });
  }
  if (slug === "reddit-ads") {
    scripts.push({
      upstream_url: null,
      upstream_path: null,
      published_path: "scripts/ad/reddit-ads/translation.js",
      runtime: "egern-native",
      generated: true,
      sha256: null,
    });
  }
  const dependencies = [];
  for (const dependency of source.dependencies ?? []) {
    const upstreamPath = `upstream/${category}/${slug}/${dependency.fileName}`;
    const upstreamText = await readFile(path.join(root, upstreamPath), "utf8");
    const publishedPath = `scripts/${category}/${slug}/${dependency.fileName}`;
    await cp(path.join(surgeRoot, "scripts", category, slug, dependency.fileName), path.join(root, publishedPath));
    dependencies.push({
      upstream_url: dependency.url,
      upstream_path: upstreamPath,
      published_path: publishedPath,
      runtime: "web-asset",
      sha256: sha256(upstreamText),
    });
  }
  const upstreamText = await readFile(path.join(root, source.upstreamFile), "utf8");
  records.push({
    slug,
    category,
    upstream_url: source.moduleUrl,
    upstream_path: source.upstreamFile,
    normalization_url: null,
    normalization_path: source.conversion ? `upstream/${category}/${slug}/script-hub.sgmodule` : null,
    converted_path: `converted/${category}/${slug}/unoptimized.yaml`,
    published_path: publishedPath,
    scripts,
    dependencies,
    status: "published",
    upstream_sha256: sha256(upstreamText),
    warnings: [],
    conversion_notes: allowedWarnings,
  });
}

records.sort((a, b) => `${a.category}/${a.slug}`.localeCompare(`${b.category}/${b.slug}`));
await writeFile(path.join(root, "registry.json"), `${JSON.stringify(records, null, 2)}\n`);
console.log(`已迁移 ${records.length} 个优化模块`);

function applyRedditTranslation(document) {
  if (document.compat_arguments_desc) {
    document.compat_arguments_desc = document.compat_arguments_desc.trimStart();
  }
  document.scriptings = [
    {
      http_request: {
        name: "reddit_translation",
        match: "^https:\\/\\/gql(?:-fed)?\\.reddit\\.com\\/",
        script_url: `${rawRoot}/scripts/ad/reddit-ads/translation.js`,
        env: {
          TRANSLATION: "{{{TRANSLATION}}}",
          TRANSLATION_VALUE: "{{{TRANSLATION_VALUE}}}",
        },
      },
    },
  ];
}
