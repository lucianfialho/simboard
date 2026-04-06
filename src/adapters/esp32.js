import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { BoardAdapter } from './base.js';

const BIN_DIR = join(homedir(), '.simboard', 'bin');
const QEMU_BIN = join(BIN_DIR, 'qemu', 'bin', 'qemu-system-xtensa');

async function getFreePort() {
  const { createServer } = await import('node:net');
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

export class Esp32Adapter extends BoardAdapter {
  #qemu = null;
  #uart0Socket = null;
  #uart1Socket = null;
  #uart1Queue = [];
  #serialCallback = null;
  #uart0Port = null;
  #uart1Port = null;
  #binaryPath = null;
  #buffer = '';

  async load(binaryPath) {
    this.#binaryPath = binaryPath;
    this.#uart0Port = await getFreePort();
    this.#uart1Port = await getFreePort();
  }

  start() {
    // Launch QEMU with two serial ports via TCP
    this.#qemu = spawn(QEMU_BIN, [
      '-nographic',
      '-machine', 'esp32',
      '-serial', `tcp:127.0.0.1:${this.#uart0Port},server=on,wait=off`,
      '-serial', `tcp:127.0.0.1:${this.#uart1Port},server=on,wait=off`,
      '-drive', `file=${this.#binaryPath},if=mtd,format=raw`,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });

    this.#qemu.stderr.on('data', (data) => {
      if (process.env.DEBUG) process.stderr.write(data);
    });

    // Connect to UART0 for serial output after QEMU starts
    setTimeout(() => this.#connectUart0(), 500);
    // Delay UART1 connect until firmware has booted and stabilized.
    // QEMU fires a UART1 interrupt when TCP client first connects; if it
    // arrives before Serial1.begin() finishes the first run crashes with WDT.
    // 5 s gives the firmware time to complete its first boot cycle.
    setTimeout(() => this.#connectUart1(), 5000);
  }

  #connectUart0(attempt = 0) {
    this.#uart0Socket = createConnection(this.#uart0Port, '127.0.0.1');
    this.#uart0Socket.on('connect', () => {
      // connected — set up data handler
      this.#uart0Socket.on('data', (data) => {
        const text = data.toString('utf-8');
        this.#buffer += text;
        const lines = this.#buffer.split('\n');
        this.#buffer = lines.pop();
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          process.stdout.write(trimmed + '\n');
          if (this.#serialCallback) this.#serialCallback(trimmed);
        }
      });
    });
    this.#uart0Socket.on('error', (err) => {
      if (err.code === 'ECONNREFUSED' && attempt < 10) {
        setTimeout(() => this.#connectUart0(attempt + 1), 500);
      } else if (process.env.DEBUG) {
        process.stderr.write(`[UART0] socket error: ${err.message}\n`);
      }
    });
  }

  #connectUart1(attempt = 0) {
    const sock = createConnection(this.#uart1Port, '127.0.0.1');
    this.#uart1Socket = sock;
    sock.on('connect', () => {
      // Flush any commands queued before the socket was ready
      for (const msg of this.#uart1Queue) sock.write(msg);
      this.#uart1Queue = [];
    });
    sock.on('error', (err) => {
      if (err.code === 'ECONNREFUSED' && attempt < 10) {
        this.#uart1Socket = null;
        setTimeout(() => this.#connectUart1(attempt + 1), 500);
      } else if (process.env.DEBUG) {
        process.stderr.write(`[UART1] socket error: ${err.message}\n`);
      }
    });
  }

  onSerial(callback) {
    this.#serialCallback = callback;
  }

  setPin(pin, mode, value) {
    const val = mode === 'adc' ? value : (mode === 'high' ? 1 : 0);
    const msg = `SET ${pin} ${val}\n`;
    if (!this.#uart1Socket) {
      // Socket not yet connected — queue for when it connects
      this.#uart1Queue.push(msg);
      return;
    }
    this.#uart1Socket.write(msg);
  }

  stop() {
    if (this.#uart0Socket) { this.#uart0Socket.destroy(); this.#uart0Socket = null; }
    if (this.#uart1Socket) { this.#uart1Socket.destroy(); this.#uart1Socket = null; }
    if (this.#qemu) { this.#qemu.kill('SIGTERM'); this.#qemu = null; }
  }
}
