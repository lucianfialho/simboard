import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BLINK_INO = join(__dirname, 'fixtures', 'blink', 'blink.ino');

describe('AVR adapter integration', () => {
  test('runs blink sketch and captures serial output', { timeout: 60000 }, async () => {
    const { AvrAdapter } = await import('../src/adapters/avr.js');
    const { compileSketch } = await import('../src/compiler.js');
    const { ensureToolchain } = await import('../src/installer.js');

    await ensureToolchain('avr');

    const binaryPath = await compileSketch(BLINK_INO, 'arduino:avr:uno', 'hex');
    const adapter = new AvrAdapter();
    await adapter.load(binaryPath);

    const lines = [];
    adapter.onSerial(line => lines.push(line));
    adapter.start();

    // Wait for 3 serial lines
    await new Promise((resolve) => {
      const check = setInterval(() => {
        if (lines.length >= 3) {
          clearInterval(check);
          resolve();
        }
      }, 100);
    });

    adapter.stop();

    assert.ok(lines.length >= 3, `Expected ≥3 lines, got ${lines.length}`);
    assert.ok(lines.every(l => l.includes('TICK')), `Expected all lines to contain TICK, got: ${lines}`);
  });
});
