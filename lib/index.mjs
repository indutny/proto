// TODO:
// - Negative integers
export function parse(data, start = 0, length = data.byteLength) {
  const result = [];

  let offset = start;

  while (offset < length) {
    let b = data[offset++];

    let tag = b & 0x7f;
    if (tag !== b) {
      if (offset === length) {
        throw new Error('Tag: OOB');
      }
      b = data[offset++];

      let lo = b & 0x7f;
      tag |= lo << 7;
      if (lo !== b) {
        if (offset === length) {
          throw new Error('Tag: OOB');
        }
        b = data[offset++];

        lo = b & 0x7f;
        tag |= lo << 14;
        if (lo !== b) {
          if (offset === length) {
            throw new Error('Tag: OOB');
          }
          b = data[offset++];

          lo = b & 0x7f;
          tag |= lo << 21;
          if (lo !== b) {
            if (offset === length) {
              throw new Error('Tag: OOB');
            }

            b = data[offset++];

            lo = b & 0b0000_1111;
            tag |= lo << 28;
            if (lo !== b) {
              throw new Error('Tag: 32bit OOB');
            }
          }
        }
      }
    }

    result.push(tag);
  }

  return result;
}

// TODO:
// - Negative integers
export function parse2(data, start = 0, length = data.byteLength) {
  const result = [];

  let offset = start;

  while (offset < length) {
    let b = data[offset++];

    let tag = b & 0x7f;
    if (tag !== b) {
      if (offset === length) {
        throw new Error('Tag: OOB');
      }
      b = data[offset++];

      let lo = b & 0x7f;
      tag |= lo << 7;
      if (lo !== b) {
        if (offset === length) {
          throw new Error('Tag: OOB');
        }
        b = data[offset++];

        lo = b & 0x7f;
        tag |= lo << 14;
        if (lo !== b) {
          if (offset === length) {
            throw new Error('Tag: OOB');
          }
          b = data[offset++];

          lo = b & 0x7f;
          tag |= lo << 21;
          if (lo !== b) {
            if (offset === length) {
              throw new Error('Tag: OOB');
            }

            b = data[offset++];

            lo = b & 0b0000_1111;
            tag |= lo << 28;
            if (lo !== b) {
              throw new Error('Tag: 32bit OOB');
            }
          }
        }
      }
    }

    result.push(tag);
  }

  return result;
}
