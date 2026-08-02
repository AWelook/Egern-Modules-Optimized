/**
 * 一次提取 API 路径和编码类型。普通 /api 优先按 JSON 处理，
 * /eapi、/xapi、/xeapi 则优先按 AES 响应处理。
 */
export function extractRoute(url) {
  const match = /^https?:\/\/[^/]+\/(x?e?api)(\/[a-z0-9/-]+)(?:\?.*)?$/i.exec(url);
  if (!match) return null;
  return {
    path: match[2],
    encrypted: match[1].toLowerCase() !== "api"
  };
}
