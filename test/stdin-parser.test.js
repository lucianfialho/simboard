import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from '../src/stdin-parser.js';

describe('parseCommand', () => {
  test('parses pin adc command', () => {
    const result = parseCommand('pin 34 adc 512');
    assert.deepEqual(result, { type: 'pin', pin: 34, mode: 'adc', value: 512 });
  });

  test('parses pin high command', () => {
    const result = parseCommand('pin 13 high');
    assert.deepEqual(result, { type: 'pin', pin: 13, mode: 'high', value: null });
  });

  test('parses pin low command', () => {
    const result = parseCommand('pin 13 low');
    assert.deepEqual(result, { type: 'pin', pin: 13, mode: 'low', value: null });
  });

  test('parses exit command', () => {
    const result = parseCommand('exit');
    assert.deepEqual(result, { type: 'exit' });
  });

  test('returns null for unknown command', () => {
    const result = parseCommand('foo bar');
    assert.equal(result, null);
  });

  test('returns null for empty string', () => {
    const result = parseCommand('');
    assert.equal(result, null);
  });

  test('trims whitespace', () => {
    const result = parseCommand('  pin 34 adc 512  ');
    assert.deepEqual(result, { type: 'pin', pin: 34, mode: 'adc', value: 512 });
  });

  test('ADC value must be 0-4095', () => {
    assert.equal(parseCommand('pin 34 adc 5000'), null);
    assert.equal(parseCommand('pin 34 adc -1'), null);
  });

  test('ADC boundary values are valid', () => {
    assert.deepEqual(parseCommand('pin 34 adc 0'), { type: 'pin', pin: 34, mode: 'adc', value: 0 });
    assert.deepEqual(parseCommand('pin 34 adc 4095'), { type: 'pin', pin: 34, mode: 'adc', value: 4095 });
  });

  test('returns null for adc with missing value', () => {
    assert.equal(parseCommand('pin 34 adc'), null);
  });

  test('returns null for negative pin number', () => {
    assert.equal(parseCommand('pin -5 high'), null);
  });
});
