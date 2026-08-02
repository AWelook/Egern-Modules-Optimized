import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchText, sha256 } from "./module-tools.mjs";

const root = path.resolve(import.meta.dirname, "..");
const registryPath = path.join(root, "registry.json");
const registry = JSON.parse(await readFile(registryPath, "utf8"));
const changed = [];
for (const item of registry) {
  const sources = [
    ...(item.upstream_url ? [{ kind: "module", url: item.upstream_url, file: item.upstream_path, hashKey: "upstream_sha256" }] : []),
    ...(item.normalization_url ? [{ kind: "normalization", url: item.normalization_url, file: item.normalization_path, hashKey: "normalization_sha256" }] : []),
    ...(item.scripts ?? []).filter((script) => script.upstream_url).map((script) => ({ kind: "script", url: script.upstream_url, file: script.upstream_path, record: script })),
    ...(item.dependencies ?? []).filter((dependency) => dependency.upstream_url).map((dependency) => ({ kind: "dependency", url: dependency.upstream_url, file: dependency.upstream_path, record: dependency }))
  ];
  for (const source of sources) {
    const text = await fetchText(source.url);
    const digest = sha256(text);
    const oldDigest = source.record ? source.record.sha256 : item[source.hashKey];
    if (digest === oldDigest) continue;
    await writeFile(path.join(root, source.file), text);
    changed.push({ category: item.category, slug: item.slug, kind: source.kind, old_sha256: oldDigest, new_sha256: digest });
    if (source.record) source.record.sha256 = digest; else item[source.hashKey] = digest;
    item.status = "upstream-update";
  }
}
if (changed.length) await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
await writeFile(process.env.GITHUB_OUTPUT ?? "/dev/null", `changed=${JSON.stringify(changed)}\n`, { flag: "a" });
console.log(JSON.stringify(changed, null, 2));
