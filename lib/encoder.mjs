import {
  TYPE_VARINT,
  TYPE_I64,
  TYPE_LEN,
  TYPE_I32,
  FIELD_UNKNOWN,
  FIELD_SIZE_UNKNOWN,
  FIELD_SIZE_32,
  FIELD_SIZE_64,
  FIELD_SIZE_FIXED_32,
  FIELD_SIZE_FIXED_64,
  FIELD_SIZE_MASK,
  FIELD_ENC_SIGNED,
  FIELD_ENC_UNSIGNED,
  FIELD_ENC_RSIGNED,
  FIELD_ENC_IEEE754,
  FIELD_ENC_BYTES,
  FIELD_ENC_MESSAGE,
  FIELD_ENC_STRING,
  FIELD_ENC_MASK,
} from './constants.mjs';
import { stringByteLength, encodeStringInto } from './utf8.mjs';

export const ERR_VARINT_INVALID_ENCODING = 'Unexpected varint encoding';
export const ERR_UNEXPECTED_SIZE = 'Unexpected field size';
export const ERR_UNEXPECTED_ENCODING = 'Unexpected field encoding';
export const ERR_INVALID_OUTPUT_LEN = 'Invalid length of produced output';

export const FIELD_ID = 'i';
export const FIELD_TYPE = 't';
export const FIELD_VALUE = 'v';
export const FIELD_BYTE_LENGTH = 'b';

// This is faster than naive branched version by 15%
function intByteLength(value) {
  if (value === 0) {
    return 1;
  }
  return 5 - (((Math.clz32(value) + 3) / 7) | 0);
}

function bigintByteLength(raw) {
  const value = BigInt.asUintN(64, raw);
  if (value < 0x80n) {
    return 1;
  }
  if (value < 0x4000n) {
    return 2;
  }
  if (value < 0x200000n) {
    return 3;
  }
  if (value < 0x10000000n) {
    return 4;
  }
  if (value < 0x800000000n) {
    return 5;
  }
  if (value < 0x40000000000n) {
    return 6;
  }
  if (value < 0x2000000000000n) {
    return 7;
  }
  if (value < 0x100000000000000n) {
    return 8;
  }
  if (value < 0x8000000000000000n) {
    return 9;
  }
  return 10;
}

function byteLength(fields) {
  let size = 0;
  for (const f of fields) {
    const { i: id, t: field, v: value } = f;

    // Unknown field
    if (field === FIELD_UNKNOWN) {
      size += value.length;
      continue;
    }

    // Known field
    size += intByteLength(id << 3);

    switch (field & FIELD_SIZE_MASK) {
      case FIELD_SIZE_32: {
        switch (field & FIELD_ENC_MASK) {
          case FIELD_ENC_SIGNED:
          case FIELD_ENC_UNSIGNED:
            size += intByteLength(value);
            break;
          case FIELD_ENC_RSIGNED:
            size += intByteLength((value << 1) ^ (value >> 31));
            break;
          default:
            throw new Error(ERR_UNEXPECTED_ENCODING);
        }
        break;
      }
      case FIELD_SIZE_64: {
        switch (field & FIELD_ENC_MASK) {
          case FIELD_ENC_SIGNED:
          case FIELD_ENC_UNSIGNED:
            size += bigintByteLength(value);
            break;
          case FIELD_ENC_RSIGNED:
            size += bigintByteLength((value << 1n) ^ (value >> 63n));
            break;
          default:
            throw new Error(ERR_UNEXPECTED_ENCODING);
        }
        break;
      }
      case FIELD_SIZE_FIXED_32:
        size += 4;
        break;
      case FIELD_SIZE_FIXED_64:
        size += 8;
        break;
      case FIELD_SIZE_UNKNOWN:
        switch (field & FIELD_ENC_MASK) {
          case FIELD_ENC_BYTES:
            size += intByteLength(value.length) + value.length;
            break;
          case FIELD_ENC_STRING: {
            const len = stringByteLength(value);
            size += intByteLength(len) + len;

            // Cache size for encoder
            f.b = len;
            break;
          }
          case FIELD_ENC_MESSAGE: {
            const len = byteLength(value);
            size += intByteLength(len) + len;

            // Cache size for encoder
            f.b = len;
            break;
          }
          default:
            throw new Error(ERR_UNEXPECTED_ENCODING);
        }
        break;
      default:
        throw new Error(ERR_UNEXPECTED_SIZE);
    }
  }
  return size;
}

