import sdk from 'casper-js-sdk';
import { readFileSync } from 'fs';

console.log('SDK loaded:', !!sdk);
console.log('PrivateKey:', typeof sdk.PrivateKey);
console.log('KeyAlgorithm:', typeof sdk.KeyAlgorithm);

const pem = readFileSync('/tmp/casper-keys/Account 1_secret_key.pem', 'utf-8');
const key = sdk.PrivateKey.fromPem(pem, sdk.KeyAlgorithm.SECP256K1);
console.log('Account:', key.publicKey.accountHash().toPrefixedString());
