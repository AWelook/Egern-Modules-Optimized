import { execFileSync } from "node:child_process";

const repository = process.env.GITHUB_REPOSITORY;
if (!repository) throw new Error("缺少 GITHUB_REPOSITORY");

const changed = JSON.parse(process.env.CHANGED || "[]");
const failed = JSON.parse(process.env.FAILED || "[]");

ensureLabel("optimization-queue", "0E8A16", "Awaiting optimization or source review");
ensureLabel("upstream-update", "FBCA04", "Upstream changed and needs review");
ensureLabel("upstream-fetch-failed", "B60205", "Upstream could not be fetched");

for (const group of groupByProject(changed)) {
  const title = `Upstream update: ${group.category}/${group.slug}`;
  if (hasOpenIssue(title)) continue;
  const details = group.items.map((item) =>
    `- ${item.kind}: \`${item.old_sha256}\` → \`${item.new_sha256}\``).join("\n");
  createIssue(title, ["optimization-queue", "upstream-update"],
    `The following upstream sources changed:\n\n${details}\n\nFollow AGENTS.md before publishing.`);
}

for (const group of groupByProject(failed)) {
  const title = `Upstream fetch failed: ${group.category}/${group.slug}`;
  if (hasOpenIssue(title)) continue;
  const details = group.items.map((item) =>
    `- ${item.kind}: ${item.url}\n  - Error: \`${item.error}\``).join("\n");
  createIssue(title, ["optimization-queue", "upstream-fetch-failed"],
    `The following upstream sources could not be checked after retries:\n\n${details}\n\nRetry or inspect the source before processing updates.`);
}

function groupByProject(items) {
  const groups = new Map();
  for (const item of items) {
    const key = `${item.category}/${item.slug}`;
    if (!groups.has(key)) groups.set(key, { category: item.category, slug: item.slug, items: [] });
    groups.get(key).items.push(item);
  }
  return [...groups.values()];
}

function ensureLabel(name, color, description) {
  execFileSync("gh", ["label", "create", name, "--repo", repository, "--color", color,
    "--description", description, "--force"], { stdio: "inherit" });
}

function hasOpenIssue(title) {
  const output = execFileSync("gh", ["issue", "list", "--repo", repository, "--state", "open",
    "--search", `in:title ${JSON.stringify(title)}`, "--json", "title"], { encoding: "utf8" });
  return JSON.parse(output).some((issue) => issue.title === title);
}

function createIssue(title, labels, body) {
  execFileSync("gh", ["issue", "create", "--repo", repository, "--title", title,
    "--label", labels.join(","), "--body", body], { stdio: "inherit" });
}
