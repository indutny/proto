import { decodeString } from './utf8.mjs';

export const ERR_TAG_OOB = 'Tag: OOB';
export const ERR_TAG_32BIT_VALUE_OOB = 'Tag: 32bit value OOB';
export const ERR_ZERO_FIELD = 'Field number is zero';
export const ERR_VARINT_OOB = 'Varint: OOB';
export const ERR_VARINT_32BIT_VALUE_OOB = 'Varint: 32bit value OOB';
export const ERR_VARINT_64BIT_VALUE_OOB = 'Varint: 64bit value OOB';
export const ERR_VARINT_INVALID_BOOL = 'Varint: Invalid boolean value';
export const ERR_VARINT_INVALID_FIELD = 'Varint: Field type mismatch';
export const ERR_LEN_OOB = 'Len: OOB';
export const ERR_LEN_32BIT_VALUE_OOB = 'Len: 32bit value OOB';
export const ERR_LEN_CONTENT_OOB = 'Len: content OOB';
export const ERR_LEN_INVALID_FIELD = 'Len: Field type mismatch';
export const ERR_I32_OOB = 'I32: OOB';
export const ERR_I32_INVALID_FIELD = 'I32: Field type mismatch';
export const ERR_I64_OOB = 'I64: OOB';
export const ERR_I64_INVALID_FIELD = 'I64: Field type mismatch';

export const TYPE_VARINT = 0;
export const TYPE_I64 = 1;
export const TYPE_LEN = 2;
// Not supported: SGROUP 3, EGROUP 4
export const TYPE_I32 = 5;

const FIELD_SIZE_UNKNOWN = 0;
const FIELD_SIZE_32 = 1 << 0;
const FIELD_SIZE_64 = 1 << 1;
const FIELD_SIZE_FIXED_32 = 1 << 2;
const FIELD_SIZE_FIXED_64 = 1 << 3;

const FIELD_SIZE_MASK =
  FIELD_SIZE_UNKNOWN |
  FIELD_SIZE_32 |
  FIELD_SIZE_64 |
  FIELD_SIZE_FIXED_32 |
  FIELD_SIZE_FIXED_64;

const FIELD_ENC_UNKNOWN = 0;
const FIELD_ENC_SIGNED = 1 << 4;
const FIELD_ENC_UNSIGNED = 1 << 5;
const FIELD_ENC_RSIGNED = 1 << 6; // First bit is a sign
const FIELD_ENC_BOOL = 1 << 7;
const FIELD_ENC_IEE754 = 1 << 8;
const FIELD_ENC_BYTES = 1 << 9;
const FIELD_ENC_STRING = 1 << 10;

const FIELD_ENC_MASK =
  FIELD_ENC_UNKNOWN |
  FIELD_ENC_SIGNED |
  FIELD_ENC_UNSIGNED |
  FIELD_ENC_RSIGNED |
  FIELD_ENC_BOOL |
  FIELD_ENC_IEE754 |
  FIELD_ENC_BYTES |
  FIELD_ENC_STRING;

// Absent field

export const FIELD_UNKNOWN = FIELD_SIZE_UNKNOWN | FIELD_ENC_UNKNOWN;

// VARINT

export const FIELD_INT32 = FIELD_SIZE_32 | FIELD_ENC_SIGNED;
export const FIELD_UINT32 = FIELD_SIZE_32 | FIELD_ENC_UNSIGNED;
export const FIELD_SINT32 = FIELD_SIZE_32 | FIELD_ENC_RSIGNED;
export const FIELD_INT64 = FIELD_SIZE_64 | FIELD_ENC_SIGNED;
export const FIELD_UINT64 = FIELD_SIZE_64 | FIELD_ENC_UNSIGNED;
export const FIELD_SINT64 = FIELD_SIZE_64 | FIELD_ENC_RSIGNED;
export const FIELD_BOOL = FIELD_SIZE_32 | FIELD_ENC_BOOL;
export const FIELD_ENUM = FIELD_UINT32;

// I32

export const FIELD_FIXED32 = FIELD_SIZE_FIXED_32 | FIELD_ENC_UNSIGNED;
export const FIELD_SFIXED32 = FIELD_SIZE_FIXED_32 | FIELD_ENC_SIGNED;
export const FIELD_FLOAT = FIELD_SIZE_FIXED_32 | FIELD_ENC_IEE754;

// I64

export const FIELD_FIXED64 = FIELD_SIZE_FIXED_64 | FIELD_ENC_UNSIGNED;
export const FIELD_SFIXED64 = FIELD_SIZE_FIXED_64 | FIELD_ENC_SIGNED;
export const FIELD_DOUBLE = FIELD_SIZE_FIXED_64 | FIELD_ENC_IEE754;

// LEN

export const FIELD_STRING = FIELD_SIZE_UNKNOWN | FIELD_ENC_STRING;
export const FIELD_BYTES = FIELD_SIZE_UNKNOWN | FIELD_ENC_BYTES;
export const FIELD_MESSAGE = FIELD_BYTES;

const nativeUTF8 = new TextDecoder('utf-8');

// Rough value based on benchmarks. Below this cost of calling into C++ is
// higher than decoding the string in JS.
const NATIVE_UTF8_THRESHOLD = 16;

