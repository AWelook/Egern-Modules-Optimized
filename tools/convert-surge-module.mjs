import YAML from "yaml";
import {
  activeLines,
  parseMetadata,
  splitCommaFields,
  splitSections,
  unquote
} from "./module-tools.mjs";

const ruleTypes = new Map([
  ["DOMAIN", "domain"], ["DOMAIN-SUFFIX", "domain_suffix"],
  ["DOMAIN-KEYWORD", "domain_keyword"], ["DOMAIN-REGEX", "domain_regex"],
  ["IP-CIDR", "ip_cidr"], ["IP-CIDR6", "ip_cidr6"],
  ["GEOIP", "geoip"], ["URL-REGEX", "url_regex"],
  ["RULE-SET", "rule_set"], ["USER-AGENT", "user_agent"],
  ["PROTOCOL", "protocol"], ["DEST-PORT", "dest_port"]
]);

const rejectLocations = new Map([
  ["reject", "http://reject/"], ["reject-200", "http://reject-200/"],
  ["reject-dict", "http://reject-dict/"], ["reject-array", "http://reject-array/"],
  ["reject-img", "http://reject-img/"], ["reject-video", "http://reject-video/"]
]);

function add(target, key, value) {
  if (!target[key]) target[key] = [];
  target[key].push(value);
}

function unwrapParentheses(value) {
  let result = value.trim();
  while (result.startsWith("(") && result.endsWith(")")) {
    let depth = 0;
    let wrapsAll = true;
    for (let index = 0; index < result.length; index += 1) {
      if (result[index] === "(") depth += 1;
      else if (result[index] === ")") depth -= 1;
      if (depth === 0 && index < result.length - 1) { wrapsAll = false; break; }
    }
    if (!wrapsAll) break;
    result = result.slice(1, -1).trim();
  }
  return result;
}

function convertCondition(value) {
  const fields = splitCommaFields(unwrapParentheses(value));
  const type = ruleTypes.get(fields[0]?.toUpperCase());
  if (!type || fields.length < 2) return null;
  const rawMatch = unquote(fields[1]);
  const condition = { [type]: { match: type === "protocol" ? rawMatch.toLowerCase() : rawMatch } };
  if (["ip_cidr", "ip_cidr6", "geoip"].includes(type) && fields.slice(2).some((item) => item.toLowerCase() === "no-resolve")) {
    condition[type].no_resolve = true;
  }
  return condition;
}

function convertLogicalRule(sourceType, fields, warnings, line) {
  if (fields.length < 2) return null;
  const logicalType = sourceType.toLowerCase();
  if (logicalType === "not") {
    const condition = convertCondition(fields[0]);
    return condition ? { not: { match: condition, policy: unquote(fields[1]) } } : null;
  }
  const conditions = splitCommaFields(unwrapParentheses(fields[0])).map(convertCondition);
  if (conditions.some((condition) => condition === null)) {
    warnings.push(`未完整转换逻辑 Rule: ${line}`);
    return null;
  }
  return { [logicalType]: { match: conditions, policy: unquote(fields[1]) } };
}

function convertRules(lines, output, warnings) {
  for (const line of activeLines(lines)) {
    const fields = splitCommaFields(line);
    const sourceType = fields.shift()?.toUpperCase();
    if (["AND", "OR", "NOT"].includes(sourceType)) {
      const logical = convertLogicalRule(sourceType, fields, warnings, line);
      if (logical) add(output, "rules", logical);
      else if (!warnings.at(-1)?.includes(line)) warnings.push(`未转换 Rule: ${line}`);
      continue;
    }
    if (sourceType === "FINAL" || sourceType === "MATCH") {
      add(output, "rules", [{ default: { policy: fields[0] } }][0]);
      continue;
    }
    const type = ruleTypes.get(sourceType);
    if (!type || fields.length < 2) {
      warnings.push(`未转换 Rule: ${line}`);
      continue;
    }
    const rawMatch = unquote(fields[0]);
    const match = type === "protocol" ? rawMatch.toLowerCase() : rawMatch;
    const policy = unquote(fields[1]);
    const body = { match, policy };
    if (["ip_cidr", "ip_cidr6", "geoip"].includes(type) && fields.slice(2).some((item) => item.toLowerCase() === "no-resolve")) {
      body.no_resolve = true;
    }
    add(output, "rules", { [type]: body });
  }
}

