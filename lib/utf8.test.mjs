import { describe, expect, test } from 'vitest';
import { decodeString, byteLength } from './utf8.mjs';

describe('decode', () => {
  test('empty string', () => {
    expect(decodeString([1, 2, 3], 0, 0)).toBe('');
  });

  test('1-byte codepoint', () => {
    expect(decodeString([0x0, 0x7f], 0, 2)).toBe('\x00\x7f');
  });

  test('2-byte codepoint', () => {
    expect(
      decodeString([0b1100_0010, 0b1000_0000, 0b1101_1111, 0b1011_1111], 0, 4)
    ).toBe('\u0080\u07ff');
  });

  test('2-byte invalid codepoint', () => {
    expect(decodeString([0b1100_0010, 0b1100_0001], 0, 2)).toBe('\ufffd');
  });

  test('2-byte overlong codepoint', () => {
    expect(decodeString([0b1100_0000, 0b1010_0000], 0, 2)).toBe('\ufffd');
  });

  test('3-byte codepoint', () => {
    expect(
      decodeString(
        [
          0b1110_0000, 0b1010_0000, 0b1000_0000, 0b1110_1101, 0b1001_1111,
          0b1011_1111, 0b1110_1110, 0b1000_0000, 0b1000_0000, 0b1110_1111,
          0b1011_1111, 0b1011_1111,
        ],
        0,
        12
      )
    ).toBe('\u0800\ud7ff\ue000\uffff');
  });

  test('3-byte disallowed surrogate', () => {
    expect(
      decodeString(
        [
          0b1110_1101,
          0b1010_0000,
          0b1000_0000, // d800
          0b1110_1101,
          0b1011_1111,
          0b1011_1111, // dfff
        ],
        0,
        6
      )
    ).toBe('\ufffd\ufffd');
  });

  test('3-byte invalid codepoint', () => {
    expect(
      decodeString(
        [
          0b1110_0000, 0b1100_0000, 0b1000_0000, 0b1110_0000, 0b1000_0000,
          0b1100_0000,
        ],
        0,
        6
      )
    ).toBe('\ufffd\ufffd');
  });

  test('3-byte overlong codepoint', () => {
    expect(decodeString([0b1110_0000, 0b1000_0000, 0b1000_0000], 0, 3)).toBe(
      '\ufffd'
    );
  });

  test('4-byte codepoint translated to surrogates', () => {
    expect(
      decodeString(
        [
          0b1111_0000,
          0b1001_0000,
          0b1000_0000,
          0b1000_0000, // 10000
          0b1111_0100,
          0b1000_1111,
          0b1011_1111,
          0b1011_1111, // 10FFFF
        ],
        0,
        8
      )
    ).toBe('\ud800\udc00\udbff\udfff');
  });

  test('4-byte overlong codepoint', () => {
    expect(
      decodeString([0b1111_0000, 0b1000_0000, 0b1000_0000, 0b1000_0000], 0, 4)
    ).toBe('\ufffd');
  });

  test('4-byte invalid codepoint', () => {
    expect(
      decodeString(
        [
          0b1111_0000,
          0b1100_0000,
          0b1000_0000,
          0b1000_0000,
          0b1111_0000,
          0b1000_0000,
          0b1100_0000,
          0b1000_0000,
          0b1111_0000,
          0b1000_0000,
          0b1000_0000,
          0b1100_0000,
          0b1111_0111,
          0b1001_1111,
          0b1011_1111,
          0b1011_1111, // 1FFFFF
        ],
        0,
        16
      )
    ).toBe('\ufffd\ufffd\ufffd\ufffd');
  });

  test('invalid codepoint', () => {
    expect(decodeString([0b1111_1100, 0b1111_1111], 0, 2)).toBe('\ufffd\ufffd');
  });

  test('emoji', () => {
    expect(decodeString([0xf0, 0x9f, 0x98, 0xb1], 0, 4)).toBe('😱');
  });

  test('long string', () => {
    const acc = [];
    for (let i = 0; i < 10000; i++) {
      acc.push(0x20);
    }
    expect(decodeString(acc, 0, acc.length)).toBe(' '.repeat(acc.length));
  });
});

describe('byteLength', () => {
  test('empty string', () => {
    expect(byteLength('')).toBe(0);
  });

  test('ascii string', () => {
    expect(byteLength('hello\x7f')).toBe(6);
  });

  test('two-byte codes', () => {
    expect(byteLength('\u0080\u07ff')).toBe(4);
  });

  test('three-byte codes', () => {
    expect(byteLength('\u0800\ud7ff\ue000\uffff')).toBe(12);
  });

  test('four-byte codes', () => {
    expect(byteLength('\ud800\udc00\udbff\udfff')).toBe(8);
  });

  test('missing low surrogate', () => {
    expect(byteLength('\ud800a')).toBe(4);
  });

  test('missing high surrogate', () => {
    expect(byteLength('\udc00a')).toBe(4);
  });
});
