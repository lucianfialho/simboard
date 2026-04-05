/**
 * Parses a stdin command line into a structured command object.
 * Returns null for invalid or unknown commands.
 *
 * Valid commands:
 *   pin <n> adc <0-4095>
 *   pin <n> high
 *   pin <n> low
 *   exit
 */
export function parseCommand(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(/\s+/);

  if (parts[0] === 'exit') {
    return { type: 'exit' };
  }

  if (parts[0] === 'pin' && parts.length >= 3) {
    const pin = parseInt(parts[1], 10);
    const mode = parts[2].toLowerCase();

    if (isNaN(pin)) return null;

    if (mode === 'high' || mode === 'low') {
      return { type: 'pin', pin, mode, value: null };
    }

    if (mode === 'adc' && parts.length === 4) {
      const value = parseInt(parts[3], 10);
      if (isNaN(value) || value < 0 || value > 4095) return null;
      return { type: 'pin', pin, mode: 'adc', value };
    }
  }

  return null;
}
