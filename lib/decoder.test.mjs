import { expect, test, describe } from 'vitest';
import {
  decode,

  TYPE_VARINT,
  TYPE_I32,
  TYPE_I64,

  FIELD_INT32,
  FIELD_UINT32,
  FIELD_SINT32,

  FIELD_INT64,
  FIELD_UINT64,
  FIELD_SINT64,

  FIELD_FLOAT,
  FIELD_DOUBLE,

  ERR_VARINT_32BIT_VALUE_OOB,
  ERR_VARINT_64BIT_VALUE_OOB,
} from './decoder.mjs';

describe('32-bit integers', () => {
  test('min int32', () => {
    expect(decode([
      (1 << 3) | TYPE_VARINT,
      0xff, 0xff, 0xff, 0xff, 0x0f,
    ], [ FIELD_INT32 ])).toEqual([
      { field: 1, value: -1 },
    ]);
  });

  test('max int32', () => {
    expect(decode([
      (1 << 3) | TYPE_VARINT,
      0xff, 0xff, 0xff, 0xff, 0x07,
    ], [ FIELD_INT32 ])).toEqual([
      { field: 1, value: 0x7fffffff },
    ]);
  });

  test('int32', () => {
    expect(decode([
      (1 << 3) | TYPE_VARINT,
      0x12,
      (1 << 3) | TYPE_VARINT,
      0x81, 0x23,
      (1 << 3) | TYPE_VARINT,
      0x81, 0x82, 0x34,
      (1 << 3) | TYPE_VARINT,
      0x81, 0x82, 0x83, 0x45,
      (1 << 3) | TYPE_VARINT,
      0x81, 0x82, 0x83, 0x84, 0x07,
    ], [ FIELD_INT32 ])).toEqual([
      { field: 1, value: 0x12 },
      { field: 1, value: 0x1181 },
      { field: 1, value: 0xd0101 },
      { field: 1, value: 0x8a0c101 },
      { field: 1, value: 0x7080c101 },
    ]);
  });

  test('int32 overflow', () => {
    expect(() => decode([
      (1 << 3) | TYPE_VARINT,
      0x81, 0x82, 0x83, 0x84, 0x85, 0x67,
    ], [ FIELD_INT32 ])).toThrowError(ERR_VARINT_32BIT_VALUE_OOB);
  });

  test('max uint32', () => {
    expect(decode([
      (1 << 3) | TYPE_VARINT,
      0xff, 0xff, 0xff, 0xff, 0x0f,
    ], [ FIELD_UINT32 ])).toEqual([
      { field: 1, value: 0xffff_ffff },
    ]);
  });

  test('min sint32', () => {
    expect(decode([
      (1 << 3) | TYPE_VARINT,
      0xff, 0xff, 0xff, 0xff, 0x0f,
    ], [ FIELD_SINT32 ])).toEqual([
      { field: 1, value: -0x80000000 },
    ]);
  });

  test('max sint32', () => {
    expect(decode([
      (1 << 3) | TYPE_VARINT,
      0xfe, 0xff, 0xff, 0xff, 0x0f,
    ], [ FIELD_SINT32 ])).toEqual([
      { field: 1, value: 0x7fffffff },
    ]);
  });

  test('sint32', () => {
    expect(decode([
      (1 << 3) | TYPE_VARINT,
      0x12,
    ], [ FIELD_SINT32 ])).toEqual([
      { field: 1, value: 9 },
    ]);
  });

  // TODO(indutny): packed
});

