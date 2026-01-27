import { decodeString } from './utf8.mjs';

const ERR_TAG_OOB = 'Tag: OOB';
const ERR_TAG_32BIT_VALUE_OOB = 'Tag: 32bit value OOB';
const ERR_VARINT_OOB = 'Varint: OOB';
const ERR_VARINT_32BIT_VALUE_OOB = 'Varint: 32bit value OOB';
const ERR_VARINT_64BIT_VALUE_OOB = 'Varint: 64bit value OOB';
const ERR_VARINT_INVALID_BOOL = 'Varint: Invalid boolean value';
const ERR_VARINT_INVALID_FIELD = 'Varint: Field type mismatch';
const ERR_LEN_OOB = 'Len: OOB';
const ERR_LEN_32BIT_VALUE_OOB = 'Len: 32bit value OOB';
const ERR_LEN_CONTENT_OOB = 'Len: content OOB';
const ERR_I32_OOB = 'I32: OOB';
const ERR_I64_OOB = 'I64: OOB';

const TYPE_VARINT = 0;
const TYPE_I64 = 1;
const TYPE_LEN = 2;
// Not supported: SGROUP 3, EGROUP 4
const TYPE_I32 = 5;

// Absent field

export const FIELD_HOLE = -1;

// VARINT

export const FIELD_INT32 = 0;
export const FIELD_UINT32 = 1;
export const FIELD_SINT32 = 2;
export const FIELD_INT64 = 3;
export const FIELD_UINT64 = 4;
export const FIELD_SINT64 = 5;
export const FIELD_BOOL = 6;
export const FIELD_ENUM = 7;

// I32

export const FIELD_FIXED32 = 13;
export const FIELD_SFIXED32 = 14;
export const FIELD_FLOAT = 15;

// I64

export const FIELD_FIXED64 = 8;
export const FIELD_SFIXED64 = 9;
export const FIELD_DOUBLE = 10;

// LEN

export const FIELD_STRING = 11;
export const FIELD_BYTES = 12; // or message

const nativeUTF8 = new TextDecoder('utf-8');

// Rough value based on benchmarks. Below this cost of calling into C++ is
// higher than decoding the string in JS.
const NATIVE_UTF8_THRESHOLD = 16;

export function decode(
  data,
  fields,
  start = 0,
  length = data.byteLength,
) {
  const result = [];

  let offset = start;

  while (offset < length) {
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
    const fieldSpec = fields[field] ?? FIELD_HOLE;
    let value;

    switch (type) {
      case TYPE_VARINT: {
        if (offset === length) throw new Error(ERR_VARINT_OOB);
        b = data[offset++];
        switch (fieldSpec) {
          case FIELD_INT32:
          case FIELD_UINT32:
          case FIELD_SINT32:
          case FIELD_ENUM: {
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

            switch (fieldSpec) {
              case FIELD_INT32:
                // Leave as is
                break;
              case FIELD_SINT32: {
                // TODO(indunty): implement me
                break;
              }

              case FIELD_UINT32:
              case FIELD_ENUM:
                // Make unsigned
                value >>>= 0;
                break;

              case FIELD_HOLE:
                // TODO(indutny): unknown field
                break;

              default:
                throw new Error(ERR_VARINT_INVALID_FIELD);
            }

            break;
          }

          case FIELD_HOLE:
          case FIELD_INT64:
          case FIELD_UINT64:
          case FIELD_SINT64: {
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

            switch (fieldSpec) {
              case FIELD_INT64:
                // Leave as is
                break;
              case FIELD_SINT64: {
                // TODO(indunty): implement me
                break;
              }

              case FIELD_UINT64:
                // Make unsigned
                value >>>= 0;
                break;

              case FIELD_HOLE:
                // TODO(indutny): unknown field
                break;

              default:
                throw new Error(ERR_VARINT_INVALID_FIELD);
            }

            value = BigInt(low) | (BigInt(high) << 32n);
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

        switch (fieldSpec) {
          case FIELD_STRING:
            if (prefix > NATIVE_UTF8_THRESHOLD) {
              value = decoder.decode(data.subarray(start, offset));
            } else {
              value = decodeString(data, start, offset);
            }
            break;

          case FIELD_BYTES:
          case FIELD_HOLE:
            value = data.subarray(start, offset);
            break;

          case FIELD_HOLE:
            // TODO(indutny): unknown field
            break;

          case FIELD_INT32:
          case FIELD_UINT32:
          case FIELD_SINT32:
          case FIELD_INT64:
          case FIELD_UINT64:
          case FIELD_SINT64:
          case FIELD_BOOL:
          case FIELD_ENUM:
          case FIELD_FIXED32:
          case FIELD_SFIXED32:
          case FIELD_FLOAT:
          case FIELD_FIXED64:
          case FIELD_SFIXED64:
          case FIELD_DOUBLE:

            // TODO(indutny): packed bytes
            throw new Error('TODO(indutny');
        }

        break;
      }
      case TYPE_I32:
        offset += 4;
        if (offset > length) throw new Error(ERR_I32_OOB);
        // TODO(indutny): decode it
        value = null;
        break;
      case TYPE_I64:
        offset += 8;
        if (offset > length) throw new Error(ERR_64_OOB);
        // TODO(indutny): decode it
        value = null;
        break;
    }

    result.push({ field, value });
  }

  return result;
}
