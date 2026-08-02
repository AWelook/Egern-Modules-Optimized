/** Surge 模块参数是 query-string。 */
function parseArguments(input) {
  if (!input) return {};
  if (typeof input === "object") return input;

  const result = {};
  for (const pair of String(input).replace(/^\?/, "").split("&")) {
    if (!pair) continue;
    const separator = pair.indexOf("=");
    const rawKey = separator === -1 ? pair : pair.slice(0, separator);
    const rawValue = separator === -1 ? "" : pair.slice(separator + 1);
    const decode = value => {
      const normalized = value.replace(/\+/g, " ");
      try {
        return decodeURIComponent(normalized);
      } catch {
        return normalized;
      }
    };
    result[decode(rawKey)] = decode(rawValue).replace(/^"|"$/g, "");
  }
  return result;
}

function coerce(value) {
  if (typeof value !== "string") return value;
  if (value === "true") return 1;
  if (value === "false") return 0;
  if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
  return value;
}

function readPersistent(key) {
  try {
    const value = globalThis.$persistentStore?.read(key);
    if (value === null || value === undefined) return null;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  } catch {
    return null;
  }
}

function collectOverrides(defaults, source) {
  const overrides = {};
  for (const key of Object.keys(defaults)) {
    const value = source(key);
    if (value === undefined || value === null || value === "") continue;
    if (value === `{${key}}`) continue;
    if (typeof defaults[key] === "string" && (value === "0" || value === 0)) continue;
    overrides[key] = coerce(value);
  }
  return overrides;
}

export function getSettings(defaults, input = globalThis.$argument) {
  const args = parseArguments(input);
  const argumentOverrides = collectOverrides(defaults, key => args[key]);
  const boxOverrides = collectOverrides(defaults, key =>
    readPersistent(`wyy_${key}`)
  );

  // 与上游保持同一覆盖顺序，避免已有 BoxJS 用户的配置失效。
  switch (args.Storage) {
    case "Argument":
    case "$argument":
      return { ...defaults, ...boxOverrides, ...argumentOverrides };
    case "BoxJs":
    case "boxjs":
    case "PersistentStore":
    case "$persistentStore":
      return { ...defaults, ...boxOverrides };
    case "database":
      return { ...defaults };
    default:
      return { ...defaults, ...argumentOverrides, ...boxOverrides };
  }
}

export { parseArguments };
