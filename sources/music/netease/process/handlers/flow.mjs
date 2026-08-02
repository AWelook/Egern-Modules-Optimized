/**
 * 网易云"免流量"相关接口。
 *
 * - /api/sp/flow/popup/query: 全国三大运营商免流推广弹窗（启动/播放/下载/视频/设置页），
 *   全部置空避免弹出。
 */

/** 免流推广弹窗：全清。 */
export function flowPopup(s) {
  if (s.data) s.data = {};
}
