import { retainInPlace } from "../../function/array.mjs";

/**
 * 顶部 Tab 过滤。XD/BK/TS=1 才显示 心动/播客/听书；HDTAB=1 才显示活动 Tab；清空 adminList。
 */
export function topTab(s, { settings }) {
  if (Array.isArray(s.data?.commonResourceList)) {
    const showXD = settings.XD === 1;
    const showBK = settings.BK === 1;
    const showTS = settings.TS === 1;
    const showHDTAB = settings.HDTAB === 1;
    retainInPlace(s.data.commonResourceList, i => {
      if (!i || typeof i !== "object") return true;
      if (i.resCode === "fastPlay" && !showXD) return false;
      if (i.resCode === "podcast" && !showBK) return false;
      if (i.resCode === "vBook" && !showTS) return false;
      if (i.trp_type === "musicTopTabIntervene" && !showHDTAB) return false;
      return true;
    });
  }
  if (s.data?.adminList) s.data.adminList = [];
}
