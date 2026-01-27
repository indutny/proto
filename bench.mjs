import {
  parse,
  FIELD_HOLE,
  FIELD_STRING,
  FIELD_BYTES,
  FIELD_UINT64,
} from './lib/index.mjs';

const buf = Buffer.from(
  '0a03474554120b2f76312f6d6573736167651a0568656c6c6f207b2a0e636f6e74656e742d6c656e6774682a04313032342a0c636f6e74656e742d747970652a0870726f746f627566',
  'hex',
);

const MESSAGE_SPEC = [
  FIELD_HOLE, // 0
  FIELD_STRING, // 1 - verb
  FIELD_STRING, // 2 - path
  FIELD_BYTES, // 3 - body
  FIELD_UINT64, // 4 - id
  FIELD_STRING, // 5 - headers
];

console.time('parse');
for (let i = 0; i < 2e6; i++) {
  parse(buf, MESSAGE_SPEC);
}
console.timeEnd('parse');

console.log(parse(buf, MESSAGE_SPEC));
