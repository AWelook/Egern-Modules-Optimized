/**
 * 闲鱼 AMDC 响应处理（Egern 原生版）
 * 原作者: @ddgksf2013
 * Egern 迁移与优化: AWelook
 */
const BLOCKED_USER_AGENT =
  /(AMap|Cainiao|闲鱼|%E9%97%B2%E9%B1%BC|%E9%A3%9E%E7%8C%AA%E6%97%85%E8%A1%8C|%E5%96%B5%E8%A1%97|%E5%A4%A9%E7%8C%AB|Alibaba|MovieApp|Hema4iPhone|Moon|DMPortal)/;

export default async function (ctx) {
  const userAgent = ctx.request.headers.get("user-agent") ?? "";
  if (BLOCKED_USER_AGENT.test(userAgent)) return { body: "ddgksf2013" };
}
