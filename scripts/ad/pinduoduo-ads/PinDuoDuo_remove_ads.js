/**
 * 拼多多扫码取件页面净化（Egern 原生版）
 * 原作者: 可莉 / ibilibili
 * Egern 迁移与优化: AWelook
 */
const OLD_CHUNK =
  "https://pfile.pddpic.com/mdkd/mdkd/_next/static/chunks/9410-b8806e870a26db7d.js";
const NEW_CHUNK =
  "https://cdn.jsdelivr.net/gh/AWelook/Egern-Modules-Optimized@main/scripts/ad/pinduoduo-ads/9410-b8806e870a26db7d.js";

export default async function (ctx) {
  let body = await ctx.response.text();
  body = replaceAllText(body, OLD_CHUNK, NEW_CHUNK);
  body = removeGifContainers(body);
  body = trimNextData(body);
  return { body };
}

function replaceAllText(text, from, to) {
  let position = text.indexOf(from);
  while (position !== -1) {
    text = text.slice(0, position) + to + text.slice(position + from.length);
    position = text.indexOf(from, position + to.length);
  }
  return text;
}

function removeGifContainers(html) {
  const marker = "index_gif-container";
  let position = html.indexOf(marker);

  while (position !== -1) {
    const opening = html.lastIndexOf("<div", position);
    if (opening === -1) break;

    let cursor = opening;
    let depth = 0;
    let end = -1;
    while (cursor < html.length) {
      const nextOpening = html.indexOf("<div", cursor);
      const nextClosing = html.indexOf("</div>", cursor);
      if (nextClosing === -1) break;
      if (nextOpening !== -1 && nextOpening < nextClosing) {
        depth += 1;
        cursor = nextOpening + 4;
      } else {
        depth -= 1;
        cursor = nextClosing + 6;
        if (depth === 0) {
          end = cursor;
          break;
        }
      }
    }
    if (end === -1) break;
    html = html.slice(0, opening) + html.slice(end);
    position = html.indexOf(marker, opening);
  }
  return html;
}

function trimNextData(html) {
  const idPosition = html.indexOf('id="__NEXT_DATA__"');
  if (idPosition === -1) return html;
  const tagStart = html.lastIndexOf("<script", idPosition);
  const contentStart = tagStart === -1 ? -1 : html.indexOf(">", tagStart);
  const tagEnd = contentStart === -1 ? -1 : html.indexOf("</script>", contentStart);
  if (tagStart === -1 || contentStart === -1 || tagEnd === -1) return html;

  try {
    const data = JSON.parse(html.slice(contentStart + 1, tagEnd));
    const serverData = data?.props?.pageProps?.serverData;
    if (Array.isArray(serverData)) {
      data.props.pageProps.serverData = serverData.filter(
        (item) =>
          item &&
          (item.key === "fastBindCMobilePreCheck" ||
            item.key === "queryStationPackageInfo"),
      );
    }
    return (
      html.slice(0, contentStart + 1) + JSON.stringify(data) + html.slice(tagEnd)
    );
  } catch {
    return html;
  }
}
