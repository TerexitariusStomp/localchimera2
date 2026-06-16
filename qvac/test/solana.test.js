/**
 * Unit tests for SolanaMiner.
 * Run: node --test test/solana.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SolanaMiner } from '../src/miners/SolanaMiner.js';

describe('SolanaMiner', () => {
  it('derives deterministic multisig from EVM address', () => {
    const miner = new SolanaMiner({
      network: 'solana', multisigType: 'spl-multisig',
    }, null, '0xa2bCA2e01Fc1631e5577994404C4e3d742b284bf');
    const addr = miner.deriveMultisigAddress(miner.evmAddress);
    assert.ok(typeof addr === 'string');
    assert.ok(addr.length >= 32 && addr.length <= 44, `Address length ${addr.length} not in Solana range`);
    assert.ok(/^[1-9A-HJ-NP-Za-km-z]+$/.test(addr), 'Not valid base58 chars');
  });

  it('multisig is deterministic (same EVM -> same Solana)', () => {
    const evm = '0xa2bCA2e01Fc1631e5577994404C4e3d742b284bf';
    const a = new SolanaMiner({ network: 'solana', multisigType: 'spl-multisig' }, null, evm);
    const b = new SolanaMiner({ network: 'solana', multisigType: 'spl-multisig' }, null, evm);
    assert.equal(a.deriveMultisigAddress(evm), b.deriveMultisigAddress(evm));
  });

  it('validates Solana wallet address', () => {
    const miner = new SolanaMiner({});
    assert.ok(miner.validateWalletAddress('6ovcKVxdNHH1LradUS8T5gmYiYUGQPW8xtPhfp9ZhPXw'));
    assert.ok(!miner.validateWalletAddress('bad'));
    assert.ok(!miner.validateWalletAddress(''));
  });

  it('masks addresses', () => {
    const miner = new SolanaMiner({});
    assert.equal(miner.maskAddress('6ovcKVxdNHH1LradUS8T5gmYiYUGQPW8xtPhfp9ZhPXw'), '6ovcKV...hPXw');
    assert.equal(miner.maskAddress(''), '***');
  });

  it('status reflects multisig mode', () => {
    const miner = new SolanaMiner({ network: 'solana', multisigType: 'spl-multisig' }, null, '0xabc');
    const s = miner.getStatus();
    assert.equal(s.isMultisig, true);
    assert.equal(s.network, 'solana');
    assert.equal(s.stackCompatible, true);
  });
});
