import { parse } from './lib/index.mjs';

const buf = Buffer.from(
  '0a03474554120b2f76312f6d6573736167651a0568656c6c6f207b2a0e636f6e74656e742d6c656e6774682a04313032342a0c636f6e74656e742d747970652a0870726f746f627566',
  'hex',
);

console.time('parse');
for (let i = 0; i < 2e6; i++) {
  parse(buf);
}
console.timeEnd('parse');

console.log(parse(buf));
