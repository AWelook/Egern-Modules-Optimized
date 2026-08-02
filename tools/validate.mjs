import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { hasEgernDefaultExport, sha256 } from "./module-tools.mjs";

const root = path.resolve(import.meta.dirname, "..");
const registry = JSON.parse(await readFile(path.join(root, "registry.json"), "utf8"));
const errors = [];
const projectKeys = new Set();
const registeredModules = new Set();
const publishedPaths = new Set();
const allowedStatuses = new Set(["published", "needs-optimization", "upstream-update"]);

for (const item of registry) {
  const projectKey = `${item.category}/${item.slug}`;
  if (projectKeys.has(projectKey)) errors.push(`${projectKey}: 登记重复`);
  projectKeys.add(projectKey);
  if (!allowedStatuses.has(item.status)) errors.push(`${projectKey}: 未知状态 ${item.status}`);

  await verifyHash(item.upstream_path, item.upstream_sha256, `${projectKey}: 上游模块`);
  if (item.normalization_path) {
    if (item.normalization_sha256) {
      await verifyHash(item.normalization_path, item.normalization_sha256, `${projectKey}: 格式转换来源`);
    } else {
      await verifyExists(item.normalization_path, `${projectKey}: 格式转换来源`);
    }
  }
  await verifyYaml(item.converted_path, `${projectKey}: 转换快照`);

  if (!item.published_path) {
    if (item.status === "published") errors.push(`${projectKey}: published 状态缺少 published_path`);
  } else {
    registeredModules.add(item.published_path);
    await claimPublishedPath(item.published_path, projectKey);
    await verifyYaml(item.published_path, `${projectKey}: 发布模块`);
    await verifyHash(item.published_path, item.published_sha256, `${projectKey}: 发布模块`);
    if (item.warnings?.length) errors.push(`${projectKey}: 发布项目仍有未转换内容`);
  }

  for (const script of item.scripts ?? []) {
    if (script.upstream_path) await verifyHash(script.upstream_path, script.sha256, `${projectKey}: 上游脚本`);
    if (!item.published_path) continue;
    await claimPublishedPath(script.published_path, projectKey);
    try {
      const code = await readFile(path.join(root, script.published_path), "utf8");
      if (script.runtime !== "web-asset" && !hasEgernDefaultExport(code)) {
        errors.push(`${script.published_path}: 不是 Egern 原生脚本`);
      }
      if (!["egern-native", "web-asset"].includes(script.runtime)) {
        errors.push(`${script.published_path}: 发布脚本 runtime 无效: ${script.runtime}`);
      }
      if (sha256(code) !== script.published_sha256) errors.push(`${script.published_path}: 发布哈希不匹配`);
    } catch {
      errors.push(`${script.published_path}: 发布脚本不存在`);
    }
  }

  for (const dependency of item.dependencies ?? []) {
    if (dependency.upstream_path) {
      await verifyHash(dependency.upstream_path, dependency.sha256, `${projectKey}: 上游依赖`);
    }
    if (!item.published_path) continue;
    await claimPublishedPath(dependency.published_path, projectKey);
    await verifyHash(dependency.published_path, dependency.published_sha256, `${projectKey}: 发布依赖`);
  }
}

const rawPrefix = "https://raw.githubusercontent.com/AWelook/Egern-Modules-Optimized/main/";
const derivedModules = new Set(["modules/ad/ad-combined.yaml"]);
for (const categoryEntry of await readdir(path.join(root, "modules"), { withFileTypes: true })) {
  if (!categoryEntry.isDirectory()) continue;
  for (const fileName of await readdir(path.join(root, "modules", categoryEntry.name))) {
    if (!fileName.endsWith(".yaml")) continue;
    const relativePath = `modules/${categoryEntry.name}/${fileName}`;
    if (!registeredModules.has(relativePath) && !derivedModules.has(relativePath)) {
      errors.push(`${relativePath}: 发布模块未登记`);
    }
    let document;
    try {
      document = YAML.parse(await readFile(path.join(root, relativePath), "utf8"));
    } catch (error) {
      errors.push(`${relativePath}: YAML 无效: ${error.message}`);
      continue;
    }
    for (const entry of document.scriptings ?? []) {
      const scripting = Object.values(entry)[0];
      const url = scripting?.script_url;
      if (!url?.startsWith(rawPrefix)) {
        errors.push(`${relativePath}: 脚本未托管在本仓库: ${url ?? "missing"}`);
        continue;
      }
      try {
        await access(path.join(root, url.slice(rawPrefix.length)));
      } catch {
        errors.push(`${relativePath}: 脚本链接目标不存在: ${url}`);
      }
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`验证通过：${registry.length} 个登记项目，${registeredModules.size + derivedModules.size} 个发布模块`);
}

async function claimPublishedPath(relativePath, projectKey) {
  if (!relativePath) {
    errors.push(`${projectKey}: 发布路径缺失`);
    return;
  }
  if (publishedPaths.has(relativePath)) errors.push(`${relativePath}: 发布路径重复`);
  publishedPaths.add(relativePath);
}

async function verifyYaml(relativePath, label) {
  if (!relativePath) {
    errors.push(`${label}: 路径缺失`);
    return;
  }
  try {
    YAML.parse(await readFile(path.join(root, relativePath), "utf8"));
  } catch (error) {
    errors.push(`${label} YAML 无效或不存在: ${error.message}`);
  }
}

async function verifyHash(relativePath, expectedHash, label) {
  if (!relativePath || !expectedHash) {
    errors.push(`${label}: 路径或哈希缺失`);
    return;
  }
  try {
    const actualHash = sha256(await readFile(path.join(root, relativePath)));
    if (actualHash !== expectedHash) errors.push(`${label}: 哈希不匹配`);
  } catch (error) {
    errors.push(`${label}: 文件不存在: ${error.message}`);
  }
}

async function verifyExists(relativePath, label) {
  try {
    await access(path.join(root, relativePath));
  } catch (error) {
    errors.push(`${label}: 文件不存在: ${error.message}`);
  }
}