function convertUrlRewrites(lines, output, warnings) {
  for (const line of activeLines(lines)) {
    const match = line.match(/^(\S+)\s+(\S+)\s+(\S+)$/);
    if (!match) { warnings.push(`未转换 URL Rewrite: ${line}`); continue; }
    const [, pattern, replacement, modeRaw] = match;
    const mode = modeRaw.toLowerCase();
    const item = { match: unquote(pattern) };
    if (rejectLocations.has(mode)) item.location = rejectLocations.get(mode);
    else {
      item.location = unquote(replacement);
      if (/^(301|302|307|308)$/.test(mode)) item.status_code = Number(mode);
      else if (mode !== "header") { warnings.push(`未转换 URL Rewrite 模式: ${line}`); continue; }
    }
    add(output, "url_rewrites", item);
  }
}

function parseJqLine(line) {
  const match = line.match(/^(http-(?:request|response)-jq)\s+(\S+)\s+([\s\S]+)$/);
  if (!match) return null;
  return {
    type: match[1] === "http-request-jq" ? "request_jq" : "response_jq",
    match: unquote(match[2]),
    filter: unquote(match[3].trim())
  };
}

function convertBodyRewrites(lines, output, warnings) {
  for (const line of activeLines(lines)) {
    const parsed = parseJqLine(line);
    if (!parsed) { warnings.push(`未转换 Body Rewrite: ${line}`); continue; }
    add(output, "body_rewrites", { [parsed.type]: { match: parsed.match, filter: parsed.filter } });
  }
}

function convertHeaderRewrites(lines, output, warnings) {
  for (const line of activeLines(lines)) {
    const tokens = tokenizeOptions(line).map(unquote);
    if (tokens.length < 4 || !["http-request", "http-response"].includes(tokens[0])) {
      warnings.push(`未转换 Header Rewrite: ${line}`);
      continue;
    }
    const type = tokens[0] === "http-request" ? "request" : "response";
    const [pattern, action, name, value] = tokens.slice(1);
    if (action === "header-del" && tokens.length === 4) {
      add(output, "header_rewrites", { delete: { match: pattern, name, type } });
    } else if ((action === "header-add" || action === "header-replace") && value !== undefined) {
      add(output, "header_rewrites", { [action === "header-add" ? "add" : "replace"]: { match: pattern, name, value, type } });
    } else warnings.push(`未转换 Header Rewrite: ${line}`);
  }
}

function parseCompatArguments(value) {
  const result = {};
  for (const field of splitCommaFields(value)) {
    const separator = field.indexOf(":");
    if (separator > 0) result[field.slice(0, separator).trim()] = unquote(field.slice(separator + 1).trim());
  }
  return result;
}

function parseKeyValues(value) {
  const result = {};
  for (const field of splitCommaFields(value)) {
    const index = field.indexOf("=");
    if (index > 0) result[field.slice(0, index).trim().toLowerCase()] = unquote(field.slice(index + 1).trim());
  }
  return result;
}

function convertScripts(lines, output, warnings, scriptUrlMap) {
  for (const line of activeLines(lines)) {
    const equal = line.indexOf("=");
    if (equal < 1) { warnings.push(`未转换 Script: ${line}`); continue; }
    const name = line.slice(0, equal).trim();
    const values = parseKeyValues(line.slice(equal + 1));
    const sourceType = values.type?.toLowerCase();
    const type = sourceType === "http-request" ? "http_request" : sourceType === "http-response" ? "http_response" : null;
    if (!type || !values.pattern || !values["script-path"]) {
      warnings.push(`未转换 Script: ${line}`);
      continue;
    }
    const sourceUrl = values["script-path"];
    const body = {
      name,
      match: values.pattern,
      script_url: scriptUrlMap.get(sourceUrl) ?? sourceUrl
    };
    if (values["update-interval"]) body.update_interval = Number(values["update-interval"]);
    if (values["max-size"] !== undefined) body.max_size = Number(values["max-size"]);
    if (values.timeout !== undefined) body.timeout = Number(values.timeout);
    if (values["requires-body"] !== undefined) body.body_required = values["requires-body"] === "true";
    if (values["binary-body-mode"] !== undefined) body.binary_body = values["binary-body-mode"] === "true";
    add(output, "scriptings", { [type]: body });
  }
}

