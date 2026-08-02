import { retainInPlace } from "../../function/array.mjs";

/** 首页推荐卡片 setting key → bizCode 映射。 */
const BLOCK_MAP = {
  PRGG: "PAGE_RECOMMEND_GREETING",
  PRDRD: "PAGE_RECOMMEND_DAILY_RECOMMEND",
  PRSCVPT: "PAGE_RECOMMEND_SPECIAL_CLOUD_VILLAGE_PLAYLIST",
  PRST: "PAGE_RECOMMEND_SHORTCUT",
  HMPR: "HOMEPAGE_MUSIC_PARTNER",
  PRRR: "PAGE_RECOMMEND_RADAR",
  PRRK: "PAGE_RECOMMEND_RANK",
  PRMST: "PAGE_RECOMMEND_MY_SHEET",
  PRCN: "PAGE_RECOMMEND_COMBINATION",
  PRPRS: "PAGE_RECOMMEND_PRIVATE_RCMD_SONG",
  PRRSS: "PAGE_RECOMMEND_RED_SIMILAR_SONG"
};
const BLOCK_ENTRIES = Object.entries(BLOCK_MAP);

/** 清理问候语卡片中带遥测/广告字段的子项。 */
function cleanGreetingEntries(entries) {
  if (!Array.isArray(entries)) return;
  for (const d of entries) {
    if (!d || typeof d !== "object") continue;
    if (d.summary) d.summary = "";
    if (d.extraMap) d.extraMap = {};
    if (d.trp_id) d.trp_id = "";
    if (d.log) d.log = {};
    if (d.icon) d.icon = "";
    if (d.actionUrl) d.actionUrl = "";
    if (d.s_ctrp) d.s_ctrp = "";
    if (d.resourceType) d.resourceType = "";
  }
}

function allowedBizCodes(settings) {
  const allowed = new Set();
  for (const [key, code] of BLOCK_ENTRIES) {
    if (settings[key] === 1) allowed.add(code);
  }
  return allowed;
}

/** 首页 Banner 移除活动/广告类型。 */
export function homepageBlock(s) {
  if (!Array.isArray(s.data?.blocks)) return;
  for (const blk of s.data.blocks) {
    if (
      blk?.showType === "BANNER" &&
      Array.isArray(blk.extInfo?.banners)
    ) {
      retainInPlace(blk.extInfo.banners, item =>
        item?.typeTitle !== "活动" && item?.typeTitle !== "广告"
      );
    }
  }
}

/** 发现页移除顶部 Banner。 */
export function discovery(s) {
  if (s.data?.blockCodeOrderList) {
    try {
      const order = JSON.parse(s.data.blockCodeOrderList);
      if (Array.isArray(order)) {
        retainInPlace(order, item => item !== "PAGE_DISCOVERY_BANNER");
        s.data.blockCodeOrderList = JSON.stringify(order);
      }
    } catch {}
  }
  if (Array.isArray(s.data?.blocks)) {
    retainInPlace(s.data.blocks, item => item?.bizCode !== "PAGE_DISCOVERY_BANNER");
  }
}

/** 按白名单过滤 JSON 字符串化的 blockCode 列表。 */
function filterCodeListJson(jsonStr, allowed) {
  try {
    const arr = JSON.parse(jsonStr);
    if (!Array.isArray(arr)) return jsonStr;
    retainInPlace(arr, item => allowed.has(item));
    return JSON.stringify(arr);
  } catch {
    return jsonStr;
  }
}

/** 推荐页全量加载：按 BLOCK_MAP 过滤 blocks，问候语再清理子项。 */
export function rcmdResource(s, { settings }) {
  const allowed = allowedBizCodes(settings);
  if (!s.data || typeof s.data !== "object") return;

  if (Array.isArray(s.data.blocks)) {
    retainInPlace(s.data.blocks, block => allowed.has(block?.bizCode));
    const greeting = s.data.blocks.find(b => b?.bizCode === "PAGE_RECOMMEND_GREETING");
    if (greeting?.dslData) {
      for (const key in greeting.dslData) {
        cleanGreetingEntries(greeting.dslData[key]?.commonResourceList);
      }
    }
  }
  if (typeof s.data.blockCodeOrderList === "string") {
    s.data.blockCodeOrderList = filterCodeListJson(s.data.blockCodeOrderList, allowed);
  }
  if (typeof s.data.algDemoteBlockCodeOrderList === "string") {
    s.data.algDemoteBlockCodeOrderList = filterCodeListJson(s.data.algDemoteBlockCodeOrderList, allowed);
  }
  if (Array.isArray(s.data.requestBlockOrder)) {
    retainInPlace(s.data.requestBlockOrder, item => allowed.has(item));
  }
  // 斩断懒加载链条：避免 multi/refresh 把过滤掉的卡片反复拉回。
  if ("hasMore" in s.data) s.data.hasMore = false;
  if ("cursor" in s.data) s.data.cursor = -1;
}

/**
 * 推荐页增量刷新：同时兼容
 *  - 旧结构：{ data: [{ blockCode, block: {...} }, ...] }
 *  - 新结构：{ data: { blocks: [{ bizCode, ... }], cursor, hasMore } }
 */
export function rcmdRefresh(s, ctx) {
  const allowed = allowedBizCodes(ctx.settings);

  if (Array.isArray(s.data)) {
    retainInPlace(s.data, item => allowed.has(item?.blockCode));
    const greeting = s.data.find(i => i?.blockCode === "PAGE_RECOMMEND_GREETING");
    if (greeting?.block?.dslData) {
      for (const key in greeting.block.dslData) {
        cleanGreetingEntries(greeting.block.dslData[key]?.commonResourceList);
      }
    }
    return;
  }
  // 新结构：复用 rcmdResource 逻辑
  rcmdResource(s, ctx);
}
