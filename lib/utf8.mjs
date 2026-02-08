const UTF8_REPLACEMENT = 0xfffd;

function from2Bytes(b1, b2) {
  if (b2 >> 6 !== 0b10) {
    return UTF8_REPLACEMENT;
  }
  const codepoint = ((b1 & 0b0001_1111) << 6) | (b2 & 0b0011_1111);
  // Overlong encoding
  if (codepoint < 0x80) {
    return UTF8_REPLACEMENT;
  }
  return codepoint;
}

function from3Bytes(b1, b2, b3) {
  if (b2 >> 6 !== 0b10 || b3 >> 6 !== 0b10) {
    return UTF8_REPLACEMENT;
  }
  const codepoint =
    ((b1 & 0b0000_1111) << 12) | ((b2 & 0b0011_1111) << 6) | (b3 & 0b0011_1111);

  // Overlong encoding
  if (codepoint < 0x800) {
    return UTF8_REPLACEMENT;
  }

  // Surrogate pairs, invalid under RFC 3629 (0xd800 -> 0xdcff)
  if (codepoint >> 11 === 0b11011) {
    return UTF8_REPLACEMENT;
  }

  return codepoint;
}

function from4Bytes(b1, b2, b3, b4) {
  if (b2 >> 6 !== 0b10 || b3 >> 6 !== 0b10 || b4 >> 6 !== 0b10) {
    return UTF8_REPLACEMENT;
  }

  let codepoint =
    ((b1 & 0b0000_0111) << 18) |
    ((b2 & 0b0011_1111) << 12) |
    ((b3 & 0b0011_1111) << 6) |
    (b4 & 0b0011_1111);

  // Overlong encoding
  if (codepoint < 0x10000) {
    return UTF8_REPLACEMENT;
  }

  // Table overflow
  if (codepoint > 0x10ffff) {
    return UTF8_REPLACEMENT;
  }

  // Convert to surrogate pair
  codepoint -= 0x10000;

  const first = 0xd800 | (codepoint >>> 10);
  const second = 0xdc00 | (codepoint & 0b11_1111_1111);

  return ((first << 16) | second) >>> 0;
}

const SURROGATE_MASK = 0b11111100_00000000;
const HIGH_SURROGATE = 0b11011000_00000000;
const LOW_SURROGATE = 0b11011100_00000000;
const SURROGATE_VALUE_MASK = 0b00000011_11111111;

export function decodeString(data, start, end) {
  let offset = start;
  const accumulator = [];
  while (offset < end) {
    let b1 = data[offset++];
    let b2;
    let b3;
    let b4;
    if (b1 <= 0b0111_1111) {
      // 0x0xxx_xxxx - 1 byte
      accumulator.push(b1);
    } else if (b1 <= 0b1101_1111 && offset < end) {
      // 0b110x_xxxx - 2 bytes
      b2 = data[offset++];
      accumulator.push(from2Bytes(b1, b2));
    } else if (b1 <= 0b1110_1111 && offset + 1 < end) {
      // 0b1110_xxxx - 3 bytes
      b2 = data[offset];
      b3 = data[offset + 1];
      offset += 2;
      accumulator.push(from3Bytes(b1, b2, b3));
    } else if (b1 <= 0b1111_0111 && offset + 2 < end) {
      // 0b1111_0xxx - 4 bytes
      b2 = data[offset];
      b3 = data[offset + 1];
      b4 = data[offset + 2];
      offset += 3;
      const surrogates = from4Bytes(b1, b2, b3, b4);
      if (surrogates >= 0xffff) {
        accumulator.push(surrogates >>> 16, surrogates & 0xffff);
      } else {
        accumulator.push(surrogates);
      }
    } else {
      accumulator.push(UTF8_REPLACEMENT);
    }
  }

  return String.fromCharCode(...accumulator);
}

export function stringByteLength(value) {
  let size = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x80) {
      // One byte: 0x00-0x7f
      size += 1;
    } else if (code < 0x800) {
      // Two bytes: 0x80-0x7ff
      size += 2;
    } else if ((code & SURROGATE_MASK) === HIGH_SURROGATE) {
      i += 1;
      if (i === value.length) {
        // Missing low surrogate, encode \ufffd
        size += 3;
        continue;
      }

      const second = value.charCodeAt(i);
      if ((second & SURROGATE_MASK) !== LOW_SURROGATE) {
        i -= 1;

        // Missing low surrogate, encode \ufffd
        size += 3;
        continue;
      }

      // Four bytes through a surrogate pair
      size += 4;
    } else if ((code & SURROGATE_MASK) === LOW_SURROGATE) {
      // Missing high surrogate, encode \ufffd
      size += 3;
    } else {
      // Three bytes: 0x800-0xffff
      size += 3;
    }
  }
  return size;
}

function encodeReplacement(data, start) {
  let offset = start;
  data[offset++] = 0xef;
  data[offset++] = 0xbf;
  data[offset++] = 0xbd;
  return offset;
}

export function encodeStringInto(value, data, start) {
  let offset = start;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x80) {
      data[offset++] = code;
    } else if (code < 0x800) {
      // Two bytes: 0x80-0x7ff
      data[offset++] = 0b1100_0000 | (code >>> 6);
      data[offset++] = 0b1000_0000 | (code & 0b0011_1111);
    } else if ((code & SURROGATE_MASK) === HIGH_SURROGATE) {
      i += 1;
      if (i === value.length) {
        // Missing low surrogate, encode \ufffd
        offset = encodeReplacement(data, offset);
        continue;
      }

      const second = value.charCodeAt(i);
      if ((second & SURROGATE_MASK) !== LOW_SURROGATE) {
        i -= 1;

        // Missing low surrogate, encode \ufffd
        offset = encodeReplacement(data, offset);
        continue;
      }

      // Four bytes through a surrogate pair
      let full = (code & SURROGATE_VALUE_MASK) << 10;
      full |= second & SURROGATE_VALUE_MASK;
      full += 0x10000;

      data[offset++] = 0b1111_0000 | (full >>> 18);
      data[offset++] = 0b1000_0000 | ((full >>> 12) & 0b0011_1111);
      data[offset++] = 0b1000_0000 | ((full >>> 6) & 0b0011_1111);
      data[offset++] = 0b1000_0000 | (full & 0b0011_1111);
    } else if ((code & SURROGATE_MASK) === LOW_SURROGATE) {
      // Missing high surrogate, encode \ufffd
      offset = encodeReplacement(data, offset);
    } else {
      // Three bytes: 0x800-0xffff
      data[offset++] = 0b1110_0000 | (code >>> 12);
      data[offset++] = 0b1000_0000 | ((code >>> 6) & 0b0011_1111);
      data[offset++] = 0b1000_0000 | (code & 0b0011_1111);
    }
  }
  return offset;
}
