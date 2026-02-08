import { expect, test, describe } from 'vitest';
import { encode } from './encoder.mjs';
import {
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
  FIELD_MESSAGE,
  FIELD_UNKNOWN,
} from './constants.mjs';

function harness(fields, expected) {
  expect(encode(fields)).toEqual(new Uint8Array(expected));
}

describe('32-bit integers', () => {
  test('max uint32', () => {
    harness(
      [{ id: 1, field: FIELD_INT32, value: 0xffff_ffff }],
      [(1 << 3) | TYPE_VARINT, 0xff, 0xff, 0xff, 0xff, 0x0f]
    );
  });

  test('int32', () => {
    harness(
      [
        { id: 1, field: FIELD_INT32, value: 0x12 },
        { id: 1, field: FIELD_INT32, value: 0x1181 },
        { id: 1, field: FIELD_INT32, value: 0xd0101 },
        { id: 1, field: FIELD_INT32, value: 0x8a0c101 },
        { id: 1, field: FIELD_INT32, value: 0x7080c101 },
      ],
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
      ]
    );
  });

  // TODO(indutny): packed
});

describe('64-bit integers', () => {
  test('max uint64', () => {
    harness(
      [{ id: 1, field: FIELD_INT64, value: 0xffff_ffff_ffff_ffffn }],
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
      ]
    );
  });

  test('int64', () => {
    harness(
      [
        { id: 1, field: FIELD_INT64, value: 0x12n },
        { id: 1, field: FIELD_INT64, value: 0x1181n },
        { id: 1, field: FIELD_INT64, value: 0xd0101n },
        { id: 1, field: FIELD_INT64, value: 0x8a0c101n },
        { id: 1, field: FIELD_INT64, value: 0x56080c101n },
        { id: 1, field: FIELD_INT64, value: 0x3385080c101n },
        { id: 1, field: FIELD_INT64, value: 0x1e0305080c101n },
        { id: 1, field: FIELD_INT64, value: 0x241c305080c101n },
        { id: 1, field: FIELD_INT64, value: 0x12101c305080c101n },
        { id: 1, field: FIELD_INT64, value: -0x76efe3cfaf7f3effn },
      ],
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
      ]
    );
  });

  // TODO(indutny): packed
});

describe('len', () => {
  test('string', () => {
    harness(
      [{ id: 1, field: FIELD_STRING, value: 'proto' }],
      [(1 << 3) | TYPE_LEN, 0x05, 0x70, 0x72, 0x6f, 0x74, 0x6f]
    );
  });

  test('large string', () => {
    harness(
      [{ id: 1, field: FIELD_STRING, value: 'p'.repeat(129) }],
      [
        (1 << 3) | TYPE_LEN,
        0x81,
        0x01,
        ...new TextEncoder().encode('p'.repeat(129)),
      ]
    );
  });

  test('bytes', () => {
    harness(
      [
        {
          id: 1,
          field: FIELD_BYTES,
          value: new Uint8Array([0x70, 0x72, 0x6f, 0x74, 0x6f]),
        },
      ],
      [(1 << 3) | TYPE_LEN, 0x05, 0x70, 0x72, 0x6f, 0x74, 0x6f]
    );
  });

  test('large bytes', () => {
    const value = new TextEncoder().encode('p'.repeat(129));
    harness(
      [{ id: 1, field: FIELD_BYTES, value }],
      [(1 << 3) | TYPE_LEN, 0x81, 0x01, ...value]
    );
  });

  test('message', () => {
    harness(
      [
        {
          id: 1,
          field: FIELD_MESSAGE,
          value: [{ id: 3, field: FIELD_STRING, value: 'hey' }],
        },
      ],
      [(1 << 3) | TYPE_LEN, 5, (3 << 3) | TYPE_LEN, 3, 0x68, 0x65, 0x79]
    );
  });
});

test('unknown field', () => {
  harness(
    [
      {
        id: 0,
        field: FIELD_UNKNOWN,
        value: new Uint8Array([1, 2, 3]),
      },
    ],
    [1, 2, 3]
  );
});

// TODO(indutny): i32
// TODO(indutny): i64
// TODO(indutny): multiple
