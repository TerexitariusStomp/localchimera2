import SEAL from 'node-seal';

export interface FHEKeyBundle {
  publicKey: string;
  secretKey: string;
  relinKeys: string;
  galoisKeys: string;
}

export class FHEContext {
  seal: Awaited<ReturnType<typeof SEAL>>;
  context: any;
  encoder: any;
  keygen: any;
  publicKey: any;
  secretKey: any;
  relinKeys: any;
  galoisKeys: any;
  encryptor: any;
  decryptor: any;
  evaluator: any;

  private constructor(seal: any) {
    this.seal = seal;
  }

  static async create(): Promise<FHEContext> {
    const seal = await SEAL();
    const scheme = seal.SchemeType.bfv;
    const security = seal.SecLevelType.tc128;
    const polyModulusDegree = 4096;

    const parms = new seal.EncryptionParameters(scheme);
    parms.setPolyModulusDegree(polyModulusDegree);
    parms.setCoeffModulus(seal.CoeffModulus.BFVDefault(polyModulusDegree, security));
    parms.setPlainModulus(seal.PlainModulus.Batching(polyModulusDegree, 20));

    const context = new seal.SEALContext(parms, true, security);
    if (!context.parametersSet()) {
      throw new Error('FHE parameters not set');
    }

    const ctx = new FHEContext(seal);
    ctx.context = context;
    ctx.encoder = new seal.BatchEncoder(context);
    ctx.keygen = new seal.KeyGenerator(context);
    ctx.publicKey = ctx.keygen.createPublicKey();
    ctx.secretKey = ctx.keygen.secretKey();
    ctx.relinKeys = ctx.keygen.createRelinKeys();
    ctx.galoisKeys = ctx.keygen.createGaloisKeys();
    ctx.encryptor = new seal.Encryptor(context, ctx.publicKey);
    ctx.decryptor = new seal.Decryptor(context, ctx.secretKey);
    ctx.evaluator = new seal.Evaluator(context);
    return ctx;
  }

  slotCount(): number {
    return this.encoder.slotCount();
  }

  encodeString(text: string, maxSlots = this.slotCount()): BigInt64Array {
    const arr = new BigInt64Array(maxSlots);
    const len = Math.min(text.length, maxSlots);
    for (let i = 0; i < len; i++) {
      arr[i] = BigInt(text.charCodeAt(i));
    }
    return arr;
  }

  decodeString(arr: BigInt64Array): string {
    let end = arr.length;
    while (end > 0 && arr[end - 1] === 0n) end--;
    const nums = Array.from(arr.slice(0, end)).map((n) => Number(n));
    return String.fromCharCode(...nums);
  }

  encryptString(text: string): string {
    const data = this.encodeString(text);
    const plain = new this.seal.Plaintext();
    this.encoder.encode(data, plain);
    const cipher = new this.seal.Ciphertext();
    this.encryptor.encrypt(plain, cipher);
    return cipher.saveToBase64(this.seal.ComprModeType.zstd);
  }

  decryptString(cipherBase64: string): string {
    const cipher = new this.seal.Ciphertext();
    cipher.loadFromBase64(this.context, cipherBase64);
    const plain = new this.seal.Plaintext();
    this.decryptor.decrypt(cipher, plain);
    const decoded = this.encoder.decodeBigInt64(plain) as BigInt64Array;
    return this.decodeString(decoded);
  }

  exportKeys(): FHEKeyBundle {
    return {
      publicKey: this.publicKey.saveToBase64(this.seal.ComprModeType.zstd),
      secretKey: this.secretKey.saveToBase64(this.seal.ComprModeType.zstd),
      relinKeys: this.relinKeys.saveToBase64(this.seal.ComprModeType.zstd),
      galoisKeys: this.galoisKeys.saveToBase64(this.seal.ComprModeType.zstd),
    };
  }

  importPublicKey(base64: string): void {
    this.publicKey.loadFromBase64(this.context, base64);
    this.encryptor = new this.seal.Encryptor(this.context, this.publicKey);
  }

  importRelinKeys(base64: string): void {
    this.relinKeys.loadFromBase64(this.context, base64);
  }

  importGaloisKeys(base64: string): void {
    this.galoisKeys.loadFromBase64(this.context, base64);
  }

  homomorphicShift(cipherBase64: string, shift: number): string {
    const cipher = new this.seal.Ciphertext();
    cipher.loadFromBase64(this.context, cipherBase64);
    const shiftPlain = new this.seal.Plaintext();
    const shiftArr = new BigInt64Array(this.slotCount());
    shiftArr.fill(BigInt(shift) & 0xffffn);
    this.encoder.encode(shiftArr, shiftPlain);
    this.evaluator.addPlainInplace(cipher, shiftPlain);
    return cipher.saveToBase64(this.seal.ComprModeType.zstd);
  }

  runCircuit(cipherBase64: string, circuit: string): string {
    if (circuit === 'identity') return cipherBase64;
    if (circuit.startsWith('shift:')) {
      const shift = parseInt(circuit.split(':')[1], 10);
      if (Number.isNaN(shift)) throw new Error(`Invalid shift circuit: ${circuit}`);
      return this.homomorphicShift(cipherBase64, shift);
    }
    throw new Error(`Unsupported FHE circuit: ${circuit}`);
  }

  static async fromKeys(keys: FHEKeyBundle): Promise<FHEContext> {
    const ctx = await FHEContext.create();
    ctx.importPublicKey(keys.publicKey);
    ctx.importRelinKeys(keys.relinKeys);
    ctx.importGaloisKeys(keys.galoisKeys);
    return ctx;
  }
}

export default FHEContext;
