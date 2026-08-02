import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha256 } from "./module-tools.mjs";

const root = path.resolve(import.meta.dirname, "..");
const registryPath = path.join(root, "registry.json");
const registry = JSON.parse(await readFile(registryPath, "utf8"));
const expected = structuredClone(registry);

for (const item of expected) {
  if (item.published_path) item.published_sha256 = await digest(item.published_path);
  for (const script of item.scripts ?? []) {
    if (script.published_path) script.published_sha256 = await digest(script.published_path);
  }
  for (const dependency of item.dependencies ?? []) {
    if (dependency.published_path) dependency.published_sha256 = await digest(dependency.published_path);
  }
}

const serialized = `${JSON.stringify(expected, null, 2)}\n`;
if (process.argv.includes("--check")) {
  const current = await readFile(registryPath, "utf8");
  if (current !== serialized) throw new Error("registry.json 发布哈希已过期，请运行 npm run integrity:update");
  console.log("发布文件哈希为最新版本");
} else {
  await writeFile(registryPath, serialized);
  console.log("已更新 registry.json 发布哈希");
}

async function digest(relativePath) {
  return sha256(await readFile(path.join(root, relativePath)));
}
