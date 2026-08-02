import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import railway from "../scripts/ad/12306/12306.js";
import amap from "../scripts/ad/amap-ads/amap.js";
import amapAmdc from "../scripts/ad/amap-ads/amdc.js";
import goofishAmdc from "../scripts/ad/goofish-ads/amdc.js";
import pinduoduo from "../scripts/ad/pinduoduo-ads/PinDuoDuo_remove_ads.js";
import redditTranslation from "../scripts/ad/reddit-ads/translation.js";
import xiaohongshu from "../scripts/ad/xiaohongshu-ads/RedPaper_remove_ads.js";

const legacyXiaohongshu = await readFile(
  new URL("../upstream/ad/xiaohongshu-ads/RedPaper_remove_ads.js", import.meta.url),
  "utf8",
);
const xiaohongshuHomefeedFixture = JSON.parse(await readFile(
  new URL("../fixtures/xiaohongshu/homefeed.synthetic.json", import.meta.url),
  "utf8",
)).payload;

test("12306 returns the same placement-specific payloads", async () => {
  for (const [placementNo, expected] of [
    ["0007", { code: "00", creativeType: 1 }],
    ["G0054", { code: "00", materials: [{}] }],
    ["other", { code: "00", message: "无广告返回" }],
  ]) {
    const ctx = requestContext({ placementNo });
    const result = await railway(ctx);
    assert.equal(result.status, 200);
    const body = JSON.parse(result.body);
    assert.equal(body.code, expected.code);
    if (expected.creativeType) assert.equal(body.materialsList[0].creativeType, expected.creativeType);
    if (expected.materials) assert.deepEqual(body.materialsList, expected.materials);
    if (expected.message) assert.equal(body.message, expected.message);
  }
});

test("AMDC scripts preserve their separate user-agent coverage", async () => {
  assert.equal((await amapAmdc(responseContext({ userAgent: "AMap/1" }))).body, "ddgksf2013");
  assert.equal(await amapAmdc(responseContext({ userAgent: "闲鱼/1" })), undefined);
  assert.equal((await goofishAmdc(responseContext({ userAgent: "闲鱼/1" }))).body, "ddgksf2013");
  assert.equal(await goofishAmdc(responseContext({ userAgent: "Safari" })), undefined);
});

test("Amap keeps the navigation whitelist and clears promotion arrays", async () => {
  const input = {
    data: {
      cardList: {
        a: { dataType: "LoginCard" },
        b: { dataType: "Advertisement" },
      },
      pull3: { msgs: [1] },
      business_position: [1],
      mapBizList: [1],
    },
  };
  const result = await amap(responseContext({
    url: "https://m5.amap.com/ws/faas/amap-navigation/main-page",
    json: input,
  }));
  const body = JSON.parse(result.body);
  assert.deepEqual(body.data.cardList, [{ dataType: "LoginCard" }]);
  assert.deepEqual(body.data.pull3.msgs, []);
  assert.deepEqual(body.data.business_position, []);
  assert.deepEqual(body.data.mapBizList, []);
});

test("Pinduoduo rewrites its chunk, removes GIF container, and trims NEXT_DATA", async () => {
  const oldChunk = "https://pfile.pddpic.com/mdkd/mdkd/_next/static/chunks/9410-b8806e870a26db7d.js";
  const data = {
    props: { pageProps: { serverData: [
      { key: "advertisement" },
      { key: "fastBindCMobilePreCheck" },
      { key: "queryStationPackageInfo" },
    ] } },
  };
  const html = `<script src="${oldChunk}"></script><div><div class="index_gif-container">ad</div></div><script id="__NEXT_DATA__">${JSON.stringify(data)}</script>`;
  const result = await pinduoduo(responseContext({ text: html }));
  assert.match(result.body, /cdn\.jsdelivr\.net\/gh\/AWelook\/Egern-Modules-Optimized/);
  assert.doesNotMatch(result.body, /index_gif-container/);
  assert.doesNotMatch(result.body, /advertisement/);
  assert.match(result.body, /fastBindCMobilePreCheck/);
});

test("Reddit translation keeps the original parameter switch semantics", async () => {
  const enabled = responseContext({ env: { TRANSLATION: "http-request", TRANSLATION_VALUE: "enabled, seo, zh-hans" } });
  enabled.request.headers.set("x-reddit-translations", "old");
  await redditTranslation(enabled);
  assert.equal(enabled.request.headers.get("x-reddit-translations"), "enabled, seo, zh-hans");

  const disabled = responseContext({ env: { TRANSLATION: "#", TRANSLATION_VALUE: "ignored" } });
  disabled.request.headers.set("x-reddit-translations", "old");
  await redditTranslation(disabled);
  assert.equal(disabled.request.headers.get("x-reddit-translations"), "old");
});

