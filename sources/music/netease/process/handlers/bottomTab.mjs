import { retainInPlace } from "../../function/array.mjs";

const BOTTOM_TAB_NAMES = {
  MY: "漫游",
  DT: "笔记",
  FX: "发现",
  GZ: "关注",
  SOU: "搜索"
};
const BOTTOM_TAB_KEYS = Object.keys(BOTTOM_TAB_NAMES);

/**
 * 底部 Tab 过滤与改名。隐藏 MY/DT/FX/GZ/SOU、应用自定义 Tab 名、发现页移除"直播"。
 */
export function bottomTab(s, { settings }) {
  const tabs = s.data?.commonResourceList;
  if (!Array.isArray(tabs)) return;

  // 至少保留 1 个 Tab，避免 UI 崩溃
  const first = tabs[0];
  retainInPlace(tabs, item => {
    if (!item || typeof item !== "object") return true;
    for (const key of BOTTOM_TAB_KEYS) {
      if (settings[key] === 1 && item.title === BOTTOM_TAB_NAMES[key]) return false;
    }
    return true;
  });
  if (!tabs.length && first) tabs.push(first);

  for (const i of tabs) {
    if (!i || typeof i !== "object") continue;
    if (i.title === "首页" && settings.SY_NAME) i.title = settings.SY_NAME;
    if (i.title === "我的" && settings.WD_NAME) i.title = settings.WD_NAME;
    if (i.title === "漫游" && settings.MY_NAME) i.title = settings.MY_NAME;
    if (i.title === "笔记" && settings.DT_NAME) i.title = settings.DT_NAME;
    if (i.title === "发现") {
      if (settings.FX_NAME) i.title = settings.FX_NAME;
      if (Array.isArray(i.subCommonResourceList)) {
        retainInPlace(i.subCommonResourceList, item => item?.title !== "直播");
      }
    }
  }
}
