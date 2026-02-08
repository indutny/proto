import { TYPE_VARINT, TYPE_I64, TYPE_LEN, TYPE_I32 } from './decoder.mjs';

export const ERR_UNEXPECTED_VARINT = 'Varint: Unexpected value';
export const ERR_UNEXPECTED_TYPE = 'Unexpected type';

// This is faster than naive branched version by 15%
function intByteLength(value) {
  return 5 - (((Math.clz32(value) + 3) / 7) | 0);
}

function bigintByteLength(value) {
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

export function byteLength(fields) {
  let size = 0;
  for (const { id, type, value } of fields) {
    // Unknown field
    if (id === 0) {
      size += value.length;
      continue;
    }

    // Known field
    const tag = (id << 3) | type;
    size += intByteLength(tag);

    switch (type) {
      case TYPE_VARINT:
        if (typeof value === 'number') {
          size += intByteLength(value);
        } else if (typeof value === 'bigint') {
          size += bigintByteLength(value);
        } else {
          throw new Error(ERR_UNEXPECTED_VARINT);
        }
        break;
      case TYPE_I32:
        size += 4;
        break;
      case TYPE_I64:
        size += 8;
        break;
      case TYPE_LEN: {
        let len;
        if (value instanceof Uint8Array) {
          len = value.length;
        } else if (typeof value === 'string') {
          // TODO(indutny): utf-8 length
          len = value.length;
        } else {
          len = byteLength(value);
        }
        size += intByteLength(len);
        size += len;
        break;
      }
      default:
        throw new Error(ERR_UNEXPECTED_TYPE);
    }
  }
  return size;
}
