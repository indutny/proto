import { decode as $decode } from './lib/decoder.mjs';

const buf = Buffer.from(
  '080128b88ce6d0c13338034220719c854cb0d4c755127d35142f6e6f549d94b2d6c8a3526957f27cf0bd7fa2fe4a2435636434383766362d313639302d343236622d613532632d64666166333333306135616650be8ce6d0c1335a2437333465343736352d386364382d343063662d396638382d3666656532633832353532396a2437656535643666382d373935322d346233652d386237312d3163656562366536313130337001',
  'hex'
);

const $EMPTY_BYTES = new Uint8Array(0);

const Envelope = {};
const Envelope$SPEC = [
  2081, 0, 0, 0, 34, 0, 33, 512, 1024, 34, 1024, 129, 1024, 129, 1024, 129, 512,
];
Envelope.decode = (data, start, end) => {
  const res = {
    $unknown: [],
    type: null,
    sourceServiceId: '',
    sourceDevice: 0,
    destinationServiceId: '',
    timestamp: 0n,
    content: null,
    serverGuid: '',
    serverTimestamp: 0n,
    ephemeral: false,
    urgent: false,
    updatedPni: '',
    story: false,
    report_spam_token: null,
  };
  $decode(data, Envelope$SPEC, (id, value) => {
    switch (id) {
      case 1:
        res.type = value;
        break;
      case 11:
        res.sourceServiceId = value;
        break;
      case 7:
        res.sourceDevice = value;
        break;
      case 13:
        res.destinationServiceId = value;
        break;
      case 5:
        res.timestamp = value;
        break;
      case 8:
        res.content = value;
        break;
      case 9:
        res.serverGuid = value;
        break;
      case 10:
        res.serverTimestamp = value;
        break;
      case 12:
        res.ephemeral = value;
        break;
      case 14:
        res.urgent = value;
        break;
      case 15:
        res.updatedPni = value;
        break;
      case 16:
        res.story = value;
        break;
      case 17:
        res.report_spam_token = value;
        break;
      default:
        res.$unknown.push(value);
        break;
    }
  });
  if (res.content === null) {
    res.content = $EMPTY_BYTES;
  }
  if (res.report_spam_token === null) {
    res.report_spam_token = $EMPTY_BYTES;
  }
  return res;
};

console.time('decode');
for (let i = 0; i < 2e6; i++) {
  Envelope.decode(buf);
}
console.timeEnd('decode');

console.log(Envelope.decode(buf));