export function decode(
  data,
  fields,
  start = 0,
  length = data.length,
) {
  const result = [];

  let offset = start;

  while (offset < length) {
    // For unknown fields
    let tagOffset = offset;

    // Parse tag
    let b = data[offset++];

    let tag = b & 0x7f;
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

    // Parse value
    const type = tag & 0b111;
    const field = tag >>> 3;
    if (field === 0) {
      throw new Error(ERR_ZERO_FIELD);
    }
    const fieldBits = fields[field - 1] ?? FIELD_UNKNOWN;
    let value;

    switch (type) {
      case TYPE_VARINT: {
        if (offset === length) throw new Error(ERR_VARINT_OOB);
        b = data[offset++];
        switch (fieldBits & FIELD_SIZE_MASK) {
          case FIELD_SIZE_32: {
            value = b & 0x7f;
            while (value !== b) {
              if (offset === length) throw new Error(ERR_TAG_OOB);
              b = data[offset++];
              value |= (b & 0x7f) << 7;
              if ((b & 0x80) === 0) break;

              if (offset === length) throw new Error(ERR_TAG_OOB);
              b = data[offset++];
              value |= (b & 0x7f) << 14;
              if ((b & 0x80) === 0) break;

              if (offset === length) throw new Error(ERR_TAG_OOB);
              b = data[offset++];
              value |= (b & 0x7f) << 21;
              if ((b & 0x80) === 0) break;

              if (offset === length) throw new Error(ERR_TAG_OOB);
              b = data[offset++];
              value |= b << 28;
              if ((b & 0b1111_0000) === 0) break;

              throw new Error(ERR_VARINT_32BIT_VALUE_OOB);
            }

            switch (fieldBits & FIELD_ENC_MASK) {
              case FIELD_ENC_SIGNED:
                // Leave as is
                break;
              case FIELD_ENC_RSIGNED: {
                value = (-(value & 1)) ^ (value >>> 1);
                break;
              }

              case FIELD_ENC_UNSIGNED:
                // Make unsigned
                value >>>= 0;
                break;

              case FIELD_ENC_BOOL:
                if (value !== 0 && value !== 1) {
                  throw new Error(ERR_VARINT_INVALID_BOOL);
                }
                value = value === 1;
                break;

              default:
                throw new Error(ERR_VARINT_INVALID_FIELD);
            }

            break;
          }

          case FIELD_SIZE_64:
          case FIELD_SIZE_UNKNOWN: {
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
              high |= (b & 0x7f) << 31;
              if ((b & 0b1111_1110) === 0) break;

              throw new Error(ERR_VARINT_64BIT_VALUE_OOB);
            }

            // Keep low unsigned
            low >>>= 0;

            switch (fieldBits & FIELD_ENC_MASK) {
              case FIELD_ENC_SIGNED:
                value = BigInt(low) | (BigInt(high) << 32n);
                break;
              case FIELD_ENC_RSIGNED: {
                const sign = -(low & 1);
                low = ((low >>> 1) | ((high & 1) << 31)) ^ sign;
                low >>>= 0;
                high = (high >>> 1) ^ sign;
                value = BigInt(low) | (BigInt(high) << 32n);
                break;
              }

              case FIELD_ENC_UNSIGNED:
                // Make unsigned
                high >>>= 0;
                value = BigInt(low) | (BigInt(high) << 32n);
                break;

              case FIELD_ENC_UNKNOWN:
                value = { start: tagOffset, end: offset };
                break;

              default:
                throw new Error(ERR_VARINT_INVALID_FIELD);
            }

            break;
          }

          case FIELD_BOOL:
            if (b === 0x00) {
              value = false;
            } else if (b === 0x01) {
              value = true;
            } else {
              throw new Error(ERR_VARINT_INVALID_BOOL);
            }
            break;

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

        switch (fieldBits & FIELD_SIZE_MASK) {
          case FIELD_SIZE_UNKNOWN:
            switch (fieldBits & FIELD_ENC_MASK) {
              case FIELD_ENC_STRING:
                if (prefix > NATIVE_UTF8_THRESHOLD) {
                  value = nativeUTF8.decode(data.subarray(start, offset));
                } else {
                  value = decodeString(data, start, offset);
                }
                break;

              case FIELD_ENC_BYTES:
                value = { start, end: offset };
                break;

              case FIELD_UNKNOWN:
                value = { start: tagOffset, end: offset };
                break;

              default:
                throw new Error(ERR_LEN_INVALID_FIELD);
            }
            break;
          default:
            // TODO(indutny): packed bytes
            throw new Error('TODO(indutny)');
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
            value = data[start] |
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
              4,
            ).getFloat32(0, true);
            break;

          case FIELD_ENC_UNKNOWN:
            value = { start: tagOffset, end: offset };
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
        if (offset > length) throw new Error(ERR_64_OOB);

        const encoding = fieldBits & FIELD_ENC_MASK;
        switch (encoding) {
          case FIELD_ENC_UNSIGNED:
          case FIELD_ENC_SIGNED: {
            let low = data[start] |
              (data[start + 1] << 8) |
              (data[start + 2] << 16) |
              (data[start + 3] << 24);
            let high = data[start + 4] |
              (data[start + 5] << 8) |
              (data[start + 6] << 16) |
              (data[start + 7] << 24);
            low >>>= 0;
            if (encoding === FIELD_ENC_UNSIGNED) {
              high >>>= 0;
            }
            value = BigInt(low) | (BigInt(high) << 32n);
            break;
          }
          case FIELD_ENC_IEE754:
            value = new DataView(
              data.buffer,
              data.byteOffset + start,
              8,
            ).getFloat64(0, true);
            break;

          case FIELD_ENC_UNKNOWN:
            value = { start: tagOffset, end: offset };
            break;

          default:
            throw new Error(ERR_I64_INVALID_FIELD);
        }
        break;
      }
    }

    result.push({ field, value });
  }

  return result;
}
