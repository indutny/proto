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
  FIELD_ENC_SIGNED,
  FIELD_ENC_UNSIGNED,
  FIELD_ENC_IEEE754,
  FIELD_ENC_BYTES,
  FIELD_ENC_MESSAGE,
  FIELD_ENC_STRING,
  FIELD_ENC_MASK,
} from './constants.mjs';
import { stringByteLength } from './utf8.mjs';

export const ERR_VARINT_INVALID_ENCODING = 'Unexpected varint encoding';
export const ERR_UNEXPECTED_SIZE = 'Unexpected field size';
export const ERR_UNEXPECTED_ENCODING = 'Unexpected field encoding';
export const ERR_INVALID_OUTPUT_LEN = 'Invalid length of produced output';

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
      case FIELD_SIZE_32: {
        // TODO(indutny): pre-encode signed/rsigned in generated code
        size += intByteLength(value);
        break;
      }
      case FIELD_SIZE_64: {
        // TODO(indutny): pre-encode signed/rsigned in generated code
        size += bigintByteLength(BigInt.asUintN(64, value));
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
            break;
          }
          case FIELD_ENC_MESSAGE: {
            const len = byteLength(value);
            size += intByteLength(len) + len;
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

function encodeInner(fields, data, start) {
  let offset = start;
  for (const { id, field, value } of fields) {
    // Unknown field
    if (id === 0) {
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
    const tag = (id << 3) | type;
    if (tag < 0x80) {
      data[offset++] = tag;
    } else if (tag < 0x4000) {
      data[offset++] = tag & 0x7f;
      data[offset++] = tag >>> 7;
    } else if (tag < 0x200000) {
      data[offset++] = tag & 0x7f;
      data[offset++] = (tag >>> 7) & 0x7f;
      data[offset++] = tag >>> 14;
    } else if (tag < 0x10000000) {
      data[offset++] = tag & 0x7f;
      data[offset++] = (tag >>> 7) & 0x7f;
      data[offset++] = (tag >>> 14) & 0x7f;
      data[offset++] = tag >>> 21;
    } else {
      data[offset++] = tag & 0x7f;
      data[offset++] = (tag >>> 7) & 0x7f;
      data[offset++] = (tag >>> 14) & 0x7f;
      data[offset++] = (tag >>> 21) & 0x7f;
      data[offset++] = tag >>> 28;
    }

    // Encode value
    switch (field & FIELD_SIZE_MASK) {
      case FIELD_SIZE_32: {
        if (value < 0x80) {
          data[offset++] = value;
        } else if (value < 0x4000) {
          data[offset++] = value & 0x7f;
          data[offset++] = value >>> 7;
        } else if (value < 0x200000) {
          data[offset++] = value & 0x7f;
          data[offset++] = (value >>> 7) & 0x7f;
          data[offset++] = value >>> 14;
        } else if (value < 0x10000000) {
          data[offset++] = value & 0x7f;
          data[offset++] = (value >>> 7) & 0x7f;
          data[offset++] = (value >>> 14) & 0x7f;
          data[offset++] = value >>> 21;
        } else {
          data[offset++] = value & 0x7f;
          data[offset++] = (value >>> 7) & 0x7f;
          data[offset++] = (value >>> 14) & 0x7f;
          data[offset++] = (value >>> 21) & 0x7f;
          data[offset++] = value >>> 28;
        }
        break;
      }
      case FIELD_SIZE_64: {
        const low = Number(BigInt.asUintN(32, value));
        const high = Number(BigInt.asUintN(32, value >> 32n));

        if (high === 0) {
          if (low < 0x80) {
            data[offset++] = value;
          } else if (low < 0x4000) {
            data[offset++] = value & 0x7f;
            data[offset++] = value >>> 7;
          } else if (low < 0x200000) {
            data[offset++] = value & 0x7f;
            data[offset++] = (value >>> 7) & 0x7f;
            data[offset++] = value >>> 14;
          } else if (low < 0x10000000) {
            data[offset++] = value & 0x7f;
            data[offset++] = (value >>> 7) & 0x7f;
            data[offset++] = (value >>> 14) & 0x7f;
            data[offset++] = value >>> 21;
          } else {
            data[offset++] = value & 0x7f;
            data[offset++] = (value >>> 7) & 0x7f;
            data[offset++] = (value >>> 14) & 0x7f;
            data[offset++] = (value >>> 21) & 0x7f;
            data[offset++] = value >>> 28;
          }
        } else {
          // TODO(indutny): encode
        }
        break;
      }
      case FIELD_SIZE_FIXED_32:
        // TODO(indutny): encode
        break;
      case FIELD_SIZE_FIXED_64:
        // TODO(indutny): encode
        break;
      case FIELD_SIZE_UNKNOWN:
        switch (field & FIELD_ENC_MASK) {
          case FIELD_ENC_BYTES:
            // TODO(indutny): encode
            break;
          case FIELD_ENC_STRING: {
            // TODO(indutny): encode
            break;
          }
          case FIELD_ENC_MESSAGE: {
            // TODO(indutny): encode
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
