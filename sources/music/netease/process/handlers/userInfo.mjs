/**
 * /api/v1/user/info 处理器。
 *
 * 清除"我的页"运营推广位（私房推荐+票务）。
 */

export function userInfo(s) {
  s.fmConfig = null;
  s.ticketConfig = null;
}
