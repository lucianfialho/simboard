import { readFile } from 'node:fs/promises';
import { BoardAdapter } from './base.js';

let _avr8js = null;
async function loadAvr8js() {
  if (!_avr8js) _avr8js = await import('avr8js');
  return _avr8js;
}

function parseHexFile(hexContent) {
  const lines = hexContent.split('\n').filter(l => l.trim().startsWith(':'));
  const data = new Uint8Array(0x8000); // 32KB flash for Uno
  for (const line of lines) {
    const byteCount = parseInt(line.slice(1, 3), 16);
    const address = parseInt(line.slice(3, 7), 16);
    const type = parseInt(line.slice(7, 9), 16);
    if (type !== 0) continue; // only data records
    for (let i = 0; i < byteCount; i++) {
      data[address + i] = parseInt(line.slice(9 + i * 2, 11 + i * 2), 16);
    }
  }
  return data;
}

export class AvrAdapter extends BoardAdapter {
  #cpu = null;
  #usart = null;
  #timer0 = null;
  #avrInstruction = null;
  #serialCallback = null;
  #running = false;
  #buffer = '';
  #loopHandle = null;

  async load(hexPath) {
    const { CPU, AVRUSART, usart0Config, AVRTimer, timer0Config, avrInstruction } = await loadAvr8js();

    const hexContent = await readFile(hexPath, 'utf-8');
    const program = parseHexFile(hexContent);

    // CPU expects Uint16Array for program memory
    const progUint16 = new Uint16Array(program.buffer);
    this.#cpu = new CPU(progUint16);
    this.#avrInstruction = avrInstruction;

    // Timer0 is required for delay() / millis() to work in Arduino firmware.
    // Without it the first delay() call loops forever waiting for timer ticks.
    this.#timer0 = new AVRTimer(this.#cpu, timer0Config);

    // USART0 at 16MHz clock
    this.#usart = new AVRUSART(this.#cpu, usart0Config, 16e6);
    this.#usart.onByteTransmit = (byte) => {
      const char = String.fromCharCode(byte);
      this.#buffer += char;
      if (char === '\n') {
        const line = this.#buffer.trim();
        if (line) {
          process.stdout.write(line + '\n');
          if (this.#serialCallback) {
            this.#serialCallback(line);
          }
        }
        this.#buffer = '';
      }
    };
  }

  start() {
    if (!this.#cpu || !this.#avrInstruction) {
      throw new Error('AvrAdapter: must call load() before start()');
    }
    this.#running = true;

    // Run the simulation loop. We use a synchronous tight loop to achieve
    // real-time simulation speed (~16MHz). We yield via setImmediate every
    // 500k cycles so the Node.js event loop can process I/O (serial callbacks,
    // interval checks in tests, etc.).
    // At 16MHz, 500k cycles ≈ 31ms of simulated time per chunk.
    // To simulate 300ms (3 × 100ms delays), we need ≈10 chunks.
    // We use a larger chunk (2M cycles ≈ 125ms) for faster throughput.
    const CYCLES_PER_CHUNK = 2_000_000;
    const runChunk = () => {
      if (!this.#running) return;
      const cpu = this.#cpu;
      const avrInstruction = this.#avrInstruction;
      let cycles = 0;
      while (cycles < CYCLES_PER_CHUNK && this.#running) {
        avrInstruction(cpu);
        cpu.tick();
        cycles++;
      }
      this.#loopHandle = setImmediate(runChunk);
    };

    this.#loopHandle = setImmediate(runChunk);
  }

  onSerial(callback) {
    this.#serialCallback = callback;
  }

  setPin(pin, mode, value) {
    if (mode === 'adc' && this.#cpu) {
      this.#cpu.data[0x24] = value & 0xff;        // ADCL
      this.#cpu.data[0x25] = (value >> 8) & 0x03; // ADCH
    }
  }

  stop() {
    this.#running = false;
    if (this.#loopHandle) {
      clearImmediate(this.#loopHandle);
      this.#loopHandle = null;
    }
  }
}
