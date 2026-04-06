import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('resolveArduinoCli', () => {
  test('returns path to arduino-cli in ~/.simboard/bin if it exists', async () => {
    const { resolveArduinoCli } = await import('../src/compiler.js');
    // This test just verifies the function returns a string path
    const result = resolveArduinoCli();
    assert.equal(typeof result, 'string');
    assert.ok(result.includes('arduino-cli'));
  });
});

describe('parseBuildOutput', () => {
  test('extracts binary path from arduino-cli output', async () => {
    const { parseBuildOutput } = await import('../src/compiler.js');
    const output = `
Sketch uses 928 bytes of program storage space.
/tmp/arduino-build-1234/sketch.ino.hex
`;
    const result = parseBuildOutput(output, 'hex');
    assert.ok(result.endsWith('.hex'));
  });

  test('returns null if no binary found', async () => {
    const { parseBuildOutput } = await import('../src/compiler.js');
    const result = parseBuildOutput('some error output', 'hex');
    assert.equal(result, null);
  });
});
