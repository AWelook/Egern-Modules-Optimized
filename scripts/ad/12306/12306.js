/**
 * 12306 去广告（Egern 原生版）
 * 原作者: @ddgksf2013
 * Egern 迁移与优化: AWelook
 */
export default async function (ctx) {
  const { placementNo } = await ctx.request.json();
  let payload;

  if (placementNo === "0007") {
    payload = {
      materialsList: [
        {
          billMaterialsId: "6491",
          filePath: "ddgksf2013",
          creativeType: 1,
        },
      ],
      advertParam: { skipTime: 1 },
      code: "00",
    };
  } else if (placementNo === "G0054") {
    payload = { code: "00", materialsList: [{}] };
  } else {
    payload = { code: "00", message: "无广告返回" };
  }

  return ctx.respond({
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