test("Xiaohongshu filters homefeed items without changing retained notes", async () => {
  const result = await xiaohongshu(responseContext({
    url: "https://edith.xiaohongshu.com/api/sns/v6/homefeed?x=1",
    json: xiaohongshuHomefeedFixture,
  }));
  assert.deepEqual(JSON.parse(result.body).data, [{ id: "keep" }]);
});

test("Xiaohongshu normalizes sub-comments using the sub-comment fields", async () => {
  const ctx = responseContext({
    url: "https://edith.xiaohongshu.com/api/sns/v5/note/comment/list",
    json: { data: { comments: [{
      note_id: "note-1",
      comment_type: 0,
      sub_comments: [{
        comment_type: 3,
        media_source_type: 1,
        pictures: [{
          video_id: "video-1",
          video_info: JSON.stringify({ stream: { h265: [{ master_url: "https://video" }] } }),
        }],
      }],
    }] } },
  });
  const result = await xiaohongshu(ctx);
  const comment = JSON.parse(result.body).data.comments[0];
  assert.equal(comment.comment_type, 0);
  assert.equal(comment.sub_comments[0].comment_type, 2);
  assert.equal(comment.sub_comments[0].media_source_type, 0);
  assert.deepEqual(ctx.storage.getJSON("redBookCommentLivePhoto"), {
    noteId: "note-1",
    livePhotos: [{ videId: "video-1", videoUrl: "https://video" }],
  });
});

test("Xiaohongshu v3 keeps the original function-switch scope", async () => {
  const result = await xiaohongshu(responseContext({
    url: "https://edith.xiaohongshu.com/api/sns/v3/note/videofeed",
    json: { data: [{
      function_switch: [{ enable: false, reason: "original" }],
      media_save_config: { disable_save: true, disable_watermark: false },
      share_info: { function_entries: [{ type: "share" }] },
    }] },
  }));
  const item = JSON.parse(result.body).data[0];
  assert.deepEqual(item.function_switch, [{ enable: false, reason: "original" }]);
  assert.equal(item.media_save_config.disable_save, false);
  assert.equal(item.share_info.function_entries[0].type, "video_download");
});

test("Xiaohongshu keeps output and storage semantics across every registered route", async () => {
  const urls = [
    "/v1/note/imagefeed",
    "/v1/note/live_photo/save",
    "/v1/system/service/ui/config?x=1",
    "/v1/system_service/config?x=1",
    "/v2/system_service/splash_config",
    "/v2/note/widgets",
    "/v2/user/followings/followfeed",
    "/v4/followfeed?x=1",
    "/v5/recommend/user/follow_recommend?x=1",
    "/v1/interaction/comment/video/download",
    "/v5/note/comment/list",
    "/v2/note/feed",
    "/v3/note/videofeed",
    "/v6/homefeed?x=1",
    "/v10/search/notes?x=1",
    "/v4/note/videofeed",
    "/v10/note/video/save",
  ].map((route) => `https://edith.xiaohongshu.com/api/sns${route}`);

  for (const url of urls) {
    const input = { data: {} };
    const expected = runLegacyScript(legacyXiaohongshu, url, input);
    const ctx = responseContext({ url, json: input });
    const output = await xiaohongshu(ctx);
    assert.deepEqual(output, expected.output, url);
    assert.deepEqual(ctx.storage.dump(), expected.store, url);
  }
});

function requestContext(json) {
  return {
    request: { json: async () => structuredClone(json) },
    respond: (response) => response,
  };
}

function responseContext({ url = "https://example.com", json = {}, text = "", userAgent = "", env = {} } = {}) {
  const values = new Map();
  return {
    env,
    request: {
      url,
      headers: new MockHeaders(userAgent ? { "User-Agent": userAgent } : {}),
    },
    response: {
      body: {},
      json: async () => structuredClone(json),
      text: async () => text,
    },
    storage: {
      getJSON: (key) => structuredClone(values.get(key) ?? null),
      setJSON: (key, value) => values.set(key, structuredClone(value)),
      dump: () => Object.fromEntries(
        [...values].map(([key, value]) => [key, JSON.stringify(value)]),
      ),
    },
  };
}

function runLegacyScript(script, url, input) {
  const store = new Map();
  let output;
  vm.runInNewContext(script, {
    $request: { url },
    $response: { body: JSON.stringify(input) },
    $persistentStore: {
      read: (key) => store.get(key) ?? null,
      write: (value, key) => {
        store.set(key, value);
        return true;
      },
    },
    $done: (value) => { output = value; },
  }, { timeout: 1_000 });
  return {
    output: JSON.parse(JSON.stringify(output)),
    store: Object.fromEntries(store),
  };
}

class MockHeaders {
  #values = new Map();

  constructor(values = {}) {
    for (const [name, value] of Object.entries(values)) this.set(name, value);
  }

  get(name) {
    return this.#values.get(name.toLowerCase()) ?? null;
  }

  set(name, value) {
    this.#values.set(name.toLowerCase(), String(value));
  }

  delete(name) {
    this.#values.delete(name.toLowerCase());
  }
}
