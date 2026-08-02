import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import YAML from "yaml";
import { convertSurgeModule } from "./convert-surge-module.mjs";
import { fetchText, sha256 } from "./module-tools.mjs";

const root = path.resolve(import.meta.dirname, "..");
const category = "music";
const slug = "netease";
const originalModuleUrl = "https://raw.githubusercontent.com/Yu9191/NeteasemusicAd/main/wyy.sgmodule";
const originalScriptUrl = "https://raw.githubusercontent.com/Yu9191/NeteasemusicAd/main/wyyad.js";
const scriptUrl = "https://raw.githubusercontent.com/AWelook/Egern-Modules-Optimized/main/scripts/music/netease/wyyad.js";
const upstreamDir = path.join(root, "upstream", category, slug);
const convertedDir = path.join(root, "converted", category, slug);
await Promise.all([
  mkdir(upstreamDir, { recursive: true }),
  mkdir(convertedDir, { recursive: true }),
  mkdir(path.join(root, "modules", category), { recursive: true }),
]);

const [originalModule, originalScript] = await Promise.all([
  fetchWithSystemFallback(originalModuleUrl),
  fetchWithSystemFallback(originalScriptUrl),
]);
await Promise.all([
  writeFile(path.join(upstreamDir, "wyy.sgmodule"), originalModule),
  writeFile(path.join(upstreamDir, "wyyad.js"), originalScript),
]);

const scriptMap = new Map([[originalScriptUrl, scriptUrl]]);
const converted = convertSurgeModule(originalModule, { scriptUrlMap: scriptMap });
normalizeNeteaseDocument(converted.document, false);
await writeFile(
  path.join(convertedDir, "unoptimized.yaml"),
  YAML.stringify(converted.document, { lineWidth: 0 }),
);

const optimizedSurge = await readFile(path.join(root, "sources", category, slug, "wyy.optimized.sgmodule"), "utf8");
const optimized = convertSurgeModule(optimizedSurge, { scriptUrlMap: new Map([["wyyad.js", scriptUrl]]) });
if (optimized.warnings.length) {
  throw new Error(`网易云存在未转换内容:\n${optimized.warnings.join("\n")}`);
}
normalizeNeteaseDocument(optimized.document, true);
await writeFile(
  path.join(root, "modules", category, `${slug}.yaml`),
  YAML.stringify(optimized.document, { lineWidth: 0 }),
);

const registryPath = path.join(root, "registry.json");
const registry = JSON.parse(await readFile(registryPath, "utf8"));
const record = {
  slug,
  category,
  upstream_url: originalModuleUrl,
  upstream_path: `upstream/${category}/${slug}/wyy.sgmodule`,
  normalization_url: null,
  normalization_path: null,
  converted_path: `converted/${category}/${slug}/unoptimized.yaml`,
  published_path: `modules/${category}/${slug}.yaml`,
  scripts: [{
    upstream_url: originalScriptUrl,
    upstream_path: `upstream/${category}/${slug}/wyyad.js`,
    published_path: `scripts/${category}/${slug}/wyyad.js`,
    runtime: "egern-native",
    sha256: sha256(originalScript),
  }],
  dependencies: [],
  status: "published",
  upstream_sha256: sha256(originalModule),
  warnings: [],
  conversion_notes: [
    "Surge 的 REJECT-NO-DROP 在 Egern 中使用原生 REJECT",
    "九个 Surge 脚本注册合并为一个精确匹配的 Egern 二进制响应脚本",
  ],
};
const index = registry.findIndex((item) => item.category === category && item.slug === slug);
if (index >= 0) registry[index] = record;
else registry.push(record);
registry.sort((a, b) => `${a.category}/${a.slug}`.localeCompare(`${b.category}/${b.slug}`));
await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
console.log("已迁移网易云音乐优化模块");

function normalizeNeteaseDocument(document, optimized) {
  document.name = optimized ? "网易云音乐净化（Egern 低开销版）" : document.name;
  document.description = optimized
    ? "去广告、评论净化、Tab 与首页定制；Egern 原生二进制/AES 处理"
    : document.description;
  document.homepage = "https://github.com/AWelook/Egern-Modules-Optimized";
  document.compat_arguments_desc = document.compat_arguments_desc?.trimStart();
  for (const rule of document.rules ?? []) {
    const body = Object.values(rule)[0];
    if (body.policy === "REJECT-NO-DROP") body.policy = "REJECT";
  }
  const env = {
    FX: "{{{发现}}}", MY: "{{{漫游}}}", DT: "{{{笔记}}}", GZ: "{{{关注}}}", SOU: "{{{搜索}}}",
    SY_NAME: "{{{首页自定义名称}}}", WD_NAME: "{{{我的自定义名称}}}", MY_NAME: "{{{漫游自定义名称}}}",
    DT_NAME: "{{{笔记自定义名称}}}", FX_NAME: "{{{发现自定义名称}}}", XD: "{{{心动}}}", BK: "{{{播客}}}",
    TS: "{{{听书}}}", HDTAB: "{{{活动Tab}}}", PRGG: "{{{问候语}}}", PRDRD: "{{{每日推荐}}}",
    PRSCVPT: "{{{推荐歌单}}}", PRST: "{{{最近常听}}}", HMPR: "{{{音乐合伙人}}}", PRRR: "{{{雷达歌单}}}",
    PRRK: "{{{排行榜}}}", PRMST: "{{{推荐专属歌单}}}", PRCN: "{{{你的专属歌单}}}",
    PRPRS: "{{{私房推荐歌曲}}}", PRRSS: "{{{红心相似歌曲}}}",
  };
  for (const entry of document.scriptings ?? []) {
    const scripting = Object.values(entry)[0];
    scripting.script_url = scriptUrl;
    scripting.body_required = true;
    scripting.binary_body = true;
    scripting.max_size = 0;
    scripting.timeout = 20;
    scripting.env = env;
  }
}

async function fetchWithSystemFallback(url) {
  try {
    return await fetchText(url);
  } catch (error) {
    if (error?.cause?.code !== "SELF_SIGNED_CERT_IN_CHAIN") throw error;
    return execFileSync("curl", ["-fsSL", url], { encoding: "utf8" });
  }
}
