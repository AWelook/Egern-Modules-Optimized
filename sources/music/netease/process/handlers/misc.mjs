/** 收银台广告弹窗清除。 */
export function cashier(s) {
  if (s.data?.cashierTabPopup) s.data.cashierTabPopup = {};
}

/** 我的页顶部横幅广告。 */
export function myPageBar(s) {
  if (s.data?.crossPlatformResource?.positionCode === "MyPageBar") {
    s.data.crossPlatformResource = {};
  }
}

/** 关注列表中未回关用户的提示文案。 */
export function followList(s) {
  const records = s.data?.records;
  for (const r of Array.isArray(records) ? records : []) {
    if (!r || typeof r !== "object") continue;
    if (r.mutualFollowDay === null) {
      r.showContent = {
        message: "💢他/她,未关注你",
        time: 1e12,
        active: true,
        boxContent: {}
      };
    }
  }
}
