import { expect, test, describe } from 'vitest';
import {
  decode,
  TYPE_VARINT,
  TYPE_I32,
  TYPE_I64,
  TYPE_LEN,
  FIELD_INT32,
  FIELD_UINT32,
  FIELD_SINT32,
  FIELD_INT64,
  FIELD_UINT64,
  FIELD_SINT64,
  FIELD_FLOAT,
  FIELD_DOUBLE,
  FIELD_FIXED32,
  FIELD_SFIXED32,
  FIELD_FIXED64,
  FIELD_SFIXED64,
  FIELD_STRING,
  FIELD_BYTES,
  FIELD_UNKNOWN,
  ERR_VARINT_32BIT_VALUE_OOB,
  ERR_VARINT_64BIT_VALUE_OOB,
  ERR_LEN_32BIT_VALUE_OOB,
} from './decoder.mjs';

function harness(data, fields) {
  const res = [];
  decode(new Uint8Array(data), fields, (id, value) => {
    res.push({ id, value });
  });
  return res;
}

describe('32-bit integers', () => {
  test('min int32', () => {
    expect(
      harness(
        [(1 << 3) | TYPE_VARINT, 0xff, 0xff, 0xff, 0xff, 0x0f],
        [FIELD_INT32]
      )
    ).toEqual([{ id: 1, value: -1 }]);
  });

  test('max int32', () => {
    expect(
      harness(
        [(1 << 3) | TYPE_VARINT, 0xff, 0xff, 0xff, 0xff, 0x07],
        [FIELD_INT32]
      )
    ).toEqual([{ id: 1, value: 0x7fffffff }]);
  });

  test('int32', () => {
    expect(
      harness(
        [
          (1 << 3) | TYPE_VARINT,
          0x12,
          (1 << 3) | TYPE_VARINT,
          0x81,
          0x23,
          (1 << 3) | TYPE_VARINT,
          0x81,
          0x82,
          0x34,
          (1 << 3) | TYPE_VARINT,
          0x81,
          0x82,
          0x83,
          0x45,
          (1 << 3) | TYPE_VARINT,
          0x81,
          0x82,
          0x83,
          0x84,
          0x07,
        ],
        [FIELD_INT32]
      )
    ).toEqual([
      { id: 1, value: 0x12 },
      { id: 1, value: 0x1181 },
      { id: 1, value: 0xd0101 },
      { id: 1, value: 0x8a0c101 },
      { id: 1, value: 0x7080c101 },
    ]);
  });

  test('int32 overflow', () => {
    expect(() =>
      harness(
        [(1 << 3) | TYPE_VARINT, 0x81, 0x82, 0x83, 0x84, 0x85, 0x67],
        [FIELD_INT32]
      )
    ).toThrowError(ERR_VARINT_32BIT_VALUE_OOB);
  });

  test('max uint32', () => {
    expect(
      harness(
        [(1 << 3) | TYPE_VARINT, 0xff, 0xff, 0xff, 0xff, 0x0f],
        [FIELD_UINT32]
      )
    ).toEqual([{ id: 1, value: 0xffff_ffff }]);
  });

  test('min sint32', () => {
    expect(
      harness(
        [(1 << 3) | TYPE_VARINT, 0xff, 0xff, 0xff, 0xff, 0x0f],
        [FIELD_SINT32]
      )
    ).toEqual([{ id: 1, value: -0x80000000 }]);
  });

  test('max sint32', () => {
    expect(
      harness(
        [(1 << 3) | TYPE_VARINT, 0xfe, 0xff, 0xff, 0xff, 0x0f],
        [FIELD_SINT32]
      )
    ).toEqual([{ id: 1, value: 0x7fffffff }]);
  });

  test('sint32', () => {
    expect(harness([(1 << 3) | TYPE_VARINT, 0x12], [FIELD_SINT32])).toEqual([
      { id: 1, value: 9 },
    ]);
  });

  test('packed int32', () => {
    expect(
      harness([(1 << 3) | TYPE_LEN, 0x03, 0x01, 0x02, 0x03], [FIELD_INT32])
    ).toEqual([
      { id: 1, value: 1 },
      { id: 1, value: 2 },
      { id: 1, value: 3 },
    ]);
  });
});

