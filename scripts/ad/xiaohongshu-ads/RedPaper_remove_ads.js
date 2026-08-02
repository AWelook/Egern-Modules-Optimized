/**
 * 小红书去广告与媒体保存增强（Egern 原生版）
 * 原作者: RuCu6 / fmz200
 * Egern 迁移与等效优化: AWelook
 */
export default async function (ctx) {
  if (!ctx.response.body) return;
  const url = ctx.request.url;
  let obj = await ctx.response.json();

  if (url.includes("/v1/interaction/comment/video/download")) {
    const cache = ctx.storage.getJSON("redBookCommentLivePhoto");
    const video = obj?.data?.video;
    if (video && cache?.livePhotos?.length) {
      const match = cache.livePhotos.find((item) => item?.videId === video.video_id);
      if (match) video.video_url = match.videoUrl;
    }
  } else if (url.includes("/v1/note/imagefeed") || url.includes("/v2/note/feed")) {
    const livePhotos = [];
    let containsLivePhotoFields = false;
    for (const item of obj?.data?.[0]?.note_list ?? []) {
      enableSaving(item);
      for (const image of item?.images_list ?? []) {
        if (
          Object.hasOwn(image, "live_photo_file_id") &&
          Object.hasOwn(image, "live_photo")
        ) {
          containsLivePhotoFields = true;
          const url = image?.live_photo?.media?.stream?.h265?.[0]?.master_url;
          const videoId = image?.live_photo?.media?.video_id;
          if (image.live_photo_file_id && videoId && url) {
            livePhotos.push({
              file_id: image.live_photo_file_id,
              video_id: videoId,
              url,
            });
          }
        }
      }
    }
    if (containsLivePhotoFields) ctx.storage.setJSON("redBookLivePhoto", livePhotos);
  } else if (url.includes("/v1/note/live_photo/save")) {
    const livePhotos = ctx.storage.getJSON("redBookLivePhoto");
    if (obj?.data?.datas?.length) {
      const byFileId = new Map(
        (livePhotos ?? []).map((item) => [item?.file_id, item?.url]),
      );
      for (const item of obj.data.datas) {
        const replacement = byFileId.get(item?.file_id);
        if (replacement && item?.url) {
          item.url = item.url.replace(/^https?:\/\/.*\.mp4/g, replacement);
        }
      }
    } else {
      obj = { code: 0, success: true, msg: "成功", data: { datas: livePhotos } };
    }
  } else if (url.includes("/v1/system/service/ui/config")) {
    const home = obj?.data?.sideConfigHomepage?.componentConfig;
    const personal = obj?.data?.sideConfigPersonalPage?.componentConfig;
    if (home?.sidebar_config_cny_2025) home.sidebar_config_cny_2025 = {};
    if (personal?.sidebar_config_cny_2025) personal.sidebar_config_cny_2025 = {};
  } else if (url.includes("/v1/system_service/config")) {
    deleteProperties(obj?.data, ["app_theme", "loading_img", "splash", "store"]);
  } else if (url.includes("/v2/note/widgets")) {
    deleteProperties(obj?.data, [
      "cooperate_binds",
      "generic",
      "note_next_step",
      "widget_list",
      "widgets_nbb",
      "widgets_ncb",
      "widgets_ndb",
    ]);
  } else if (url.includes("/v2/system_service/splash_config")) {
    for (const group of obj?.data?.ads_groups ?? []) {
      expireAd(group);
      for (const ad of group?.ads ?? []) expireAd(ad);
    }
  } else if (url.includes("/v2/user/followings/followfeed")) {
    if (obj?.data?.items?.length) {
      obj.data.items = obj.data.items.filter(
        (item) => item?.recommend_reason === "friend_post",
      );
    }
  } else if (url.includes("/v3/note/videofeed")) {
    if (obj?.data?.length > 0) {
      for (const item of obj.data) enableSaving(item, false);
    }
  } else if (url.includes("/v4/followfeed")) {
    if (obj?.data?.items?.length) {
      obj.data.items = obj.data.items.filter(
        (item) => item?.recommend_reason !== "recommend_user",
      );
    }
  } else if (url.includes("/v4/note/videofeed")) {
    const notes = [];
    const videos = [];
    if (obj?.data?.length) {
      for (const item of obj.data) {
        enableFunctionSwitch(item);
        if (item?.model_type !== "note") continue;
        const video = getVideoRecord(item);
        if (video) videos.push(video);
        promoteVideoDownload(item);
        if (!Object.hasOwn(item, "ad")) notes.push(item);
      }
      obj.data = notes;
      ctx.storage.setJSON("redBookVideoFeed", videos);
    }

    const unlockState = ctx.storage.getJSON("redBookVideoFeedUnlock");
    if (unlockState?.gayhub === "rucu6") {
      ctx.storage.setJSON(
        "redBookVideoFeedUnlock",
        (obj?.data ?? []).map(getVideoRecord).filter(Boolean),
      );
    }
  } else if (url.includes("/v5/note/comment/list")) {
    replaceRedIdWithFmz200(obj.data);
    updateCommentLivePhotoCache(ctx, obj?.data?.comments ?? []);
  } else if (url.includes("/v5/recommend/user/follow_recommend")) {
    if (obj?.data?.title === "你可能感兴趣的人" && obj?.data?.rec_users?.length) {
      obj.data = {};
    }
  } else if (url.includes("/v6/homefeed")) {
    if (obj?.data?.length) {
      obj.data = obj.data.filter((item) => {
        if (
          item?.model_type === "live_v2" ||
          Object.hasOwn(item, "ads_info") ||
          Object.hasOwn(item, "card_icon") ||
          Object.hasOwn(item, "note_attributes") ||
          item?.has_related_goods === true
        ) {
          return false;
        }
        delete item.related_ques;
        return true;
      });
    }
  } else if (url.includes("/v10/note/video/save")) {
    const noteId = obj?.data?.note_id;
    const normalVideos = ctx.storage.getJSON("redBookVideoFeed");
    const unlockVideos = ctx.storage.getJSON("redBookVideoFeedUnlock");
    if (noteId && normalVideos?.length) {
      const videoUrl = findLastVideoUrl(normalVideos, noteId);
      if (videoUrl) obj.data.download_url = videoUrl;
    }
    if (noteId && unlockVideos?.length && obj?.data?.disable === true && obj.data.msg) {
      delete obj.data.disable;
      delete obj.data.msg;
      obj.data.download_url = findLastVideoUrl(unlockVideos, noteId) ?? "";
      obj.data.status = 2;
    }
    ctx.storage.setJSON("redBookVideoFeedUnlock", { gayhub: "rucu6" });
  } else if (url.includes("/v10/search/notes")) {
    if (obj?.data?.items?.length) {
      obj.data.items = obj.data.items.filter((item) => item?.model_type === "note");
    }
  } else {
    return;
  }

  return { body: JSON.stringify(obj) };
}

