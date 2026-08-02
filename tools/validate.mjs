import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

const root = path.resolve(import.meta.dirname, "..");
const registry = JSON.parse(await readFile(path.join(root, "registry.json"), "utf8"));
const errors = [];
for (const item of registry) {
  for (const key of ["upstream_path", "converted_path"]) {
    try { await access(path.join(root, item[key])); } catch { errors.push(`${item.category}/${item.slug}: 缺少 ${key}`); }
  }
  try { YAML.parse(await readFile(path.join(root, item.converted_path), "utf8")); } catch (error) { errors.push(`${item.category}/${item.slug}: 转换 YAML 无效: ${error.message}`); }
  if (item.status !== "published") continue;
  if (!item.published_path) errors.push(`${item.category}/${item.slug}: published 状态缺少 published_path`);
  else {
    try { YAML.parse(await readFile(path.join(root, item.published_path), "utf8")); } catch (error) { errors.push(`${item.category}/${item.slug}: 发布 YAML 无效: ${error.message}`); }
  }
  if (item.warnings?.length) errors.push(`${item.category}/${item.slug}: 发布项目仍有未转换内容`);
  for (const script of item.scripts ?? []) {
    try {
      const code = await readFile(path.join(root, script.published_path), "utf8");
      const hasNativeDefaultExport = /export\s+default\s+async\s+function/.test(code)
        || /export\s*\{[^}]*\bas\s+default\b[^}]*\}/.test(code);
      if (script.runtime !== "web-asset" && !hasNativeDefaultExport) errors.push(`${script.published_path}: 不是 Egern 原生脚本`);
    } catch { errors.push(`${script.published_path}: 发布脚本不存在`); }
  }
  for (const dependency of item.dependencies ?? []) {
    try { await access(path.join(root, dependency.published_path)); }
    catch { errors.push(`${dependency.published_path}: 发布依赖不存在`); }
  }
}
const rawPrefix = "https://raw.githubusercontent.com/AWelook/Egern-Modules-Optimized/main/";
for (const categoryEntry of await readdir(path.join(root, "modules"), { withFileTypes: true })) {
  if (!categoryEntry.isDirectory()) continue;
  for (const fileName of await readdir(path.join(root, "modules", categoryEntry.name))) {
    if (!fileName.endsWith(".yaml")) continue;
    const relativePath = `modules/${categoryEntry.name}/${fileName}`;
    const modulePath = path.join(root, relativePath);
    let document;
    try { document = YAML.parse(await readFile(modulePath, "utf8")); }
    catch (error) { errors.push(`${relativePath}: YAML 无效: ${error.message}`); continue; }
    for (const entry of document.scriptings ?? []) {
      const scripting = Object.values(entry)[0];
      const url = scripting?.script_url;
      if (!url?.startsWith(rawPrefix)) {
        errors.push(`${relativePath}: 脚本未托管在本仓库: ${url ?? "missing"}`);
        continue;
      }
      try { await access(path.join(root, url.slice(rawPrefix.length))); }
      catch { errors.push(`${relativePath}: 脚本链接目标不存在: ${url}`); }
    }
  }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else console.log(`验证通过：${registry.length} 个登记项目`);
