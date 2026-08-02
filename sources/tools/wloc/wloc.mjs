import { ungzip } from "pako";
import { isGzip, patchWlocBody } from "./core.mjs";

const DEFAULTS = {
  longitude: null,
  latitude: null,
  accuracy: 25,
  logLevel: "info",
};
const DEFAULT_LONGITUDE = 113.94114;
const DEFAULT_LATITUDE = 22.544577;

export default async function wloc(ctx) {
  const settings = resolveSettings(ctx);
  const log = createLogger(settings.logLevel);
  if (settings.longitude == null || settings.latitude == null) {
    log.info("[wloc] 透传模式：未设置坐标，不修改定位响应");
    return undefined;
  }

  let original;
  try {
    original = new Uint8Array(await ctx.response.arrayBuffer());
    if (!original.length) {
      log.warn("[wloc] 无二进制 body，跳过");
      return undefined;
    }
    const compressed = isGzip(original);
    const input = compressed ? ungzip(original) : original;
    const { data, stats } = patchWlocBody(input, settings);
    const headers = ctx.response.headers;
    headers.delete("Content-Encoding");
    headers.delete("Transfer-Encoding");
    headers.set("Content-Length", String(data.length));
    log.info(`[wloc] 目标坐标: ${settings.longitude},${settings.latitude} 精度=${settings.accuracy} patched=${stats.locations}`);
    return { status: 200, headers, body: data };
  } catch (error) {
    log.error(`[wloc] ${error?.message ?? error}`);
    return original ? { body: original } : undefined;
  }
}

export function resolveSettings(ctx) {
  const env = ctx.env ?? {};
  const settings = { ...DEFAULTS };
  if (env.longitude) settings.longitude = Number.parseFloat(env.longitude);
  if (env.latitude) settings.latitude = Number.parseFloat(env.latitude);
  if (env.accuracy) settings.accuracy = Number.parseInt(env.accuracy, 10);
  if (env.logLevel) settings.logLevel = env.logLevel;

  let stored = null;
  try {
    stored = ctx.storage.getJSON("wloc_settings");
  } catch {
    stored = null;
  }
  if (stored && typeof stored === "object") {
    if (stored.longitude) settings.longitude = Number.parseFloat(stored.longitude);
    if (stored.latitude) settings.latitude = Number.parseFloat(stored.latitude);
    if (stored.accuracy) settings.accuracy = Number.parseInt(stored.accuracy, 10);
  } else if (settings.longitude === DEFAULT_LONGITUDE && settings.latitude === DEFAULT_LATITUDE) {
    settings.longitude = null;
    settings.latitude = null;
  }
  return settings;
}

function createLogger(level) {
  const levels = { off: 0, error: 1, warn: 2, warning: 2, info: 3, debug: 4, all: 5 };
  const threshold = levels[String(level).toLowerCase()] ?? 2;
  return {
    error: (value) => { if (threshold >= 1) console.log(value); },
    warn: (value) => { if (threshold >= 2) console.log(value); },
    info: (value) => { if (threshold >= 3) console.log(value); },
  };
}