export function encode(fields) {
  const size = byteLength(fields);
  const result = new Uint8Array(size);

  const end = encodeInner(fields, result, 0);
  if (end !== size) {
    throw new Error(ERR_INVALID_OUTPUT_LEN);
  }
  return result;
}

function encodeUInt32(raw, data, start) {
  const value = raw >>> 0;
  let offset = start;

  if (value < 0x80) {
    data[offset++] = value;
  } else if (value < 0x4000) {
    data[offset++] = 0x80 | (value & 0x7f);
    data[offset++] = value >>> 7;
  } else if (value < 0x200000) {
    data[offset++] = 0x80 | (value & 0x7f);
    data[offset++] = 0x80 | ((value >>> 7) & 0x7f);
    data[offset++] = value >>> 14;
  } else if (value < 0x10000000) {
    data[offset++] = 0x80 | (value & 0x7f);
    data[offset++] = 0x80 | ((value >>> 7) & 0x7f);
    data[offset++] = 0x80 | ((value >>> 14) & 0x7f);
    data[offset++] = value >>> 21;
  } else {
    data[offset++] = 0x80 | (value & 0x7f);
    data[offset++] = 0x80 | ((value >>> 7) & 0x7f);
    data[offset++] = 0x80 | ((value >>> 14) & 0x7f);
    data[offset++] = 0x80 | ((value >>> 21) & 0x7f);
    data[offset++] = value >>> 28;
  }

  return offset;
}

function encodeUInt64(value, data, start) {
  let offset = start;

  const low = Number(BigInt.asUintN(32, value));
  const high = Number(BigInt.asUintN(32, value >> 32n));

  if (high === 0) {
    return encodeUInt32(low, data, offset);
  }

  data[offset++] = 0x80 | (low & 0x7f);
  data[offset++] = 0x80 | ((low >>> 7) & 0x7f);
  data[offset++] = 0x80 | ((low >>> 14) & 0x7f);
  data[offset++] = 0x80 | ((low >>> 21) & 0x7f);

  if (high < 0x08) {
    data[offset++] = (high << 4) | (low >>> 28);
  } else if (high < 0x400) {
    data[offset++] = 0x80 | ((high << 4) & 0x7f) | (low >>> 28);
    data[offset++] = high >>> 3;
  } else if (high < 0x20000) {
    data[offset++] = 0x80 | ((high << 4) & 0x7f) | (low >>> 28);
    data[offset++] = 0x80 | ((high >>> 3) & 0x7f);
    data[offset++] = high >>> 10;
  } else if (high < 0x1000000) {
    data[offset++] = 0x80 | ((high << 4) & 0x7f) | (low >>> 28);
    data[offset++] = 0x80 | ((high >>> 3) & 0x7f);
    data[offset++] = 0x80 | ((high >>> 10) & 0x7f);
    data[offset++] = high >>> 17;
  } else if (high < 0x80000000) {
    data[offset++] = 0x80 | ((high << 4) & 0x7f) | (low >>> 28);
    data[offset++] = 0x80 | ((high >>> 3) & 0x7f);
    data[offset++] = 0x80 | ((high >>> 10) & 0x7f);
    data[offset++] = 0x80 | ((high >>> 17) & 0x7f);
    data[offset++] = high >>> 24;
  } else {
    data[offset++] = 0x80 | ((high << 4) & 0x7f) | (low >>> 28);
    data[offset++] = 0x80 | ((high >>> 3) & 0x7f);
    data[offset++] = 0x80 | ((high >>> 10) & 0x7f);
    data[offset++] = 0x80 | ((high >>> 17) & 0x7f);
    data[offset++] = 0x80 | ((high >>> 24) & 0x7f);
    data[offset++] = high >>> 31;
  }

  return offset;
}

const nativeUTF8 = new TextEncoder();

// Rough value based on benchmarks. Below this cost of calling into C++ is
// higher than decoding the string in JS.
const NATIVE_UTF8_THRESHOLD = 48;

