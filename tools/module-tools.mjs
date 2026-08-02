import { createHash } from "node:crypto";
import path from "node:path";

export function slugify(value) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "module";
}

export function assertSegment(value, label) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) {
    throw new Error(`${label} 只能包含小写字母、数字和连字符: ${value}`);
  }
  return value;
}

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`无效布尔值: ${value}`);
}

export function hasEgernDefaultExport(code) {
  return /export\s+default\s+(?:async\s+)?function\b/.test(code)
    || /export\s*\{[^}]*\bas\s+default\b[^}]*\}/.test(code);
}

export function uniqueFileName(base, extension, identity, usedNames) {
  let candidate = `${base}${extension}`;
  if (usedNames.has(candidate)) candidate = `${base}-${sha256(identity).slice(0, 8)}${extension}`;
  let counter = 2;
  while (usedNames.has(candidate)) {
    candidate = `${base}-${sha256(identity).slice(0, 8)}-${counter}${extension}`;
    counter += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

export function extensionFromUrl(url, fallback = ".txt") {
  const ext = path.extname(new URL(url).pathname);
  return ext && ext.length <= 12 ? ext : fallback;
}

export async function fetchText(url, { retries = 2, timeoutMs = 20_000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "AWelook/Egern-Modules-Optimized" },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        const error = new Error(`下载失败 ${response.status}: ${url}`);
        error.status = response.status;
        throw error;
      }
      return response.text();
    } catch (error) {
      lastError = error;
      const retryable = error?.name === "TimeoutError"
        || error?.name === "AbortError"
        || error?.status === 408
        || error?.status === 429
        || error?.status >= 500
        || Boolean(error?.cause);
      if (!retryable || attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError;
}

export function parseArgs(argv) {
  const result = { publish: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--publish") {
      result.publish = true;
      continue;
    }
    if (!token.startsWith("--")) throw new Error(`无法识别的参数: ${token}`);
    const key = token.slice(2).replaceAll("-", "_");
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`参数缺少值: ${token}`);
    result[key] = value;
    index += 1;
  }
  return result;
}

export function splitSections(text) {
  const sections = new Map();
  let current = "metadata";
  sections.set(current, []);
  for (const rawLine of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const match = rawLine.trim().match(/^\[([^\]]+)]$/);
    if (match) {
      current = match[1].trim().toLowerCase();
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    sections.get(current).push(rawLine);
  }
  return sections;
}

export function activeLines(lines = []) {
  return lines.map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
}

export function parseMetadata(lines = []) {
  const metadata = {};
  for (const line of lines) {
    const match = line.match(/^#!([\w-]+)\s*=\s*(.*)$/);
    if (match) metadata[match[1].toLowerCase()] = match[2].trim();
  }
  return metadata;
}

export function splitCommaFields(value) {
  const fields = [];
  let start = 0;
  let quote = null;
  let escaped = false;
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (escaped) { escaped = false; continue; }
    if (char === "\\") { escaped = true; continue; }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === "(") { depth += 1; continue; }
    if (char === ")") { depth = Math.max(0, depth - 1); continue; }
    if (char === "," && depth === 0) {
      fields.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  fields.push(value.slice(start).trim());
  return fields.filter(Boolean);
}

export function unquote(value) {
  if (value.length >= 2 && ((value[0] === '"' && value.at(-1) === '"') || (value[0] === "'" && value.at(-1) === "'"))) {
    return value.slice(1, -1);
  }
  return value;
}
