import database from "../database.mjs";
import { decodeBody, encodeBody } from "../function/Crypto.mjs";
import { getSettings } from "../function/setENV.mjs";
import { extractRoute } from "../function/url.mjs";
import { HANDLERS } from "./handlers/index.mjs";

function fallbackResult(entry, path) {
  if (!entry.fallback) return {};
  try {
    return { body: encodeBody(entry.fallback()) };
  } catch (error) {
    console.log(`[WYY] fallback ${path}: ${error?.message || error}`);
    return {};
  }
}

/**
 * Surge 专用同步处理流程。任何不匹配或解析失败都返回空对象，让 Surge
 * 保留原响应；纯广告接口可以使用合法空数据兜底。
 */
export function Response(request, response) {
  if (!request?.url || !response) return {};

  // 在接触响应体前完成路由判断，避免无处理器接口产生额外 JS 视图与转换。
  const route = extractRoute(request.url);
  if (!route) return {};
  const entry = HANDLERS[route.path];
  if (!entry) return {};

  const body = response.body;
  if (!body || !(body.length ?? body.byteLength)) return {};

  const payload = decodeBody(body, route.encrypted);
  if (!payload) {
    console.log(`[WYY] decode ${route.path}: ${decodeBody.lastError}`);
    return fallbackResult(entry, route.path);
  }

  try {
    const context = entry.settings
      ? { settings: getSettings(database) }
      : undefined;
    entry.handle(payload, context);
    return { body: encodeBody(payload) };
  } catch (error) {
    console.log(`[WYY] handle ${route.path}: ${error?.message || error}`);
    return fallbackResult(entry, route.path);
  }
}
