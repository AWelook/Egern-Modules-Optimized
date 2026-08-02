import { batch } from "./batch.mjs";
import { bottomTab } from "./bottomTab.mjs";
import { flowPopup } from "./flow.mjs";
import { cashier, myPageBar, followList } from "./misc.mjs";
import { commentFloor } from "./comment.mjs";
import { discovery, homepageBlock, rcmdRefresh, rcmdResource } from "./home.mjs";
import { topTab } from "./topTab.mjs";
import { userInfo } from "./userInfo.mjs";

const emptyAdPayload = () => ({ code: 200, data: {} });

export const HANDLERS = {
  "/batch": { handle: batch },
  "/v2/resource/comment/floor/get": { handle: commentFloor },
  "/v1/user/info": { handle: userInfo },
  // 这两个接口只承载推广/收银台弹窗，解析或处理异常时可安全返回
  // 合法空数据；混合内容接口不设置 fallback，避免破坏正常页面。
  "/sp/flow/popup/query": { handle: flowPopup, fallback: emptyAdPayload },
  "/vipactivity/app/cashier/setting/get": { handle: cashier, fallback: emptyAdPayload },
  "/link/position/show/resource": { handle: myPageBar },
  "/user/follow/users/mixed/get/v2": { handle: followList },

  "/link/home/framework/tab": { handle: bottomTab, settings: true },
  "/link/home/framework/top/tab": { handle: topTab, settings: true },
  "/homepage/block/page": { handle: homepageBlock },
  "/link/page/discovery/resource/show": { handle: discovery },
  "/link/page/rcmd/resource/show": { handle: rcmdResource, settings: true },
  "/link/page/rcmd/block/resource/multi/refresh": { handle: rcmdRefresh, settings: true }
};