function enableFunctionSwitch(item) {
  for (const option of item?.function_switch ?? []) {
    if (option?.enable === false) {
      option.enable = true;
      option.reason = "";
    }
  }
}

function promoteVideoDownload(item) {
  const entries = item?.share_info?.function_entries;
  if (!entries?.length) return;
  const index = entries.findIndex((entry) => entry?.type === "video_download");
  if (index === 0) return;
  if (index > 0) entries.unshift(entries.splice(index, 1)[0]);
  else entries.unshift({ type: "video_download" });
}

function enableSaving(item, includeFunctionSwitch = true) {
  if (includeFunctionSwitch) enableFunctionSwitch(item);
  if (item?.media_save_config) {
    item.media_save_config.disable_save = false;
    item.media_save_config.disable_watermark = true;
    item.media_save_config.disable_weibo_cover = true;
  }
  promoteVideoDownload(item);
}

function findLastVideoUrl(items, noteId) {
  let result;
  for (const item of items) {
    if (item.id === noteId) result = item.url;
  }
  return result;
}

function getVideoRecord(item) {
  const url = item?.video_info_v2?.media?.stream?.h265?.[0]?.master_url;
  return item?.id && url ? { id: item.id, url } : null;
}

function expireAd(item) {
  item.start_time = 3818332800;
  item.end_time = 3818419199;
}

function deleteProperties(target, properties) {
  if (!target) return;
  for (const property of properties) delete target[property];
}

function updateCommentLivePhotoCache(ctx, comments) {
  if (!comments.length) return;
  const livePhotos = [];
  for (const comment of comments) {
    normalizeComment(comment, livePhotos);
    for (const subComment of comment?.sub_comments ?? []) {
      normalizeComment(subComment, livePhotos);
    }
  }
  if (!livePhotos.length) return;

  const noteId = comments[0].note_id;
  const cache = ctx.storage.getJSON("redBookCommentLivePhoto");
  const merged = cache?.noteId === noteId
    ? deduplicateLivePhotos([...(cache.livePhotos ?? []), ...livePhotos])
    : livePhotos;
  ctx.storage.setJSON("redBookCommentLivePhoto", { noteId, livePhotos: merged });
}

function normalizeComment(comment, livePhotos) {
  if (comment?.comment_type === 3) comment.comment_type = 2;
  if (comment?.media_source_type === 1) comment.media_source_type = 0;
  for (const picture of comment?.pictures ?? []) {
    if (!picture?.video_id) continue;
    const info = JSON.parse(picture.video_info);
    const videoUrl = info?.stream?.h265?.[0]?.master_url;
    if (videoUrl) livePhotos.push({ videId: picture.video_id, videoUrl });
  }
}

function deduplicateLivePhotos(livePhotos) {
  const seen = new Set();
  return livePhotos.filter((item) => {
    if (seen.has(item.videId)) return false;
    seen.add(item.videId);
    return true;
  });
}

function replaceRedIdWithFmz200(value) {
  if (Array.isArray(value)) {
    for (const item of value) replaceRedIdWithFmz200(item);
  } else if (value && typeof value === "object") {
    if (Object.hasOwn(value, "red_id")) {
      value.fmz200 = value.red_id;
      delete value.red_id;
    }
    for (const key of Object.keys(value)) replaceRedIdWithFmz200(value[key]);
  }
}
