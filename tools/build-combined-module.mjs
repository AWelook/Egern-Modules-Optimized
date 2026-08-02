import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

export const COMBINED_MODULE_PATH = "modules/ad/ad-combined.yaml";
export const COMBINED_SOURCES = [
  ["12306", "12306"],
  ["amap-ads", "高德地图"],
  ["coolapk-ads", "酷安"],
  ["didichuxing", "滴滴出行"],
  ["goofish-ads", "闲鱼"],
  ["pinduoduo-ads", "拼多多"],
  ["reddit-ads", "Reddit"],
  ["weibo-intl-ads", "微博轻享版"],
  ["xiaohongshu-ads", "小红书"],
];

const ARRAY_KEYS = [
  "rules",
  "url_rewrites",
  "header_rewrites",
  "body_rewrites",
  "map_locals",
  "scriptings",
];

export function buildCombinedModule(documents) {
  const output = {
    name: "去广告合集（不含 Spotify 与网易云）",
    description:
      "合并 12306、高德地图、酷安、滴滴出行、闲鱼、拼多多、Reddit、微博轻享版和小红书去广告；请勿与对应单独版同时启用",
    author: "原规则作者与 AWelook",
    homepage: "https://github.com/AWelook/Egern-Modules-Optimized",
  };
  const seen = Object.fromEntries(ARRAY_KEYS.map((key) => [key, new Set()]));
  const hostnames = new Set();

  for (const [slug] of COMBINED_SOURCES) {
    const document = documents.get(slug);
    if (!document) throw new Error(`缺少合集来源: ${slug}`);
    if (slug === "reddit-ads") {
      output.compat_arguments = document.compat_arguments;
      output.compat_arguments_desc = document.compat_arguments_desc;
    }
    for (const key of ARRAY_KEYS) {
      for (const item of document[key] ?? []) {
        if (
          key === "scriptings" &&
          ["amap-ads", "goofish-ads"].includes(slug) &&
          scriptingName(item) === "amdc"
        ) {
          continue;
        }
        const fingerprint = JSON.stringify(item);
        if (!seen[key].has(fingerprint)) {
          seen[key].add(fingerprint);
          (output[key] ??= []).push(item);
        }
      }
    }
    for (const hostname of document.mitm?.hostnames?.includes ?? []) hostnames.add(hostname);
  }

  (output.scriptings ??= []).push({
    http_response: {
      name: "combined_amdc",
      match:
        "^http:\\/\\/(?:amdc\\.m\\.taobao\\.com|[a-zA-Z0-9_-]+(?:\\.[a-zA-Z0-9_-]+){1,4}(?::\\d+)?\\/amdc\\/mobileDispatch)",
      script_url:
        "https://raw.githubusercontent.com/AWelook/Egern-Modules-Optimized/main/scripts/ad/goofish-ads/amdc.js",
      body_required: false,
      timeout: 60,
    },
  });
  output.mitm = { hostnames: { includes: [...hostnames] } };
  return output;
}

function scriptingName(item) {
  return Object.values(item)[0]?.name;
}

async function run() {
  const root = path.resolve(import.meta.dirname, "..");
  const documents = new Map();
  for (const [slug] of COMBINED_SOURCES) {
    const text = await readFile(path.join(root, "modules", "ad", `${slug}.yaml`), "utf8");
    documents.set(slug, YAML.parse(text));
  }
  const generated = YAML.stringify(buildCombinedModule(documents), { lineWidth: 0 });
  const outputPath = path.join(root, COMBINED_MODULE_PATH);
  if (process.argv.includes("--check")) {
    const current = await readFile(outputPath, "utf8").catch(() => "");
    if (current !== generated) throw new Error(`${COMBINED_MODULE_PATH} 已过期，请运行 npm run build:combined`);
    console.log(`合集为最新版本: ${COMBINED_MODULE_PATH}`);
    return;
  }
  await writeFile(outputPath, generated);
  console.log(`已生成 ${COMBINED_MODULE_PATH}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) await run();
