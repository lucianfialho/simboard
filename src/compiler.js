import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, basename } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { mkdtemp, rm, readdir, copyFile } from 'node:fs/promises';

const execFileAsync = promisify(execFile);

/**
 * Returns the path to the arduino-cli binary managed by simboard.
 * Installed to ~/.simboard/bin/ by the installer.
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
 * @param {string} sketchPath - path to the sketch directory or .ino file
 * @param {string} fqbn - e.g. "arduino:avr:uno"
 * @param {string} binaryExt - "hex" or "bin"
 * @returns {Promise<string>} path to compiled binary
 */
export async function compileSketch(sketchPath, fqbn, binaryExt) {
  const arduinoCli = resolveArduinoCli();
  const buildDir = await mkdtemp(join(tmpdir(), 'simboard-build-'));

  try {
    let combinedOutput = '';
    try {
      const { stdout, stderr } = await execFileAsync(arduinoCli, [
        'compile',
        '--fqbn', fqbn,
        '--build-path', buildDir,
        '--verbose',
        sketchPath,
      ]);
      combinedOutput = stdout + stderr;
    } catch (err) {
      // execFile throws on non-zero exit — include stdout/stderr in the error
      combinedOutput = (err.stdout || '') + (err.stderr || '');
      throw Object.assign(new Error(`Compilation failed: ${err.message}`), {
        stdout: err.stdout,
        stderr: err.stderr,
        code: err.code,
      });
    }

    // Find the binary in the build dir
    let binaryInBuildDir = parseBuildOutput(combinedOutput, binaryExt);
    if (!binaryInBuildDir) {
      const files = await readdir(buildDir);
      const match = files.find(f => f.endsWith(`.${binaryExt}`));
      if (match) binaryInBuildDir = join(buildDir, match);
    }

    if (!binaryInBuildDir) {
      throw new Error(`Compilation succeeded but binary not found.\n${combinedOutput}`);
    }

    // Copy binary out of temp build dir so we can clean up the build dir
    const outFile = join(tmpdir(), `simboard-${basename(binaryInBuildDir)}`);
    await copyFile(binaryInBuildDir, outFile);
    return outFile;
  } finally {
    // Always clean up the build dir
    await rm(buildDir, { recursive: true, force: true });
  }
}
