/**
 * 评论楼层：楼主与子评论清空 VIP 标识/头像装饰/挂件，未关注的强制 followed=true。
 */
export function commentFloor(s) {
  const owner = s.data?.ownerComment;
  if (owner?.user && typeof owner.user === "object") {
    owner.user.vipRights = null;
    owner.user.avatarDetail = {};
    s.data.ownerComment.pendantData = null;
  }
  const comments = s.data?.comments;
  for (const c of Array.isArray(comments) ? comments : []) {
    if (!c || typeof c !== "object") continue;
    const user = c.user;
    if (user && typeof user === "object") {
      if (user.followed === false) user.followed = true;
      user.vipRights = null;
      user.avatarDetail = null;
    }
    c.userBizLevels = null;
    c.pendantData = null;
    if (c.tag && typeof c.tag === "object") {
      c.tag.extDatas = [];
      c.tag.contentPicDatas = null;
    }
  }
}
