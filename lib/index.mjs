// TODO:
// - Negative integers
// - Bytes and string are 2GB maximum (so 32bit!)
export function parse(data, start = 0, length = data.byteLength) {
  const result = [];

  let offset = start | 0;

  while (offset < length) {
    let b = data[offset++];

    let tag = b & 0x7f;
    while (tag !== b) {
      if (offset === length) throw new Error('Tag: OOB');
      b = data[offset++];
      tag |= (b & 0x7f) << 7;
      if ((b & 0x80) === 0) break;

      if (offset === length) throw new Error('Tag: OOB');
      b = data[offset++];
      tag |= (b & 0x7f) << 14;
      if ((b & 0x80) === 0) break;

      if (offset === length) throw new Error('Tag: OOB');
      b = data[offset++];
      tag |= (b & 0x7f) << 21;
      if ((b & 0x80) === 0) break;

      if (offset === length) new Error('Tag: OOB');
      b = data[offset++];
      tag |= b << 28;
      if ((b & 0b1111_0000) === 0) break;

      throw new Error('Tag: 32bit OOB');
    }

    result.push(tag);
  }

  return result;
}
