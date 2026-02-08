import {
  TYPE_VARINT,
  TYPE_I64,
  TYPE_LEN,
  TYPE_I32,
  FIELD_SIZE_UNKNOWN,
  FIELD_SIZE_32,
  FIELD_SIZE_64,
  FIELD_SIZE_FIXED_32,
  FIELD_SIZE_FIXED_64,
  FIELD_SIZE_MASK,
  FIELD_ENC_UNKNOWN,
  FIELD_ENC_SIGNED,
  FIELD_ENC_UNSIGNED,
  FIELD_ENC_RSIGNED,
  FIELD_ENC_BOOL,
  FIELD_ENC_IEE754,
  FIELD_ENC_BYTES,
  FIELD_ENC_MESSAGE,
  FIELD_ENC_STRING,
  FIELD_ENC_MASK,
} from './constants.mjs';
import { stringByteLength } from './utf8.mjs';

export const ERR_UNEXPECTED_ENCODING = 'Unexpected field encoding';
export const ERR_UNEXPECTED_SIZE = 'Unexpected field size';

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
  for (const { id, field, value } of fields) {
    // Unknown field
    if (id === 0) {
      size += value.length;
      continue;
    }

    // Known field
    size += intByteLength(id << 3);

    switch (field & FIELD_SIZE_MASK) {
      case FIELD_SIZE_32:
        // TODO(indutny): encoding
        size += intByteLength(value);
        break;
      case FIELD_SIZE_64:
        // TODO(indutny): encoding
        size += bigintByteLength(value);
        break;
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
            size += intByteLength(value.length) + value.length;
            break;
          }
          case FIELD_ENC_MESSAGE: {
            const len = byteLength(value);
            size += intByteLength(len) + len;
            break;
          }
          case FIELD_ENC_UNKNOWN:
            // unknown field
            size += value.length;
            break;
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
