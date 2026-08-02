import { readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import YAML from "yaml";
import { sha256 } from "./module-tools.mjs";

const root = path.resolve(import.meta.dirname, "..");
const rawPrefix = "https://raw.githubusercontent.com/AWelook/Egern-Modules-Optimized/main/";
const targets = new Map();

for (const category of await readdir(path.join(root, "modules"), { withFileTypes: true })) {
  if (!category.isDirectory()) continue;
  for (const fileName of await readdir(path.join(root, "modules", category.name))) {
    if (!fileName.endsWith(".yaml")) continue;
    const modulePath = `modules/${category.name}/${fileName}`;
    targets.set(`${rawPrefix}${modulePath}`, modulePath);
    const document = YAML.parse(await readFile(path.join(root, modulePath), "utf8"));
    for (const entry of document.scriptings ?? []) {
      const url = Object.values(entry)[0]?.script_url;
      if (url?.startsWith(rawPrefix)) targets.set(url, url.slice(rawPrefix.length));
    }
  }
}

const failures = [];
for (const [url, relativePath] of targets) {
  const localHash = sha256(await readFile(path.join(root, relativePath)));
  let remoteHash;
  let lastError;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const body = await fetchRemote(`${url}?integrity=${localHash.slice(0, 12)}-${attempt}`);
      remoteHash = sha256(body);
      if (remoteHash === localHash) break;
      lastError = new Error(`哈希不一致 ${remoteHash} != ${localHash}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  if (remoteHash !== localHash) failures.push(`${relativePath}: ${lastError?.message ?? "验证失败"}`);
}

async function fetchRemote(url) {
  try {
    const response = await fetch(url, {
      headers: { "cache-control": "no-cache", "user-agent": "AWelook/Egern-Modules-Optimized" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (error?.cause?.code !== "SELF_SIGNED_CERT_IN_CHAIN") throw error;
    return execFileSync("curl", ["-fsSL", "--max-time", "15", url]);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Raw 验证通过：${targets.size} 个模块或脚本`);
}
