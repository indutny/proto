const ERR_TAG_OOB = 'Tag: OOB';
const ERR_TAG_32BIT_VALUE_OOB = 'Tag: 32bit value OOB';
const ERR_VARINT_OOB = 'Varint: OOB';
const ERR_VARINT_64BIT_VALUE_OOB = 'Varint: 64bit value OOB';
const ERR_LEN_OOB = 'Len: OOB';
const ERR_LEN_32BIT_VALUE_OOB = 'Len: 32bit value OOB';
const ERR_LEN_CONTENT_OOB = 'Len: content OOB';

const TYPE_VARINT = 0;
const TYPE_I64 = 1;
const TYPE_LEN = 2;
// Not supported: SGROUP 3, EGROUP 4
const TYPE_I32 = 5;

// TODO:
// - Negative integers
// - Bytes and string are 2GB maximum (so 32bit!)
export function parse(data, start = 0, length = data.byteLength) {
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
    let start = offset;
    switch (tag & 0b111) {
      case TYPE_VARINT: {
        if (offset === length) throw new Error(ERR_VARINT_OOB);
        b = data[offset++];
        let value = b & 0x7f;
        while ((b & 0x80) !== 0) {
          if (offset === length) throw new Error(ERR_VARINT_OOB);
          b = data[offset++];
          if ((b & 0x80) === 0) break; // shift 7

          if (offset === length) throw new Error(ERR_VARINT_OOB);
          b = data[offset++];
          if ((b & 0x80) === 0) break; // shift 14

          if (offset === length) throw new Error(ERR_VARINT_OOB);
          b = data[offset++];
          if ((b & 0x80) === 0) break; // shift 21

          if (offset === length) throw new Error(ERR_VARINT_OOB);
          b = data[offset++];
          if ((b & 0x80) === 0) break; // shift 28

          if (offset === length) throw new Error(ERR_VARINT_OOB);
          b = data[offset++];
          if ((b & 0x80) === 0) break; // shift 35

          if (offset === length) throw new Error(ERR_VARINT_OOB);
          b = data[offset++];
          if ((b & 0x80) === 0) break; // shift 42

          if (offset === length) throw new Error(ERR_VARINT_OOB);
          b = data[offset++];
          if ((b & 0x80) === 0) break; // shift 49

          if (offset === length) throw new Error(ERR_VARINT_OOB);
          b = data[offset++];
          if ((b & 0x80) === 0) break; // shift 56

          if (offset === length) throw new Error(ERR_VARINT_OOB);
          b = data[offset++];
          if ((b & 0b1111_1110) === 0) break; // shift 63

          throw new Error(ERR_VARINT_64BIT_VALUE_OOB);
        }
        break;
      }
      case TYPE_LEN: {
        if (offset === length) throw new Error(ERR_LEN_OOB);
        b = data[offset++];
        let value = b & 0x7f;
        while (value !== b) {
          if (offset === value) throw new Error(ERR_LEN_OOB);
          b = data[offset++];
          value |= (b & 0x7f) << 7;
          if ((b & 0x80) === 0) break;

          if (offset === length) throw new Error(ERR_LEN_OOB);
          b = data[offset++];
          value |= (b & 0x7f) << 14;
          if ((b & 0x80) === 0) break;

          if (offset === length) throw new Error(ERR_LEN_OOB);
          b = data[offset++];
          value |= (b & 0x7f) << 21;
          if ((b & 0x80) === 0) break;

          if (offset === length) throw new Error(ERR_LEN_OOB);
          b = data[offset++];
          value |= b << 28;
          // Note: only 3 bits because the length prefix is non-negative
          if ((b & 0b1111_1000) === 0) break;

          throw new Error(ERR_LEN_32BIT_VALUE_OOB);
        }

        start = offset;
        offset += value;
        if (offset > length) throw new Error(ERR_LEN_CONTENT_OOB);

        break;
      }
      case TYPE_I32:
        offset += 4;
        break;
      case TYPE_I64:
        offset += 8;
        break;
    }

    result.push({ tag, start, end: offset });
  }

  return result;
}
