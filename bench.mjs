import { signalservice } from './protos.mjs';
import { encode } from './lib/index.mjs';

const { Envelope } = signalservice;

const buf = Buffer.from(
  '080128b88ce6d0c13338034220719c854cb0d4c755127d35142f6e6f549d94b2d6c8a3526957f27cf0bd7fa2fe4a2435636434383766362d313639302d343236622d613532632d64666166333333306135616650be8ce6d0c1335a2437333465343736352d386364382d343063662d396638382d3666656532633832353532396a2437656535643666382d373935322d346233652d386237312d3163656562366536313130337001',
  'hex'
);

console.log(Envelope.decode(buf));

const toEncode = {
  type: 1,
  sourceServiceId: '734e4765-8cd8-40cf-9f88-6fee2c825529',
  sourceDeviceId: 3,
  destinationServiceId: '7ee5d6f8-7952-4b3e-8b71-1ceeb6e61103',
  clientTimestamp: 1769964406328n,
  content: Envelope.decode(buf).content,
  serverGuid: '5cd487f6-1690-426b-a52c-dfaf3330a5af',
  serverTimestamp: 1769964406334n,
};
const fields = Envelope.toFields(toEncode);
console.log(Envelope.encode(toEncode).length);

export default function() {
  return Envelope.encode(toEncode).length;
}