function encodeInner(fields, data, start) {
  let offset = start;
  for (const f of fields) {
    const { i: id, t: field, v: value } = f;

    // Unknown field
    if (field === FIELD_UNKNOWN) {
      data.set(value, offset);
      offset += value.length;
      continue;
    }

    // Known field
    let type;
    switch (field & FIELD_SIZE_MASK) {
      case FIELD_SIZE_32:
      case FIELD_SIZE_64:
        type = TYPE_VARINT;
        break;
      case FIELD_SIZE_FIXED_32:
        type = TYPE_I32;
        break;
      case FIELD_SIZE_FIXED_64:
        type = TYPE_I64;
        break;
      case FIELD_SIZE_UNKNOWN:
        type = TYPE_LEN;
        break;
      default:
        throw new Error(ERR_UNEXPECTED_SIZE);
    }

    // Encode tag
    offset = encodeUInt32((id << 3) | type, data, offset);

    // Encode value
    switch (field & FIELD_SIZE_MASK) {
      case FIELD_SIZE_32:
        switch (field & FIELD_ENC_MASK) {
          case FIELD_ENC_SIGNED:
          case FIELD_ENC_UNSIGNED:
            offset = encodeUInt32(value, data, offset);
            break;
          case FIELD_ENC_RSIGNED:
            offset = encodeUInt32((value << 1) ^ (value >> 31), data, offset);
            break;
          default:
            throw new Error(ERR_UNEXPECTED_ENCODING);
        }
        break;
      case FIELD_SIZE_64: {
        switch (field & FIELD_ENC_MASK) {
          case FIELD_ENC_SIGNED:
          case FIELD_ENC_UNSIGNED:
            offset = encodeUInt64(value, data, offset);
            break;
          case FIELD_ENC_RSIGNED: {
            offset = encodeUInt64((value << 1n) ^ (value >> 63n), data, offset);
            break;
          }
          default:
            throw new Error(ERR_UNEXPECTED_ENCODING);
        }
        break;
      }
      case FIELD_SIZE_FIXED_32:
        switch (field & FIELD_ENC_MASK) {
          case FIELD_ENC_UNSIGNED:
          case FIELD_ENC_SIGNED:
            data[offset++] = value & 0xff;
            data[offset++] = (value >>> 8) & 0xff;
            data[offset++] = (value >>> 16) & 0xff;
            data[offset++] = (value >>> 24) & 0xff;
            break;
          case FIELD_ENC_IEEE754:
            new DataView(data.buffer, data.byteOffset + offset, 4).setFloat32(
              0,
              value,
              true
            );
            offset += 4;
            break;
          default:
            throw new Error(ERR_UNEXPECTED_ENCODING);
        }
        break;
      case FIELD_SIZE_FIXED_64:
        switch (field & FIELD_ENC_MASK) {
          case FIELD_ENC_UNSIGNED:
          case FIELD_ENC_SIGNED: {
            const low = Number(BigInt.asUintN(32, value));
            const high = Number(BigInt.asUintN(32, value >> 32n));

            data[offset++] = low & 0xff;
            data[offset++] = (low >>> 8) & 0xff;
            data[offset++] = (low >>> 16) & 0xff;
            data[offset++] = (low >>> 24) & 0xff;
            data[offset++] = high & 0xff;
            data[offset++] = (high >>> 8) & 0xff;
            data[offset++] = (high >>> 16) & 0xff;
            data[offset++] = (high >>> 24) & 0xff;
            break;
          }
          case FIELD_ENC_IEEE754:
            new DataView(data.buffer, data.byteOffset + offset, 8).setFloat64(
              0,
              value,
              true
            );
            offset += 8;
            break;
          default:
            throw new Error(ERR_UNEXPECTED_ENCODING);
        }
        break;
      case FIELD_SIZE_UNKNOWN:
        switch (field & FIELD_ENC_MASK) {
          // TODO(indutny): packed?!
          case FIELD_ENC_BYTES:
            offset = encodeUInt32(value.length, data, offset);
            data.set(value, offset);
            offset += value.length;
            break;
          case FIELD_ENC_STRING: {
            const len = f.b;
            offset = encodeUInt32(len, data, offset);
            if (len <= NATIVE_UTF8_THRESHOLD) {
              offset = encodeStringInto(value, data, offset);
            } else {
              nativeUTF8.encodeInto(value, data.subarray(offset, offset + len));
              offset += len;
            }
            break;
          }
          case FIELD_ENC_MESSAGE: {
            offset = encodeUInt32(f.b, data, offset);
            offset = encodeInner(value, data, offset);
            break;
          }
          default:
            throw new Error(ERR_UNEXPECTED_ENCODING);
        }
        break;
      default:
        throw new Error(ERR_UNEXPECTED_SIZE);
    }
  }
  return offset;
}
