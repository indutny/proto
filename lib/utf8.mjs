const UTF8_REPLACEMENT = 0xfffd;

function from2Bytes(b1, b2) {
  if ((b2 >> 6) !== 0b10) {
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
  if ((b2 >> 6) !== 0b10 || (b3 >> 6) !== 0b10) {
    return UTF8_REPLACEMENT;
  }
  const codepoint = ((b1 & 0b0000_1111) << 12) |
    ((b2 & 0b0011_1111) << 6) |
    (b3 & 0b0011_1111);

  // Overlong encoding
  if (codepoint < 0x800) {
    return UTF8_REPLACEMENT;
  }

  // Surrogate pairs, invalid under RFC 3629 (0xd800 -> 0xdcff)
  if ((codepoint >> 11) === 0b11011) {
    return UTF8_REPLACEMENT;
  }

  return codepoint;
}

function from4Bytes(b1, b2, b3, b4) {
  if (
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
  const second = 0xdc00 | codepoint & 0b11_1111_1111;

  return ((first << 16) | second) >>> 0;
}

const decoder = new TextDecoder('utf-8');

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
      accumulator.push(b1);
    } else if (b1 <= 0b1101_1111 && offset < end) { // 0b110x_xxxx - 2 bytes
      b2 = data[offset++];
      accumulator.push(from2Bytes(b1, b2));
    } else if (b1 <= 0b1110_1111 && offset + 1 < end) { // 0b1110_xxxx - 3 bytes
      b2 = data[offset];
      b3 = data[offset + 1];
      offset += 2;
      accumulator.push(from3Bytes(b1, b2, b3));
    } else if (b1 <= 0b1111_0111 && offset + 2 < end) { // 0b1111_0xxx - 4 bytes
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
