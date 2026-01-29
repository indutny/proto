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
  length = data.length,
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
    if (field === 0) {
      throw new Error(ERR_ZERO_FIELD);
    }
    const fieldSpec = fields[field - 1] ?? FIELD_HOLE;
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
                value = (-(value & 1)) ^ (value >>> 1);
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

            // Keep low unsigned
            low >>>= 0;

            switch (fieldSpec) {
              case FIELD_INT64:
                break;
              case FIELD_SINT64: {
                const sign = -(low & 1);
                low = ((low >>> 1) | ((high & 1) << 31)) ^ sign;
                low >>>= 0;
                high = (high >>> 1) ^ sign;
                break;
              }

              case FIELD_UINT64:
                // Make unsigned
                high >>>= 0;
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

          case FIELD_HOLE:
            // TODO(indutny): unknown field
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
              value = nativeUTF8.decode(data.subarray(start, offset));
            } else {
              value = decodeString(data, start, offset);
            }
            break;

          case FIELD_BYTES:
            value = { start, end: offset };
            break;

          case FIELD_HOLE:
            // TODO(indutny): unknown field
            break;

          case FIELD_BOOL:
          case FIELD_INT32:
          case FIELD_UINT32:
          case FIELD_SINT32:
          case FIELD_ENUM:

          case FIELD_INT64:
          case FIELD_UINT64:
          case FIELD_SINT64:

          case FIELD_FIXED32:
          case FIELD_SFIXED32:
          case FIELD_FLOAT:

          case FIELD_FIXED64:
          case FIELD_SFIXED64:
          case FIELD_DOUBLE:
            // TODO(indutny): packed bytes
            throw new Error('TODO(indutny)');

          default:
            throw new Error(ERR_LEN_INVALID_FIELD);
        }

        break;
      }
      case TYPE_I32:
        offset += 4;
        if (offset > length) throw new Error(ERR_I32_OOB);
        switch (fieldSpec) {
          case FIELD_FIXED32:
          case FIELD_SFIXED32:
            // TODO(indutny): implement me
            value = null;
            break;
          case FIELD_FLOAT:
            value = new DataView(
              data.buffer,
              data.byteOffset + offset - 4,
              4,
            ).getFloat32(0, true);
            break;

          case FIELD_HOLE:
            // TODO(indutny): unknown field
            value = null;
            break;

          default:
            throw new Error(ERR_I32_INVALID_FIELD);
        }
        break;
      case TYPE_I64:
        offset += 8;
        if (offset > length) throw new Error(ERR_64_OOB);
        switch (fieldSpec) {
          case FIELD_FIXED64:
          case FIELD_SFIXED64:
            // TODO(indutny): implement me
            value = null;
            break;
          case FIELD_DOUBLE:
            value = new DataView(
              data.buffer,
              data.byteOffset + offset - 8,
              8,
            ).getFloat64(0, true);
            break;

          case FIELD_HOLE:
            // TODO(indutny): unknown field
            value = null;
            break;

          default:
            throw new Error(ERR_I64_INVALID_FIELD);
        }
        break;
    }

    result.push({ field, value });
  }

  return result;
}
