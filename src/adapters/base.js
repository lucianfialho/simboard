export class BoardAdapter {
  async load(binaryPath) { throw new Error('Not implemented'); }
  start() { throw new Error('Not implemented'); }
  onSerial(callback) { throw new Error('Not implemented'); }
  setPin(pin, type, value) { throw new Error('Not implemented'); }
  stop() { throw new Error('Not implemented'); }
}

// Board registry: flag → { fqbn, adapter, binaryExt }
export const BOARDS = {
  uno:   { fqbn: 'arduino:avr:uno',   adapter: 'avr',   binaryExt: 'hex' },
  nano:  { fqbn: 'arduino:avr:nano',  adapter: 'avr',   binaryExt: 'hex' },
  mega:  { fqbn: 'arduino:avr:mega',  adapter: 'avr',   binaryExt: 'hex' },
  esp32: { fqbn: 'esp32:esp32:esp32:FlashMode=dout', adapter: 'esp32', binaryExt: 'ino.bin' },
};
