const STORAGE_KEY = "wloc_settings";

export default async function wlocSettings(ctx) {
  const query = parseQuery(ctx.request.url);
  const action = query.get("action") || "save";
  let result;

  if (action === "query") {
    try {
      const stored = ctx.storage.getJSON(STORAGE_KEY);
      result = stored && stored.longitude && stored.latitude
        ? {
            success: true,
            longitude: stored.longitude,
            latitude: stored.latitude,
            accuracy: stored.accuracy || 25,
            updatedAt: stored.updatedAt || null,
          }
        : { success: false, error: "无已保存的坐标" };
    } catch (error) {
      result = { success: false, error: error?.message || "读取失败" };
    }
  } else if (action === "clear") {
    try {
      ctx.storage.delete(STORAGE_KEY);
      result = { success: true };
    } catch (error) {
      result = { success: false, error: error?.message || "清除失败" };
    }
  } else {
    const longitude = Number.parseFloat(query.get("lon") || query.get("longitude") || "0");
    const latitude = Number.parseFloat(query.get("lat") || query.get("latitude") || "0");
    const accuracy = Number.parseInt(query.get("acc") || query.get("accuracy") || "25", 10);
    if (longitude && latitude) {
      const stored = {
        longitude,
        latitude,
        accuracy,
        updatedAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().replace("Z", "+08:00"),
      };
      try {
        ctx.storage.setJSON(STORAGE_KEY, stored);
        result = { success: true, longitude, latitude, accuracy };
      } catch (error) {
        result = { success: false, error: error?.message || "写入失败" };
      }
    } else {
      result = { success: false, error: "缺少 lon/lat 参数" };
    }
  }

  return ctx.respond({
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
    body: JSON.stringify(result),
  });
}

function parseQuery(url) {
  const query = String(url).split("?", 2)[1] ?? "";
  const values = new Map();
  for (const field of query.split("&")) {
    if (!field) continue;
    const separator = field.indexOf("=");
    const rawName = separator < 0 ? field : field.slice(0, separator);
    const rawValue = separator < 0 ? "" : field.slice(separator + 1);
    const name = decode(rawName);
    if (!values.has(name)) values.set(name, decode(rawValue));
  }
  return values;
}

function decode(value) {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}