function tokenizeOptions(value) {
  const tokens = [];
  const regex = /(?:[^\s"']+|"[^"]*"|'[^']*')+/g;
  for (const match of value.matchAll(regex)) tokens.push(match[0]);
  return tokens;
}

function convertMapLocals(lines, output, warnings) {
  for (const line of activeLines(lines)) {
    const space = line.search(/\s/);
    if (space < 1) { warnings.push(`未转换 Map Local: ${line}`); continue; }
    const pattern = line.slice(0, space);
    const values = {};
    for (const token of tokenizeOptions(line.slice(space + 1))) {
      const equal = token.indexOf("=");
      if (equal > 0) values[token.slice(0, equal).toLowerCase()] = unquote(token.slice(equal + 1));
    }
    if (values["data-type"] === "tiny-gif") {
      add(output, "url_rewrites", { match: pattern, location: "http://reject-img/" });
      continue;
    }
    if (values["data-type"] && values["data-type"] !== "text") {
      warnings.push(`未转换非文本 Map Local: ${line}`);
      continue;
    }
    const item = { match: pattern, status_code: Number(values["status-code"] ?? 200), body: values.data ?? "" };
    if (values.header) {
      const separator = values.header.indexOf(":");
      if (separator > 0) item.headers = { [values.header.slice(0, separator)]: values.header.slice(separator + 1) };
    }
    add(output, "map_locals", item);
  }
}

function convertMitm(lines, output) {
  const hostnames = [];
  for (const line of activeLines(lines)) {
    const match = line.match(/^hostname\s*=\s*(.*)$/i);
    if (!match) continue;
    for (const host of splitCommaFields(match[1])) {
      const value = host.replace(/^%APPEND%\s*/i, "").trim();
      if (value) hostnames.push(value);
    }
  }
  if (hostnames.length) output.mitm = { hostnames: { includes: [...new Set(hostnames)] } };
}

export function extractScriptUrls(source) {
  const sections = splitSections(source);
  const urls = [];
  for (const line of activeLines(sections.get("script"))) {
    const values = parseKeyValues(line.slice(line.indexOf("=") + 1));
    if (values["script-path"]?.startsWith("http")) urls.push(values["script-path"]);
  }
  return [...new Set(urls)];
}

export function convertSurgeModule(source, options = {}) {
  const sections = splitSections(source);
  const metadata = parseMetadata(sections.get("metadata"));
  const output = {};
  const warnings = [];
  if (metadata.name) output.name = metadata.name;
  if (metadata.desc) output.description = metadata.desc;
  if (metadata.author) output.author = metadata.author;
  if (metadata.homepage) output.homepage = metadata.homepage;
  if (metadata.icon) output.icon = metadata.icon;
  if (metadata.openurl) output.open_url = metadata.openurl;
  if (metadata.arguments) output.compat_arguments = parseCompatArguments(metadata.arguments);
  if (metadata["arguments-desc"]) output.compat_arguments_desc = metadata["arguments-desc"].replaceAll("\\n", "\n");
  convertRules(sections.get("rule"), output, warnings);
  convertUrlRewrites(sections.get("url rewrite"), output, warnings);
  convertHeaderRewrites(sections.get("header rewrite"), output, warnings);
  convertBodyRewrites(sections.get("body rewrite"), output, warnings);
  convertMapLocals(sections.get("map local"), output, warnings);
  convertScripts(sections.get("script"), output, warnings, options.scriptUrlMap ?? new Map());
  convertMitm(sections.get("mitm"), output);
  const supportedSections = new Set(["metadata", "rule", "url rewrite", "header rewrite", "body rewrite", "map local", "script", "mitm"]);
  for (const [name, lines] of sections) {
    if (!supportedSections.has(name) && activeLines(lines).length) warnings.push(`未转换区段 [${name}]`);
  }
  if (!Object.keys(output).length) throw new Error("未识别到可转换的 Surge 模块内容");
  return { document: output, yaml: YAML.stringify(output, { lineWidth: 0 }), warnings };
}