describe('64-bit integers', () => {
  test('min int64', () => {
    expect(decode([
      (1 << 3) | TYPE_VARINT,
      0xff, 0xff, 0xff, 0xff, 0xff,
      0xff, 0xff, 0xff, 0xff, 0x01,
    ], [ FIELD_INT64 ])).toEqual([
      { field: 1, value: -1n },
    ]);
  });

  test('max int64', () => {
    expect(decode([
      (1 << 3) | TYPE_VARINT,
      0xff, 0xff, 0xff, 0xff, 0xff,
      0xff, 0xff, 0xff, 0xff, 0x00,
    ], [ FIELD_INT64 ])).toEqual([
      { field: 1, value: 0x7fffffff_ffffffffn },
    ]);
  });

  test('int64', () => {
    expect(decode([
      (1 << 3) | TYPE_VARINT,
      0x12,
      (1 << 3) | TYPE_VARINT,
      0x81, 0x23,
      (1 << 3) | TYPE_VARINT,
      0x81, 0x82, 0x34,
      (1 << 3) | TYPE_VARINT,
      0x81, 0x82, 0x83, 0x45,
      (1 << 3) | TYPE_VARINT,
      0x81, 0x82, 0x83, 0x84, 0x56,
      (1 << 3) | TYPE_VARINT,
      0x81, 0x82, 0x83, 0x84, 0x85, 0x67,
      (1 << 3) | TYPE_VARINT,
      0x81, 0x82, 0x83, 0x84, 0x85, 0x86, 0x78,
      (1 << 3) | TYPE_VARINT,
      0x81, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x12,
      (1 << 3) | TYPE_VARINT,
      0x81, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x12,
      (1 << 3) | TYPE_VARINT,
      0x81, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x01,
    ], [ FIELD_INT64 ])).toEqual([
      { field: 1, value: 0x12n },
      { field: 1, value: 0x1181n },
      { field: 1, value: 0xd0101n },
      { field: 1, value: 0x8a0c101n },
      { field: 1, value: 0x56080c101n },
      { field: 1, value: 0x3385080c101n },
      { field: 1, value: 0x1e0305080c101n },
      { field: 1, value: 0x241c305080c101n },
      { field: 1, value: 0x12101c305080c101n },
      { field: 1, value: -0x76efe3cfaf7f3effn },
    ]);
  });

  test('int64 overflow', () => {
    expect(() => decode([
      (1 << 3) | TYPE_VARINT,
      0x81, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x03,
    ], [ FIELD_INT64 ])).toThrowError(ERR_VARINT_64BIT_VALUE_OOB);
  });

  test('max uint64', () => {
    expect(decode([
      (1 << 3) | TYPE_VARINT,
      0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01,
    ], [ FIELD_UINT64 ])).toEqual([
      { field: 1, value: 0xffffffff_ffffffffn },
    ]);
  });

  test('min sint64', () => {
    expect(decode([
      (1 << 3) | TYPE_VARINT,
      0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01,
    ], [ FIELD_SINT64 ])).toEqual([
      { field: 1, value: -0x80000000_00000000n },
    ]);
  });

  test('max sint64', () => {
    expect(decode([
      (1 << 3) | TYPE_VARINT,
      0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01,
    ], [ FIELD_SINT64 ])).toEqual([
      { field: 1, value: 0x7fffffff_ffffffffn },
    ]);
  });

  test('sint64', () => {
    expect(decode([
      (1 << 3) | TYPE_VARINT,
      0x12,
    ], [ FIELD_SINT64 ])).toEqual([
      { field: 1, value: 9n },
    ]);
  });

  // TODO(indutny): packed
});

describe('32-bit fixed', () => {
  test('float32', () => {
    expect(decode(new Uint8Array([
      (1 << 3) | TYPE_I32,
      0x00, 0x00, 0x90, 0x3f,
    ]), [ FIELD_FLOAT ])).toEqual([
      { field: 1, value: 1.125 },
    ]);
  });

  // TODO(indutny): packed
});

describe('64-bit fixed', () => {
  test('double', () => {
    expect(decode(new Uint8Array([
      (1 << 3) | TYPE_I64,
      0x8d, 0x97, 0x6e, 0x12, 0x83, 0xc0, 0xf3, 0x3f,
    ]), [ FIELD_DOUBLE ])).toEqual([
      { field: 1, value: 1.2345 },
    ]);
  });

  // TODO(indutny): packed
});