describe('64-bit integers', () => {
  test('min int64', () => {
    expect(
      harness(
        [
          (1 << 3) | TYPE_VARINT,
          0xff,
          0xff,
          0xff,
          0xff,
          0xff,
          0xff,
          0xff,
          0xff,
          0xff,
          0x01,
        ],
        [FIELD_INT64]
      )
    ).toEqual([{ id: 1, value: -1n }]);
  });

  test('max int64', () => {
    expect(
      harness(
        [
          (1 << 3) | TYPE_VARINT,
          0xff,
          0xff,
          0xff,
          0xff,
          0xff,
          0xff,
          0xff,
          0xff,
          0xff,
          0x00,
        ],
        [FIELD_INT64]
      )
    ).toEqual([{ id: 1, value: 0x7fffffff_ffffffffn }]);
  });

  test('int64', () => {
    expect(
      harness(
        [
          (1 << 3) | TYPE_VARINT,
          0x12,
          (1 << 3) | TYPE_VARINT,
          0x81,
          0x23,
          (1 << 3) | TYPE_VARINT,
          0x81,
          0x82,
          0x34,
          (1 << 3) | TYPE_VARINT,
          0x81,
          0x82,
          0x83,
          0x45,
          (1 << 3) | TYPE_VARINT,
          0x81,
          0x82,
          0x83,
          0x84,
          0x56,
          (1 << 3) | TYPE_VARINT,
          0x81,
          0x82,
          0x83,
          0x84,
          0x85,
          0x67,
          (1 << 3) | TYPE_VARINT,
          0x81,
          0x82,
          0x83,
          0x84,
          0x85,
          0x86,
          0x78,
          (1 << 3) | TYPE_VARINT,
          0x81,
          0x82,
          0x83,
          0x84,
          0x85,
          0x86,
          0x87,
          0x12,
          (1 << 3) | TYPE_VARINT,
          0x81,
          0x82,
          0x83,
          0x84,
          0x85,
          0x86,
          0x87,
          0x88,
          0x12,
          (1 << 3) | TYPE_VARINT,
          0x81,
          0x82,
          0x83,
          0x84,
          0x85,
          0x86,
          0x87,
          0x88,
          0x89,
          0x01,
        ],
        [FIELD_INT64]
      )
    ).toEqual([
      { id: 1, value: 0x12n },
      { id: 1, value: 0x1181n },
      { id: 1, value: 0xd0101n },
      { id: 1, value: 0x8a0c101n },
      { id: 1, value: 0x56080c101n },
      { id: 1, value: 0x3385080c101n },
      { id: 1, value: 0x1e0305080c101n },
      { id: 1, value: 0x241c305080c101n },
      { id: 1, value: 0x12101c305080c101n },
      { id: 1, value: -0x76efe3cfaf7f3effn },
    ]);
  });

  test('int64 overflow', () => {
    expect(() =>
      harness(
        [
          (1 << 3) | TYPE_VARINT,
          0x81,
          0x82,
          0x83,
          0x84,
          0x85,
          0x86,
          0x87,
          0x88,
          0x89,
          0x03,
        ],
        [FIELD_INT64]
      )
    ).toThrowError(ERR_VARINT_64BIT_VALUE_OOB);
  });

  test('max uint64', () => {
    expect(
      harness(
        [
          (1 << 3) | TYPE_VARINT,
          0xff,
          0xff,
          0xff,
          0xff,
          0xff,
          0xff,
          0xff,
          0xff,
          0xff,
          0x01,
        ],
        [FIELD_UINT64]
      )
    ).toEqual([{ id: 1, value: 0xffffffff_ffffffffn }]);
  });

  test('min sint64', () => {
    expect(
      harness(
        [
          (1 << 3) | TYPE_VARINT,
          0xff,
          0xff,
          0xff,
          0xff,
          0xff,
          0xff,
          0xff,
          0xff,
          0xff,
          0x01,
        ],
        [FIELD_SINT64]
      )
    ).toEqual([{ id: 1, value: -0x80000000_00000000n }]);
  });

  test('max sint64', () => {
    expect(
      harness(
        [
          (1 << 3) | TYPE_VARINT,
          0xfe,
          0xff,
          0xff,
          0xff,
          0xff,
          0xff,
          0xff,
          0xff,
          0xff,
          0x01,
        ],
        [FIELD_SINT64]
      )
    ).toEqual([{ id: 1, value: 0x7fffffff_ffffffffn }]);
  });

  test('sint64', () => {
    expect(harness([(1 << 3) | TYPE_VARINT, 0x12], [FIELD_SINT64])).toEqual([
      { id: 1, value: 9n },
    ]);
  });

  test('unknown field', () => {
    expect(
      harness(
        [(1 << 3) | TYPE_VARINT, 0x80, 0x81, 0x82, 0x83, 0x84, 0x05],
        [FIELD_UNKNOWN]
      )
    ).toEqual([{ id: 1, value: { start: 0, end: 7 } }]);
  });

  test('packed int64', () => {
    expect(
      harness([(1 << 3) | TYPE_LEN, 0x03, 0x01, 0x02, 0x03], [FIELD_INT64])
    ).toEqual([
      { id: 1, value: 1n },
      { id: 1, value: 2n },
      { id: 1, value: 3n },
    ]);
  });
});

