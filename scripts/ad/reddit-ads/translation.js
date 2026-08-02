/** Reddit 翻译请求头控制（Egern 原生版） */
export default async function (ctx) {
  if (ctx.env.TRANSLATION !== "http-request") return;
  ctx.request.headers.delete("x-reddit-translations");
  ctx.request.headers.set(
    "x-reddit-translations",
    ctx.env.TRANSLATION_VALUE ?? "enabled, seo, zh-hans",
  );
  return { headers: ctx.request.headers };
}
