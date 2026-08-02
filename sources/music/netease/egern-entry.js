import { Response } from "./process/Response.mjs";

/** 网易云音乐净化（Egern 原生二进制响应入口） */
export default async function (ctx) {
  const previousArgument = globalThis.$argument;
  const previousStore = globalThis.$persistentStore;
  globalThis.$argument = ctx.env ?? {};
  globalThis.$persistentStore = {
    read: (key) => ctx.storage.get(key),
  };

  try {
    const body = new Uint8Array(await ctx.response.arrayBuffer());
    const result = Response({ url: ctx.request.url }, { body });
    return result?.body ? { body: result.body } : undefined;
  } finally {
    restoreGlobal("$argument", previousArgument);
    restoreGlobal("$persistentStore", previousStore);
  }
}

function restoreGlobal(key, value) {
  if (value === undefined) delete globalThis[key];
  else globalThis[key] = value;
}
