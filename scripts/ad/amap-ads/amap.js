/**
 * 高德地图响应净化（Egern 原生版）
 * 原作者: @ddgksf2013
 * Egern 迁移与优化: AWelook
 */
const NEARBY_PROPERTIES = [
  "coupon",
  "scene",
  "activity",
  "commodity_rec",
  "operation_activity",
];
const PROMOTION_PROPERTIES = ["icon", "banner", "tips", "popup", "bubble", "other"];
const AOCS_KEYWORDS =
  /gd_notch_logo|home_business_position_config|his_input_tip|operation_layer|aiNative|ai_|_ai/u;

export default async function (ctx) {
  const url = ctx.request.url;
  const response = await ctx.response.json();

  if (url.includes("valueadded/alimama/splash_screen")) {
    for (const item of response.data?.ad ?? []) {
      item.set.setting.display_time = 0;
      item.creative[0].start_time = 2240150400;
      item.creative[0].end_time = 2240150400;
    }
  } else if (url.includes("faas/amap-navigation/main-page")) {
    if (response.data?.cardList) {
      response.data.cardList = Object.values(response.data.cardList).filter(
        (item) => item.dataType === "LoginCard" || item.dataType === "FrequentLocation",
      );
    }
    if (response.data?.pull3?.msgs) response.data.pull3.msgs = [];
    if (response.data?.business_position) response.data.business_position = [];
    if (response.data?.mapBizList) response.data.mapBizList = [];
  } else if (url.includes("profile/index/node")) {
    delete response.data.tipData;
    if (response.data?.cardList) {
      response.data.cardList = Object.values(response.data.cardList).filter(
        (item) => item.dataType === "MyOrderCard" || item.dataType === "GdRecommendCard",
      );
    }
  } else if (url.includes("new_hotword")) {
    if (response.data?.header_hotword) response.data.header_hotword = [];
  } else if (url.includes("ws/promotion-web/resource")) {
    for (const property of PROMOTION_PROPERTIES) {
      if (response.data?.[property]) response.data[property] = [];
    }
  } else if (url.includes("ws/msgbox/pull")) {
    if (response.msgs) response.msgs = [];
    if (response.pull3?.msgs) response.pull3.msgs = [];
  } else if (url.includes("ws/message/notice/list")) {
    if (response.data?.noticeList) response.data.noticeList = [];
  } else if (url.includes("ws/shield/frogserver/aocs")) {
    for (const key of Object.keys(response.data ?? {})) {
      if (AOCS_KEYWORDS.test(key)) response.data[key] = { status: 1, version: "", value: "" };
    }
  } else if (url.includes("search/nearbyrec_smart")) {
    if (response.data) {
      for (const property of NEARBY_PROPERTIES) delete response.data[property];
      if (response.data.modules) {
        response.data.modules = response.data.modules.filter(
          (item) => !NEARBY_PROPERTIES.includes(item),
        );
      }
    }
  } else {
    return;
  }

  return { body: JSON.stringify(response) };
}
