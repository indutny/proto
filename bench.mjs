import {
  decode,
  FIELD_HOLE,
  FIELD_STRING,
  FIELD_BYTES,
  FIELD_UINT64,
} from './lib/decoder.mjs';

const buf = Buffer.from(
  '0a03474554120b2f76312f6d6573736167651a0568656c6c6f207b2a0e636f6e74656e742d6c656e6774682a04313032342a0c636f6e74656e742d747970652a0870726f746f627566',
  'hex',
);

const MESSAGE_SPEC = [
  FIELD_STRING, // 1 - verb
  FIELD_STRING, // 2 - path
  FIELD_BYTES, // 3 - body
  FIELD_UINT64, // 4 - id
  FIELD_STRING, // 5 - headers
];

function decodeMessage(buf) {
  const fields = decode(buf, MESSAGE_SPEC);

  const res = {
    verb: null,
    path: null,
    body: null,
    id: null,
    headers: [],
  };

  for (const { field, value } of fields) {
    switch (field) {
      case 1:
        res.verb = value;
        break;
      case 2:
        res.path = value;
        break;
      case 3:
        res.body = value;
        break;
      case 4:
        res.id = value;
        break;
      case 5:
        res.headers.push(value);
        break;
    }
  }
  return res;
}

console.time('decode');
for (let i = 0; i < 2e6; i++) {
  decodeMessage(buf);
}
console.timeEnd('decode');

console.log(decodeMessage(buf));
