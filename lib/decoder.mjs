import { decodeString } from './utf8.mjs';
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
  FIELD_UNKNOWN,
} from './constants.mjs';

const ERR_TAG_OOB = 'Tag: OOB';
const ERR_TAG_32BIT_VALUE_OOB = 'Tag: 32bit value OOB';
const ERR_ZERO_FIELD = 'Field number is zero';
const ERR_VARINT_OOB = 'Varint: OOB';
const ERR_VARINT_64BIT_VALUE_OOB = 'Varint: 64bit value OOB';
const ERR_VARINT_INVALID_BOOL = 'Varint: Invalid boolean value';
const ERR_VARINT_INVALID_FIELD = 'Varint: Field type mismatch';
const ERR_LEN_OOB = 'Len: OOB';
const ERR_LEN_32BIT_VALUE_OOB = 'Len: 32bit value OOB';
const ERR_LEN_CONTENT_OOB = 'Len: content OOB';
const ERR_LEN_INVALID_FIELD = 'Len: Field type mismatch';
const ERR_I32_OOB = 'I32: OOB';
const ERR_I32_INVALID_FIELD = 'I32: Field type mismatch';
const ERR_I64_OOB = 'I64: OOB';
const ERR_I64_INVALID_FIELD = 'I64: Field type mismatch';

const nativeUTF8 = new TextDecoder('utf-8', {
  ignoreBOM: true,
});

// Rough value based on benchmarks. Below this cost of calling into C++ is
// higher than decoding the string in JS.
const NATIVE_UTF8_THRESHOLD = 16;

export function decode(
  data,
  fields,
  callback,
  start = 0,
  length = data.length
) {
  return decodeInner(data, fields, callback, start, length, undefined);
}

