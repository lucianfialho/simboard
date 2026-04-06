import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, basename } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { mkdtemp, rm, readdir, copyFile, realpath, readFile, writeFile } from 'node:fs/promises';

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
    // Match lines that are a standalone file path (no spaces, starts with /)
    // or extract the last token from lines ending with the extension.
    if (trimmed.endsWith(`.${ext}`)) {
      // If the line has spaces it's a command; extract the last token (the output file).
      if (trimmed.includes(' ')) {
        const tokens = trimmed.split(/\s+/);
        const candidate = tokens[tokens.length - 1];
        if (candidate.startsWith('/') && candidate.endsWith(`.${ext}`)) {
          return candidate;
        }
      } else if (trimmed.startsWith('/')) {
        return trimmed;
      }
    }
  }
  return null;
}

/**
 * For ESP32: merge bootloader + partitions + app into a 4MB flash image
 * that QEMU can boot directly with -drive file=...,if=mtd,format=raw
 */
async function mergeEsp32Flash(buildDir, appBinPath) {
  const base = basename(appBinPath, '.bin'); // e.g. "esp32-hello.ino"
  const bootloaderBin = join(buildDir, `${base}.bootloader.bin`);
  const partitionsBin = join(buildDir, `${base}.partitions.bin`);

  const FLASH_SIZE = 4 * 1024 * 1024; // 4MB

  // Build a 4MB buffer filled with 0xFF (erased flash state)
  const flash = Buffer.alloc(FLASH_SIZE, 0xff);

  // Write each region at its fixed offset
  // Offsets match default ESP32 partition layout:
  //   0x1000  — bootloader
  //   0x8000  — partition table
  //   0x10000 — application
  const regions = [
    { path: bootloaderBin, offset: 0x1000 },
    { path: partitionsBin, offset: 0x8000 },
    { path: appBinPath,    offset: 0x10000 },
  ];

  for (const { path, offset } of regions) {
    const data = await readFile(path);
    data.copy(flash, offset);
  }

  const outPath = join(tmpdir(), `simboard-${base}.flash4mb.bin`);
  await writeFile(outPath, flash);
  return outPath;
}

/**
 * Compiles a sketch for the given FQBN.
 * Returns the path to the compiled binary.
 *
 * @param {string} sketchPath - path to the sketch directory or .ino file
 * @param {string} fqbn - e.g. "arduino:avr:uno"
 * @param {string} binaryExt - "hex", "ino.bin", etc.
 * @returns {Promise<string>} path to compiled binary
 */
/**
 * Compiles a sketch for the given FQBN.
 * @param {string} sketchPath
 * @param {string} fqbn
 * @param {string} binaryExt
 * @param {string[]} [extraFlags] - extra --build-property flags, e.g. ['build.extra_flags=-DSIMBOARD']
 */
export async function compileSketch(sketchPath, fqbn, binaryExt, extraFlags = []) {
  const arduinoCli = resolveArduinoCli();
  // Use realpath to resolve macOS /tmp → /private/var/... so arduino-cli
  // can find precompiled core artifacts without path-relative issues.
  const buildDir = await realpath(await mkdtemp(join(tmpdir(), 'simboard-build-')));

  try {
    let combinedOutput = '';
    try {
      const buildProps = extraFlags.flatMap(f => ['--build-property', f]);
      const { stdout, stderr } = await execFileAsync(arduinoCli, [
        'compile',
        '--fqbn', fqbn,
        '--build-path', buildDir,
        '--verbose',
        ...buildProps,
        sketchPath,
      ], { maxBuffer: 64 * 1024 * 1024 }); // 64MB — ESP32 compilation output is large
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

    // For ESP32 (ino.bin), merge bootloader + partitions + app into a 4MB
    // flash image that QEMU can load directly via -drive if=mtd
    if (binaryExt === 'ino.bin') {
      return await mergeEsp32Flash(buildDir, binaryInBuildDir);
    }

    // For all other boards, copy binary out of temp build dir
    const outFile = join(tmpdir(), `simboard-${basename(binaryInBuildDir)}`);
    await copyFile(binaryInBuildDir, outFile);
    return outFile;
  } finally {
    // Always clean up the build dir
    await rm(buildDir, { recursive: true, force: true });
  }
}
