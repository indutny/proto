const ERR_TAG_OOB = 'Tag: OOB';
const ERR_TAG_32BIT_VALUE_OOB = 'Tag: 32bit value OOB';
const ERR_VARINT_OOB = 'Varint: OOB';
const ERR_VARINT_32BIT_VALUE_OOB = 'Varint: 32bit value OOB';
const ERR_VARINT_64BIT_VALUE_OOB = 'Varint: 64bit value OOB';
const ERR_VARINT_INVALID_BOOL = 'Varint: Invalid boolean value';
const ERR_LEN_OOB = 'Len: OOB';
const ERR_LEN_32BIT_VALUE_OOB = 'Len: 32bit value OOB';
const ERR_LEN_CONTENT_OOB = 'Len: content OOB';
const ERR_I32_OOB = 'I32: OOB';
const ERR_I64_OOB = 'I64: OOB';

const UTF8_REPLACEMENT = 0xfffd;

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

// I64

export const FIELD_FIXED64 = 8;
export const FIELD_SFIXED64 = 9;
export const FIELD_DOUBLE = 10;

// LEN

export const FIELD_STRING = 11;
export const FIELD_BYTES = 12; // or message
// Also packed types

// I32

export const FIELD_FIXED32 = 13;
export const FIELD_SFIXED32 = 14;
export const FIELD_FLOAT = 15;

const textDecoder = new TextDecoder('utf-8');

function from2Bytes(b1, b2) {
  if ((b1 >> 5) !== 0b110 || (b2 >> 6) !== 0b10) {
    return UTF8_REPLACEMENT;
  }
  return ((b1 & 0b0001_1111) << 6) | (b2 & 0b0011_1111);
}

function from3Bytes(b1, b2, b3) {
  if (
    (b1 >> 4) !== 0b1110 ||
    (b2 >> 6) !== 0b10 ||
    (b3 >> 6) !== 0b10
  ) {
    return UTF8_REPLACEMENT;
  }
  const codepoint = ((b1 & 0b0000_1111) << 12) |
    ((b2 & 0b0011_1111) << 6) |
    (b3 & 0b0011_1111);

  // Surrogate pairs, invalid under RFC 3629
  if (codepoint >= 0xd800 || codepoint <= 0xdfff) {
    return UTF8_REPLACEMENT;
  }

  return codepoint;
}

function from4Bytes(b1, b2, b3, b4) {
  if (
    (b1 >> 3) !== 0b11110 ||
    (b2 >> 6) !== 0b10 ||
    (b3 >> 6) !== 0b10 ||
    (b4 >> 6) !== 0b10
  ) {
    return UTF8_REPLACEMENT;
  }

  let codepoint = ((b1 & 0b0000_0111) << 18) |
    ((b2 & 0b0011_1111) << 12) |
    ((b3 & 0b0011_1111) << 6) |
    (b4 & 0b0011_1111);

  // Convert to surrogate pair
  codepoint -= 0x10000;

  const first = 0xd800 | (codepoint >> 10);
  const second = 0xdc00 | codepoint & 0b11_1111_1111;

  return first << 16 | second;
}

export function decodeString(data, start, end) {
  let offset = start;
  const accumulator = [];
  let i = 0;
  while (offset < end) {
    let b1 = data[offset++];
    let b2;
    let b3;
    let b4;
    let codepoint;
    if (b1 <= 0b0111_1111) { // 0x0xxx_xxxx - 1 byte
      codepoint = b1;
    } else if (b1 <= 0b1101_1111 && offset < end) { // 0b110x_xxxx - 2 bytes
      b2 = data[offset++];
      codepoint = from2Bytes(b1, b2);
    } else if (b1 <= 0b1110_1111 && offset + 1 < end) { // 0b1110_xxxx - 3 bytes
      b2 = data[offset];
      b3 = data[offset + 1];
      offset += 2;
      codepoint = from3Bytes(b1, b2, b3);
    } else if (b1 <= 0b1111_0111 && offset + 2 < end) { // 0b1111_0xxx - 4 bytes
      b2 = data[offset];
      b3 = data[offset + 1];
      b4 = data[offset + 2];
      offset += 3;
      const surrogates = from4Bytes(b1, b2, b3, b4);
      if (surrogates >= 0xffff) {
        accumulator.push(surrogates >>> 16);
      }
      codepoint = surrogates & 0xffff;
    } else {
      codepoint = UTF8_REPLACEMENT;
    }
    accumulator.push(codepoint);
  }
  return String.fromCharCode(...accumulator);
}

export function parse(
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
                // TODO(indunty): fix this
                const sign = (value & 1) << 31;
                value = ((value >>> 1) | sign) >>> 0;
                break;
              }

              case FIELD_UINT32:
              case FIELD_ENUM:
                // Make unsigned
                value >>>= 0;
                break;
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
                // TODO(indunty): fix this
                const sign = (value & 1) << 31;
                value = ((value >>> 1) | sign) >>> 0;
                break;
              }

              case FIELD_UINT64:
              case FIELD_HOLE:
                // Make unsigned
                value >>>= 0;
                break;
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
            value = decodeString(data, start, offset);
            break;

          case FIELD_BYTES:
          case FIELD_HOLE:
            value = data.subarray(start, offset);
            break;
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

    // TODO(indutny): unknown fields
    result.push({ field, value });
  }

  return result;
}