function decodeInner(data, fields, callback, start, length, packedTag) {
  let offset = start;

  const parseTag = packedTag === undefined;

  while (offset < length) {
    // For unknown fields
    let tagOffset = offset;

    // Parse tag
    let b;

    let tag;
    if (parseTag) {
      b = data[offset++];

      tag = b & 0x7f;
      while (tag !== b) {
        if (offset === length) throw new Error(ERR_TAG_OOB);
        b = data[offset++];
        tag |= (b & 0x7f) << 7;
        if ((b & 0x80) === 0) break;

        if (offset === length) throw new Error(ERR_TAG_OOB);
        b = data[offset++];
        tag |= (b & 0x7f) << 14;
        if ((b & 0x80) === 0) break;

        if (offset === length) throw new Error(ERR_TAG_OOB);
        b = data[offset++];
        tag |= (b & 0x7f) << 21;
        if ((b & 0x80) === 0) break;

        if (offset === length) throw new Error(ERR_TAG_OOB);
        b = data[offset++];
        tag |= b << 28;
        // Note: only 3 bits because the tag is non-negative
        if ((b & 0b1111_1000) === 0) break;

        throw new Error(ERR_TAG_32BIT_VALUE_OOB);
      }
    } else {
      tag = packedTag;
    }

    // Parse value
    const type = tag & 0b111;
    const id = tag >>> 3;
    if (id === 0) {
      throw new Error(ERR_ZERO_FIELD);
    }

    const fieldBits = fields[id - 1] ?? FIELD_UNKNOWN;
    let value;

    switch (type) {
      case TYPE_VARINT: {
        if (offset === length) throw new Error(ERR_VARINT_OOB);
        b = data[offset++];
        let low = b & 0x7f;
        let high = 0;

        while (low !== b) {
          if (offset === length) throw new Error(ERR_TAG_OOB);
          b = data[offset++];
          low |= (b & 0x7f) << 7;
          if ((b & 0x80) === 0) break;

          if (offset === length) throw new Error(ERR_TAG_OOB);
          b = data[offset++];
          low |= (b & 0x7f) << 14;
          if ((b & 0x80) === 0) break;

          if (offset === length) throw new Error(ERR_TAG_OOB);
          b = data[offset++];
          low |= (b & 0x7f) << 21;
          if ((b & 0x80) === 0) break;

          if (offset === length) throw new Error(ERR_TAG_OOB);
          b = data[offset++];
          low |= b << 28;
          high = (b & 0x7f) >> 4;
          if ((b & 0x80) === 0) break;

          if (offset === length) throw new Error(ERR_TAG_OOB);
          b = data[offset++];
          high |= (b & 0x7f) << 3;
          if ((b & 0x80) === 0) break;

          if (offset === length) throw new Error(ERR_TAG_OOB);
          b = data[offset++];
          high |= (b & 0x7f) << 10;
          if ((b & 0x80) === 0) break;

          if (offset === length) throw new Error(ERR_TAG_OOB);
          b = data[offset++];
          high |= (b & 0x7f) << 17;
          if ((b & 0x80) === 0) break;

          if (offset === length) throw new Error(ERR_TAG_OOB);
          b = data[offset++];
          high |= (b & 0x7f) << 24;
          if ((b & 0x80) === 0) break;

          if (offset === length) throw new Error(ERR_TAG_OOB);
          b = data[offset++];
          high |= b << 31;
          if ((b & 0b1111_1110) === 0) break;

          throw new Error(ERR_VARINT_64BIT_VALUE_OOB);
        }

        switch (fieldBits & FIELD_SIZE_MASK) {
          case FIELD_SIZE_32: {
            switch (fieldBits & FIELD_ENC_MASK) {
              case FIELD_ENC_SIGNED:
                value = low;
                break;
              case FIELD_ENC_RSIGNED: {
                value = -(low & 1) ^ (low >>> 1);
                break;
              }

              case FIELD_ENC_UNSIGNED:
                // Make unsigned
                value = low >>> 0;
                break;

              case FIELD_ENC_BOOL:
                if (low !== 0 && low !== 1) {
                  throw new Error(ERR_VARINT_INVALID_BOOL);
                }
                value = low === 1;
                break;

              default:
                throw new Error(ERR_VARINT_INVALID_FIELD);
            }

            break;
          }

          case FIELD_SIZE_64:
          case FIELD_SIZE_UNKNOWN: {
            // Keep low unsigned
            low >>>= 0;

            switch (fieldBits & FIELD_ENC_MASK) {
              case FIELD_ENC_SIGNED:
                value = BigInt(low) | (BigInt(high) * 0x100000000n);
                break;
              case FIELD_ENC_RSIGNED: {
                const sign = -(low & 1);
                low = ((low >>> 1) | ((high & 1) << 31)) ^ sign;
                low >>>= 0;
                high = (high >>> 1) ^ sign;
                value = BigInt(low) | (BigInt(high) * 0x100000000n);
                break;
              }

              case FIELD_ENC_UNSIGNED:
                // Make unsigned
                high >>>= 0;
                value = BigInt(low) | (BigInt(high) * 0x100000000n);
                break;

              case FIELD_ENC_UNKNOWN:
                value = data.subarray(tagOffset, offset);
                break;

              default:
                throw new Error(ERR_VARINT_INVALID_FIELD);
            }

            break;
          }

          default:
            throw new Error(`Invalid field type for VARINT: ${type}`);
        }
        break;
      }
      case TYPE_LEN: {
        if (offset === length) throw new Error(ERR_LEN_OOB);
        b = data[offset++];
        let prefix = b & 0x7f;
        while (prefix !== b) {
          if (offset === prefix) throw new Error(ERR_LEN_OOB);
          b = data[offset++];
          prefix |= (b & 0x7f) << 7;
          if ((b & 0x80) === 0) break;

          if (offset === length) throw new Error(ERR_LEN_OOB);
          b = data[offset++];
          prefix |= (b & 0x7f) << 14;
          if ((b & 0x80) === 0) break;

          if (offset === length) throw new Error(ERR_LEN_OOB);
          b = data[offset++];
          prefix |= (b & 0x7f) << 21;
          if ((b & 0x80) === 0) break;

          if (offset === length) throw new Error(ERR_LEN_OOB);
          b = data[offset++];
          prefix |= b << 28;
          // Note: only 3 bits because the length prefix is non-negative
          if ((b & 0b1111_1000) === 0) break;

          throw new Error(ERR_LEN_32BIT_VALUE_OOB);
        }

        const start = offset;
        offset += prefix;
        if (offset > length) throw new Error(ERR_LEN_CONTENT_OOB);

        const fieldSize = fieldBits & FIELD_SIZE_MASK;
        switch (fieldSize) {
          case FIELD_SIZE_UNKNOWN:
            switch (fieldBits & FIELD_ENC_MASK) {
              case FIELD_ENC_STRING:
                if (prefix > NATIVE_UTF8_THRESHOLD) {
                  // Buffer support
                  if ('utf8Slice' in data) {
                    value = data.utf8Slice(start, offset);
                  } else {
                    value = nativeUTF8.decode(data.subarray(start, offset), {
                      stream: false,
                    });
                  }
                } else {
                  value = decodeString(data, start, offset);
                }
                break;

              case FIELD_ENC_BYTES:
                value = data.subarray(start, offset);
                break;
              case FIELD_ENC_MESSAGE:
                value = { start, end: offset };
                break;
              case FIELD_ENC_UNKNOWN:
                value = data.subarray(tagOffset, offset);
                break;

              default:
                throw new Error(ERR_LEN_INVALID_FIELD);
            }
            break;
          case FIELD_SIZE_32:
          case FIELD_SIZE_64:
          case FIELD_SIZE_FIXED_32:
          case FIELD_SIZE_FIXED_64: {
            // Packed
            let packedTag = id << 3;
            switch (fieldSize) {
              case FIELD_SIZE_32:
              case FIELD_SIZE_64:
                packedTag |= TYPE_VARINT;
                break;
              case FIELD_SIZE_FIXED_32:
                packedTag |= TYPE_I32;
                break;
              case FIELD_SIZE_FIXED_64:
                packedTag |= TYPE_I64;
                break;
            }

            decodeInner(data, fields, callback, start, offset, packedTag);

            // Skip pushing anything extra to result
            continue;
          }

          default:
            throw new Error(ERR_LEN_INVALID_FIELD);
        }

        break;
      }
      case TYPE_I32: {
        const sizeBits = fieldBits & FIELD_SIZE_MASK;
        if (
          sizeBits !== FIELD_SIZE_FIXED_32 &&
          sizeBits !== FIELD_SIZE_UNKNOWN
        ) {
          throw new Error(ERR_I32_INVALID_FIELD);
        }

        let start = offset;
        offset += 4;
        if (offset > length) throw new Error(ERR_I32_OOB);
        const encoding = fieldBits & FIELD_ENC_MASK;
        switch (encoding) {
          case FIELD_ENC_UNSIGNED:
          case FIELD_ENC_SIGNED:
            value =
              data[start] |
              (data[start + 1] << 8) |
              (data[start + 2] << 16) |
              (data[start + 3] << 24);
            if (encoding === FIELD_ENC_UNSIGNED) {
              value >>>= 0;
            }
            break;
          case FIELD_ENC_IEE754:
            value = new DataView(
              data.buffer,
              data.byteOffset + start,
              4
            ).getFloat32(0, true);
            break;

          case FIELD_ENC_UNKNOWN:
            value = data.subarray(tagOffset, offset);
            break;

          default:
            throw new Error(ERR_I32_INVALID_FIELD);
        }
        break;
      }
      case TYPE_I64: {
        const sizeBits = fieldBits & FIELD_SIZE_MASK;
        if (
          sizeBits !== FIELD_SIZE_FIXED_64 &&
          sizeBits !== FIELD_SIZE_UNKNOWN
        ) {
          throw new Error(ERR_I64_INVALID_FIELD);
        }

        let start = offset;
        offset += 8;
        if (offset > length) throw new Error(ERR_I64_OOB);

        const encoding = fieldBits & FIELD_ENC_MASK;
        switch (encoding) {
          case FIELD_ENC_UNSIGNED:
          case FIELD_ENC_SIGNED: {
            let low =
              data[start] |
              (data[start + 1] << 8) |
              (data[start + 2] << 16) |
              (data[start + 3] << 24);
            let high =
              data[start + 4] |
              (data[start + 5] << 8) |
              (data[start + 6] << 16) |
              (data[start + 7] << 24);
            low >>>= 0;
            if (encoding === FIELD_ENC_UNSIGNED) {
              high >>>= 0;
            }
            value = BigInt(low) | (BigInt(high) * 0x100000000n);
            break;
          }
          case FIELD_ENC_IEE754:
            value = new DataView(
              data.buffer,
              data.byteOffset + start,
              8
            ).getFloat64(0, true);
            break;

          case FIELD_ENC_UNKNOWN:
            value = data.subarray(tagOffset, offset);
            break;

          default:
            throw new Error(ERR_I64_INVALID_FIELD);
        }
        break;
      }
    }

    callback(id, value);
  }
}
