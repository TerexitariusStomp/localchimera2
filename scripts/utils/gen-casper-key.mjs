import { writeFileSync, mkdirSync } from 'fs';
import sdk from 'casper-js-sdk';

const KEY_DIR = process.env.CASPER_KEY_DIR || '/tmp/casper-wallet';
mkdirSync(KEY_DIR, { recursive: true });

const algo = sdk.KeyAlgorithm.SECP256K1;
const privateKey = sdk.PrivateKey.generate(algo);
const publicKey = privateKey.publicKey;

const accountHash = publicKey.accountHash().toPrefixedString();
const publicKeyHex = publicKey.toHex();

const secretPem = privateKey.toPem();
const publicPem = publicKey.toPem();

const secretPath = `${KEY_DIR}/casper_secret_key.pem`;
const publicPath = `${KEY_DIR}/casper_public_key.pem`;

writeFileSync(secretPath, secretPem);
writeFileSync(publicPath, publicPem);

console.log('New Casper key generated:');
console.log('  Account hash:', accountHash);
console.log('  Public key:', publicKeyHex);
console.log('  Secret PEM:', secretPath);
console.log('  Public PEM:', publicPath);
