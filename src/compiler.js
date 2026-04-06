import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);

/**
 * Returns the path to the arduino-cli binary.
 * Prefers ~/.simboard/bin/arduino-cli, falls back to system PATH.
 */
export function resolveArduinoCli() {
  return join(homedir(), '.simboard', 'bin', 'arduino-cli');
}

/**
 * Extracts the binary path from arduino-cli verbose build output.
 * arduino-cli prints the full path to the output file in its output.
 */
export function parseBuildOutput(output, ext) {
  const lines = output.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.endsWith(`.${ext}`)) {
      return trimmed;
    }
  }
  return null;
}

/**
 * Compiles a sketch for the given FQBN.
 * Returns the path to the compiled binary.
 *
 * @param {string} sketchPath - absolute path to the .ino file
 * @param {string} fqbn - e.g. "arduino:avr:uno"
 * @param {string} binaryExt - "hex" or "bin"
 * @returns {Promise<string>} path to compiled binary
 */
export async function compileSketch(sketchPath, fqbn, binaryExt) {
  const arduinoCli = resolveArduinoCli();
  const buildDir = await mkdtemp(join(tmpdir(), 'simboard-build-'));

  try {
    const { stdout, stderr } = await execFileAsync(arduinoCli, [
      'compile',
      '--fqbn', fqbn,
      '--build-path', buildDir,
      '--verbose',
      sketchPath,
    ]);

    const combined = stdout + stderr;
    const binaryPath = parseBuildOutput(combined, binaryExt);

    if (!binaryPath) {
      // Try to find the binary in the build directory directly
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(buildDir);
      const binary = files.find(f => f.endsWith(`.${binaryExt}`));
      if (binary) return join(buildDir, binary);
      throw new Error(`Compilation succeeded but binary not found.\n${combined}`);
    }

    return binaryPath;
  } catch (err) {
    await rm(buildDir, { recursive: true, force: true });
    throw new Error(`Compilation failed: ${err.message}`);
  }
}
