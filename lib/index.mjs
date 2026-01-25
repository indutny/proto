const ERR_TAG_OOB = 'Tag: OOB';
const ERR_TAG_32BIT_VALUE_OOB = 'Tag: 32bit value OOB';

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

      if (offset === length) new Error(ERR_TAG_OOB);
      b = data[offset++];
      tag |= b << 28;
      if ((b & 0b1111_0000) === 0) break;

      throw new Error(ERR_TAG_32BIT_VALUE_OOB);
    }

    result.push(tag);
  }

  return result;
}
