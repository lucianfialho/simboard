import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { BOARDS } from './adapters/base.js';
import { compileSketch } from './compiler.js';
import { ensureToolchain } from './installer.js';
import { parseCommand } from './stdin-parser.js';

async function loadAdapter(adapterName) {
  if (adapterName === 'avr') {
    const { AvrAdapter } = await import('./adapters/avr.js');
    return new AvrAdapter();
  }
  if (adapterName === 'esp32') {
    const { Esp32Adapter } = await import('./adapters/esp32.js');
    return new Esp32Adapter();
  }
  throw new Error(`Unknown adapter: ${adapterName}`);
}

export async function compile(sketchPath, boardFlag) {
  const board = BOARDS[boardFlag];
  if (!board) {
    const valid = Object.keys(BOARDS).join(', ');
    throw new Error(`Unknown board "${boardFlag}". Valid boards: ${valid}`);
  }

  await ensureToolchain(board.adapter);
  return compileSketch(resolve(sketchPath), board.fqbn, board.binaryExt);
}

export async function run(sketchPath, boardFlag) {
  const board = BOARDS[boardFlag];
  if (!board) {
    const valid = Object.keys(BOARDS).join(', ');
    console.error(`Unknown board "${boardFlag}". Valid boards: ${valid}`);
    process.exit(1);
  }

  await ensureToolchain(board.adapter);

  let binaryPath;
  try {
    binaryPath = await compileSketch(resolve(sketchPath), board.fqbn, board.binaryExt);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const adapter = await loadAdapter(board.adapter);
  await adapter.load(binaryPath);
  adapter.start();

  // Bridge stdin → adapter.setPin()
  const rl = createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    const cmd = parseCommand(line);
    if (!cmd) return;
    if (cmd.type === 'exit') {
      adapter.stop();
      process.exit(0);
    }
    if (cmd.type === 'pin') {
      adapter.setPin(cmd.pin, cmd.mode, cmd.value);
    }
  });

  // Clean exit on SIGINT (Ctrl+C)
  process.on('SIGINT', () => {
    adapter.stop();
    process.exit(0);
  });
}