describe('len', () => {
  test('string', () => {
    expect(
      harness(
        [(1 << 3) | TYPE_LEN, 0x05, 0x70, 0x72, 0x6f, 0x74, 0x6f],
        [FIELD_STRING]
      )
    ).toEqual([{ id: 1, value: 'proto' }]);
  });

  test('large string', () => {
    expect(
      harness(
        [
          (1 << 3) | TYPE_LEN,
          0x81,
          0x01,
          ...new TextEncoder().encode('p'.repeat(129)),
        ],
        [FIELD_STRING]
      )
    ).toEqual([{ id: 1, value: 'p'.repeat(129) }]);
  });

  test('string length oob', () => {
    expect(() =>
      harness(
        [(1 << 3) | TYPE_LEN, 0xff, 0xff, 0xff, 0xff, 0xff, 0x70],
        [FIELD_STRING]
      )
    ).toThrow(ERR_LEN_32BIT_VALUE_OOB);
  });

  test('bytes', () => {
    expect(
      harness(
        [(1 << 3) | TYPE_LEN, 0x05, 0x70, 0x72, 0x6f, 0x74, 0x6f],
        [FIELD_BYTES]
      )
    ).toEqual([
      { id: 1, value: new Uint8Array([0x70, 0x72, 0x6f, 0x74, 0x6f]) },
    ]);
  });

  test('large bytes', () => {
    const value = new TextEncoder().encode('p'.repeat(129));
    expect(
      harness([(1 << 3) | TYPE_LEN, 0x81, 0x01, ...value], [FIELD_BYTES])
    ).toEqual([{ id: 1, value }]);
  });

  test('bytes length oob', () => {
    expect(() =>
      harness(
        [(1 << 3) | TYPE_LEN, 0xff, 0xff, 0xff, 0xff, 0xff, 0x70],
        [FIELD_BYTES]
      )
    ).toThrow(ERR_LEN_32BIT_VALUE_OOB);
  });

  test('unknown field', () => {
    expect(
      harness([(1 << 3) | TYPE_LEN, 0x03, 0x01, 0x02, 0x03], [FIELD_UNKNOWN])
    ).toEqual([{ id: 1, value: { start: 0, end: 5 } }]);
  });
});

describe('32-bit fixed', () => {
  test('float32', () => {
    expect(
      harness([(1 << 3) | TYPE_I32, 0x00, 0x00, 0x90, 0x3f], [FIELD_FLOAT])
    ).toEqual([{ id: 1, value: 1.125 }]);
  });

  test('int32', () => {
    expect(
      harness([(1 << 3) | TYPE_I32, 0x01, 0x02, 0x03, 0xf4], [FIELD_FIXED32])
    ).toEqual([{ id: 1, value: 0xf4030201 }]);
  });

  test('sint64', () => {
    expect(
      harness([(1 << 3) | TYPE_I32, 0x01, 0xff, 0xff, 0xff], [FIELD_SFIXED32])
    ).toEqual([{ id: 1, value: -0xff }]);
  });

  test('unknown field', () => {
    expect(
      harness([(1 << 3) | TYPE_I32, 0x01, 0x02, 0x03, 0x04], [FIELD_UNKNOWN])
    ).toEqual([{ id: 1, value: { start: 0, end: 5 } }]);
  });

  test('packed int32', () => {
    expect(
      harness(
        [
          (1 << 3) | TYPE_LEN,
          0x08,
          0x01,
          0x00,
          0x00,
          0x00,
          0x02,
          0x00,
          0x00,
          0x00,
        ],
        [FIELD_FIXED32]
      )
    ).toEqual([
      { id: 1, value: 1 },
      { id: 1, value: 2 },
    ]);
  });
});

describe('64-bit fixed', () => {
  test('double', () => {
    expect(
      harness(
        [(1 << 3) | TYPE_I64, 0x8d, 0x97, 0x6e, 0x12, 0x83, 0xc0, 0xf3, 0x3f],
        [FIELD_DOUBLE]
      )
    ).toEqual([{ id: 1, value: 1.2345 }]);
  });

  test('int64', () => {
    expect(
      harness(
        [(1 << 3) | TYPE_I64, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0xf8],
        [FIELD_FIXED64]
      )
    ).toEqual([{ id: 1, value: 0xf807060504030201n }]);
  });

  test('sint64', () => {
    expect(
      harness(
        [(1 << 3) | TYPE_I64, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
        [FIELD_SFIXED64]
      )
    ).toEqual([{ id: 1, value: -0xffn }]);
  });

  test('unknown field', () => {
    expect(
      harness(
        [(1 << 3) | TYPE_I64, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08],
        [FIELD_UNKNOWN]
      )
    ).toEqual([{ id: 1, value: { start: 0, end: 9 } }]);
  });

  test('packed int64', () => {
    expect(
      harness(
        [
          (1 << 3) | TYPE_LEN,
          0x10,
          0x01,
          0x00,
          0x00,
          0x00,
          0x00,
          0x00,
          0x00,
          0x00,
          0x02,
          0x00,
          0x00,
          0x00,
          0x00,
          0x00,
          0x00,
          0x00,
        ],
        [FIELD_FIXED64]
      )
    ).toEqual([
      { id: 1, value: 1n },
      { id: 1, value: 2n },
    ]);
  });
});

test('multiple fields', () => {
  expect(
    harness(
      [
        (1 << 3) | TYPE_VARINT,
        0x10,
        (2 << 3) | TYPE_VARINT,
        0x81,
        0x01,
        (3 << 3) | TYPE_LEN,
        0x02,
        0x01,
        0x02,
      ],
      [FIELD_INT32, FIELD_INT32, FIELD_BYTES]
    )
  ).toEqual([
    { id: 1, value: 0x10 },
    { id: 2, value: 0x81 },
    { id: 3, value: new Uint8Array([0x01, 0x02]) },
  ]);
});
