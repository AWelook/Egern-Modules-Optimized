export function isGzip(bytes) {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export function patchWlocBody(input, settings) {
  const body = asBytes(input);
  const stats = { wifi: 0, cell: 0, locations: 0, skipped: 0 };
  if (body.length < 10) throw new Error(`body too short: ${body.length}`);

  const errors = [];
  const offsets = [0, 2, 4, 6, 8, 10, 12, 14, 16];
  const limit = Math.min(96, Math.max(0, body.length - 10));
  for (let offset = 0; offset <= limit; offset += 1) {
    if (!offsets.includes(offset)) offsets.push(offset);
  }

  for (const offset of offsets) {
    const snapshot = copyStats(stats);
    try {
      return { data: patchFrame(body, offset, settings, stats), stats };
    } catch (error) {
      restoreStats(stats, snapshot);
      if (errors.length < 6) errors.push(`@${offset}:${message(error)}`);
    }
  }

  try {
    return { data: scanRawPayload(body, settings, stats), stats };
  } catch (error) {
    errors.push(`raw:${message(error)}`);
  }
  throw new Error(`no patchable wloc payload found; ${errors.join(" | ")}`);
}

function scanRawPayload(body, settings, stats) {
  const errors = [];
  const limit = Math.min(256, body.length);
  for (let offset = 0; offset <= limit; offset += 1) {
    const snapshot = copyStats(stats);
    try {
      const source = body.subarray(offset);
      const patched = patchPayload(source, settings, stats);
      const changes = countChanges(stats, snapshot);
      if (changes > 0 && !bytesEqual(source, patched)) {
        return concatBytes([body.subarray(0, offset), patched]);
      }
      restoreStats(stats, snapshot);
    } catch (error) {
      restoreStats(stats, snapshot);
      if (errors.length < 6) errors.push(`raw@${offset}:${message(error)}`);
    }
  }
  throw new Error(`raw protobuf scan failed; ${errors.join(" | ")}`);
}

function patchFrame(body, base, settings, stats) {
  if (body.length < base + 10) throw new Error(`body too short: ${body.length}, base=${base}`);
  const length = (body[base + 8] << 8) | body[base + 9];
  if (length <= 0) throw new Error(`invalid empty frame length at ${base}`);
  if (base + 10 + length > body.length) {
    throw new Error(`invalid frame length ${length} at ${base} for ${body.length}`);
  }

  const payload = body.subarray(base + 10, base + 10 + length);
  const snapshot = copyStats(stats);
  const patched = patchPayload(payload, settings, stats);
  if (patched.length > 0xffff) throw new Error(`patched payload too large: ${patched.length}`);
  if (countChanges(stats, snapshot) <= 0 || bytesEqual(payload, patched)) {
    restoreStats(stats, snapshot);
    throw new Error(`frame parsed but no patchable wloc payload at ${base}`);
  }
  return concatBytes([
    body.subarray(0, base + 8),
    Uint8Array.of((patched.length >> 8) & 0xff, patched.length & 0xff),
    patched,
    body.subarray(base + 10 + length),
  ]);
}

function patchPayload(bytes, settings, stats) {
  const fields = parseFields(bytes);
  const output = [];
  for (const field of fields) {
    if (field.wireType === 2 && field.fieldNo === 2) {
      output.push(encodeField(field.fieldNo, field.wireType, patchWifi(field.value, settings, stats)));
    } else if (field.wireType === 2 && (field.fieldNo === 22 || field.fieldNo === 24)) {
      output.push(encodeField(field.fieldNo, field.wireType, patchCell(field.value, settings, stats)));
    } else {
      output.push(field.raw);
    }
  }
  return concatBytes(output);
}

function patchWifi(bytes, settings, stats) {
  const fields = parseFields(bytes);
  const macField = fields.find((field) => field.fieldNo === 1 && field.wireType === 2);
  if (!macField || !/^[0-9a-fA-F]{1,2}(:[0-9a-fA-F]{1,2}){5}$/.test(ascii(macField.value))) return bytes;

  let modified = false;
  const output = fields.map((field) => {
    if (field.fieldNo !== 2 || field.wireType !== 2) return field.raw;
    try {
      const patched = patchLocation(field.value, settings, stats);
      if (!bytesEqual(field.value, patched)) modified = true;
      return encodeField(field.fieldNo, field.wireType, patched);
    } catch {
      stats.skipped += 1;
      return field.raw;
    }
  });
  if (modified) stats.wifi += 1;
  return concatBytes(output);
}

function patchCell(bytes, settings, stats) {
  const fields = parseFields(bytes);
  let modified = false;
  const output = fields.map((field) => {
    if (field.fieldNo !== 5 || field.wireType !== 2) return field.raw;
    try {
      const patched = patchLocation(field.value, settings, stats);
      if (!bytesEqual(field.value, patched)) modified = true;
      return encodeField(field.fieldNo, field.wireType, patched);
    } catch {
      stats.skipped += 1;
      return field.raw;
    }
  });
  if (modified) stats.cell += 1;
  return concatBytes(output);
}

function patchLocation(bytes, settings, stats) {
  const fields = parseFields(bytes);
  if (!fields.some((field) => field.fieldNo === 1 && field.wireType === 0)
    || !fields.some((field) => field.fieldNo === 2 && field.wireType === 0)) return bytes;

  const output = fields.map((field) => {
    if (field.fieldNo === 1 && field.wireType === 0) {
      return encodeField(1, 0, Math.round(settings.latitude * 1e8));
    }
    if (field.fieldNo === 2 && field.wireType === 0) {
      return encodeField(2, 0, Math.round(settings.longitude * 1e8));
    }
    if (field.fieldNo === 3 && field.wireType === 0) {
      return encodeField(3, 0, settings.accuracy);
    }
    return field.raw;
  });
  stats.locations += 1;
  return concatBytes(output);
}

function parseFields(bytes) {
  const fields = [];
  let offset = 0;
  while (offset < bytes.length) {
    const start = offset;
    const [tag, afterTag] = readVarint(bytes, offset);
    offset = afterTag;
    const fieldNo = Math.floor(tag / 8);
    const wireType = tag & 7;
    if (fieldNo === 0) throw new Error(`invalid protobuf field 0 at ${start}`);

    let value;
    if (wireType === 0) {
      [value, offset] = readVarint(bytes, offset);
    } else if (wireType === 1) {
      assertAvailable(bytes, offset, 8);
      value = bytes.subarray(offset, offset + 8);
      offset += 8;
    } else if (wireType === 2) {
      let length;
      [length, offset] = readVarint(bytes, offset);
      assertAvailable(bytes, offset, length);
      value = bytes.subarray(offset, offset + length);
      offset += length;
    } else if (wireType === 5) {
      assertAvailable(bytes, offset, 4);
      value = bytes.subarray(offset, offset + 4);
      offset += 4;
    } else {
      throw new Error(`unsupported wire type ${wireType}`);
    }
    fields.push({ fieldNo, wireType, value, raw: bytes.subarray(start, offset) });
  }
  return fields;
}

function assertAvailable(bytes, offset, length) {
  if (length < 0 || offset + length > bytes.length) throw new Error("truncated protobuf field");
}

function readVarint(bytes, offset) {
  let value = 0;
  let factor = 1;
  let bits = 0;
  while (offset < bytes.length) {
    const byte = bytes[offset++];
    if (bits < 56) value += (byte & 0x7f) * factor;
    if (!(byte & 0x80)) return [value, offset];
    factor *= 128;
    bits += 7;
    if (bits >= 70) throw new Error(`varint too long at ${offset}`);
  }
  throw new Error("truncated varint");
}

function encodeField(fieldNo, wireType, value) {
  const tag = encodeVarint(fieldNo * 8 + wireType);
  if (wireType === 0) return concatBytes([tag, encodeVarint(value)]);
  if (wireType === 1 || wireType === 5) return concatBytes([tag, asBytes(value)]);
  if (wireType === 2) {
    const bytes = asBytes(value);
    return concatBytes([tag, encodeVarint(bytes.length), bytes]);
  }
  throw new Error(`cannot encode wire type ${wireType}`);
}

export function encodeVarint(value) {
  let integer = Math.floor(value);
  if (integer >= 0) {
    const output = [];
    while (integer >= 128) {
      output.push((integer % 128) | 0x80);
      integer = Math.floor(integer / 128);
    }
    output.push(integer);
    return Uint8Array.from(output);
  }

  const twosComplement = new Uint8Array(8);
  let magnitude = -integer;
  for (let index = 0; index < 8; index += 1) {
    twosComplement[index] = magnitude & 0xff;
    magnitude = Math.floor(magnitude / 256);
  }
  let carry = 1;
  for (let index = 0; index < 8; index += 1) {
    const byte = ((~twosComplement[index]) & 0xff) + carry;
    twosComplement[index] = byte & 0xff;
    carry = byte >> 8;
  }
  const output = new Uint8Array(10);
  for (let index = 0; index < 10; index += 1) {
    let byte = 0;
    for (let bit = 0; bit < 7; bit += 1) {
      const absoluteBit = index * 7 + bit;
      if (absoluteBit < 64) byte |= ((twosComplement[absoluteBit >> 3] >> (absoluteBit & 7)) & 1) << bit;
    }
    if (index < 9) byte |= 0x80;
    output[index] = byte;
  }
  return output;
}

export function encodeFieldForTest(fieldNo, wireType, value) {
  return encodeField(fieldNo, wireType, value);
}

export function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return Uint8Array.from(value ?? []);
}

function bytesEqual(left, right) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function ascii(bytes) {
  let result = "";
  for (const byte of bytes) result += String.fromCharCode(byte);
  return result;
}

function copyStats(stats) {
  return { ...stats };
}

function restoreStats(stats, snapshot) {
  Object.assign(stats, snapshot);
}

function countChanges(stats, snapshot) {
  return (stats.locations - snapshot.locations)
    + (stats.wifi - snapshot.wifi)
    + (stats.cell - snapshot.cell);
}

function message(error) {
  return error?.message ?? String(error);
}
