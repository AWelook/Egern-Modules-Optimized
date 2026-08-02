/**
 * 网易云 eapi 响应：AES-128-ECB/PKCS7，并兼容内外层 gzip。
 * 使用 CryptoJS 的最小入口和 pako 的单一 ungzip 导出。
 */
import CryptoJS from "crypto-js/core.js";
import "crypto-js/aes.js";
import "crypto-js/mode-ecb.js";
import { ungzip } from "pako";

const KEY = CryptoJS.enc.Utf8.parse("e82ckenh8dichen8");
const AES_CONFIG = {
  mode: CryptoJS.mode.ECB,
  padding: CryptoJS.pad.Pkcs7
};
const UTF8_DECODER = new TextDecoder("utf-8");

function isGzip(bytes) {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

function asBytes(body) {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  }
  if (typeof body === "string") {
    const bytes = new Uint8Array(body.length);
    for (let i = 0; i < body.length; i++) bytes[i] = body.charCodeAt(i) & 0xff;
    return bytes;
  }
  return null;
}

function bytesToWordArray(bytes) {
  const words = new Array((bytes.length + 3) >>> 2);
  let wordIndex = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    words[wordIndex++] =
      ((bytes[i] ?? 0) << 24) |
      ((bytes[i + 1] ?? 0) << 16) |
      ((bytes[i + 2] ?? 0) << 8) |
      (bytes[i + 3] ?? 0);
  }
  return CryptoJS.lib.WordArray.create(words, bytes.length);
}

function wordArrayToBytes(wordArray) {
  const bytes = new Uint8Array(wordArray.sigBytes);
  const words = wordArray.words;
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = (words[i >>> 2] >>> (24 - (i & 3) * 8)) & 0xff;
  }
  return bytes;
}

function parseJsonBytes(bytes) {
  const value = JSON.parse(UTF8_DECODER.decode(bytes));
  return value && typeof value === "object" ? value : null;
}

function parseEncrypted(bytes) {
  const plaintext = CryptoJS.algo.AES
    .createDecryptor(KEY, AES_CONFIG)
    .finalize(bytesToWordArray(bytes));
  let decoded = wordArrayToBytes(plaintext);
  if (isGzip(decoded)) decoded = ungzip(decoded);
  return parseJsonBytes(decoded);
}

/**
 * 仅在低开销解密路径失败后启用 CryptoJS 兼容入口。
 * 正常请求不会承担第二次解密开销。
 */
function parseEncryptedLegacy(bytes) {
  const plaintext = CryptoJS.AES.decrypt(
    CryptoJS.lib.CipherParams.create({
      ciphertext: bytesToWordArray(bytes)
    }),
    KEY,
    AES_CONFIG
  );
  let decoded = wordArrayToBytes(plaintext);
  if (isGzip(decoded)) decoded = ungzip(decoded);
  return parseJsonBytes(decoded);
}

function attempt(fn, encrypted) {
  try {
    const value = fn();
    return value ? { value, encrypted } : null;
  } catch {
    return null;
  }
}

/**
 * /api 优先解析明文，/eapi 等优先解密；失败时才走另一路径。
 */
export function decodeBody(body, preferEncrypted) {
  decodeBody.wasEncrypted = undefined;
  let bytes = asBytes(body);
  if (!bytes?.length) {
    decodeBody.lastError = "empty-or-unsupported-body";
    return null;
  }

  if (isGzip(bytes)) {
    try {
      bytes = ungzip(bytes);
    } catch {
      // 极少数 AES 密文可能碰巧以 gzip magic 开头；解压失败时继续按
      // 原始响应尝试 AES/JSON，避免误判后整次放行。
    }
  }

  let result;
  if (preferEncrypted) {
    result = attempt(() => parseEncrypted(bytes), true);
    if (!result) result = attempt(() => parseJsonBytes(bytes), false);
  } else {
    result = attempt(() => parseJsonBytes(bytes), false);
    if (!result) result = attempt(() => parseEncrypted(bytes), true);
  }
  if (!result) result = attempt(() => parseEncryptedLegacy(bytes), true);
  decodeBody.lastError = result ? "" : preferEncrypted ? "aes-and-json" : "json-and-aes";
  decodeBody.wasEncrypted = result?.encrypted;
  return result?.value ?? null;
}

/** 与上游一致：成功修改后的响应统一重新编码为 eapi AES body。 */
export function encodeBody(value) {
  const json = JSON.stringify(value);
  const plaintext = CryptoJS.enc.Utf8.parse(json);
  const ciphertext = CryptoJS.algo.AES
    .createEncryptor(KEY, AES_CONFIG)
    .finalize(plaintext);
  return wordArrayToBytes(ciphertext);
}
