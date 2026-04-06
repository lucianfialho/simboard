import { join } from 'node:path';
import { homedir, platform, arch } from 'node:os';
import { mkdir, chmod, access, unlink } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { constants } from 'node:fs';

const SIMBOARD_DIR = join(homedir(), '.simboard');
const BIN_DIR = join(SIMBOARD_DIR, 'bin');

// arduino-cli 1.0.4 release URLs by platform/arch
const ARDUINO_CLI_URLS = {
  'darwin-arm64':  'https://github.com/arduino/arduino-cli/releases/download/v1.0.4/arduino-cli_1.0.4_macOS_ARM64.tar.gz',
  'darwin-x64':    'https://github.com/arduino/arduino-cli/releases/download/v1.0.4/arduino-cli_1.0.4_macOS_64bit.tar.gz',
  'linux-x64':     'https://github.com/arduino/arduino-cli/releases/download/v1.0.4/arduino-cli_1.0.4_Linux_64bit.tar.gz',
  'linux-arm64':   'https://github.com/arduino/arduino-cli/releases/download/v1.0.4/arduino-cli_1.0.4_Linux_ARM64.tar.gz',
};

function platformKey() {
  const os = platform(); // 'darwin' | 'linux'
  const a = arch();      // 'arm64' | 'x64'
  return `${os}-${a}`;
}

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function downloadFile(url, destPath) {
  process.stderr.write(`Downloading ${url}\n`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const writer = createWriteStream(destPath);
  await pipeline(res.body, writer);
}

async function extractTarGz(archivePath, destDir) {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  await promisify(execFile)('tar', ['-xzf', archivePath, '-C', destDir]);
}

export async function ensureArduinoCli() {
  const cliPath = join(BIN_DIR, 'arduino-cli');
  if (await fileExists(cliPath)) return cliPath;

  process.stderr.write('arduino-cli not found. Installing (~10MB)...\n');
  await mkdir(BIN_DIR, { recursive: true });

  const key = platformKey();
  const url = ARDUINO_CLI_URLS[key];
  if (!url) throw new Error(`Unsupported platform: ${key}`);

  const archivePath = join(SIMBOARD_DIR, 'arduino-cli.tar.gz');
  await downloadFile(url, archivePath);
  await extractTarGz(archivePath, BIN_DIR);
  await unlink(archivePath).catch(() => {}); // cleanup archive
  await chmod(cliPath, 0o755);

  process.stderr.write('arduino-cli installed.\n');
  return cliPath;
}

export async function ensureAvrCore() {
  await ensureArduinoCli();
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);
  const cliPath = join(BIN_DIR, 'arduino-cli');

  // Check if AVR core is installed
  const { stdout } = await execFileAsync(cliPath, ['core', 'list']);
  if (stdout.includes('arduino:avr')) {
    process.stderr.write('arduino:avr core already installed.\n');
    return;
  }

  process.stderr.write('Installing arduino:avr core (~15MB)...\n');
  await execFileAsync(cliPath, ['core', 'update-index']);
  await execFileAsync(cliPath, ['core', 'install', 'arduino:avr']);
  process.stderr.write('arduino:avr core installed.\n');
}

export async function ensureEsp32Core() {
  await ensureArduinoCli();
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);
  const cliPath = join(BIN_DIR, 'arduino-cli');

  const { stdout } = await execFileAsync(cliPath, ['core', 'list']);
  if (stdout.includes('esp32:esp32')) {
    process.stderr.write('esp32:esp32 core already installed.\n');
    return;
  }

  process.stderr.write('Installing esp32:esp32 core (~500MB, may take 5-10min)...\n');
  await execFileAsync(cliPath, [
    'config', 'add', 'board_manager.additional_urls',
    'https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json',
  ]);
  await execFileAsync(cliPath, ['core', 'update-index']);
  await execFileAsync(cliPath, ['core', 'install', 'esp32:esp32']);
  process.stderr.write('esp32:esp32 core installed.\n');
}

/**
 * Ensures all tools required for the given adapter type are installed.
 * adapter: 'avr' | 'esp32'
 */
export async function ensureToolchain(adapter) {
  await ensureArduinoCli();
  if (adapter === 'avr') {
    await ensureAvrCore();
  } else if (adapter === 'esp32') {
    await ensureAvrCore(); // arduino-cli needs AVR core to bootstrap
    await ensureEsp32Core();
    await ensureQemu();
  }
}

async function extractTarXz(archivePath, destDir) {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  await promisify(execFile)('tar', ['-xJf', archivePath, '-C', destDir]);
}

export async function ensureQemu() {
  // Binary is extracted to BIN_DIR/qemu/bin/qemu-system-xtensa
  const qemuPath = join(BIN_DIR, 'qemu', 'bin', 'qemu-system-xtensa');
  if (await fileExists(qemuPath)) return qemuPath;

  process.stderr.write('qemu-system-xtensa not found. Installing (~30MB)...\n');

  // espressif/qemu pre-built binaries for ESP32 (xtensa) QEMU
  // Release: esp-develop-9.2.2-20250817 — assets confirmed via GitHub API
  const QEMU_RELEASE = 'esp-develop-9.2.2-20250817';
  const QEMU_VERSION = 'esp_develop_9.2.2_20250817';
  const QEMU_BASE = `https://github.com/espressif/qemu/releases/download/${QEMU_RELEASE}`;
  const QEMU_URLS = {
    'darwin-arm64': `${QEMU_BASE}/qemu-xtensa-softmmu-${QEMU_VERSION}-aarch64-apple-darwin.tar.xz`,
    'darwin-x64':   `${QEMU_BASE}/qemu-xtensa-softmmu-${QEMU_VERSION}-x86_64-apple-darwin.tar.xz`,
    'linux-x64':    `${QEMU_BASE}/qemu-xtensa-softmmu-${QEMU_VERSION}-x86_64-linux-gnu.tar.xz`,
    'linux-arm64':  `${QEMU_BASE}/qemu-xtensa-softmmu-${QEMU_VERSION}-aarch64-linux-gnu.tar.xz`,
  };

  const key = platformKey();
  const url = QEMU_URLS[key];
  if (!url) throw new Error(`No pre-built QEMU binary for platform: ${key}`);

  await mkdir(BIN_DIR, { recursive: true });
  const archivePath = join(SIMBOARD_DIR, 'qemu-xtensa.tar.xz');
  await downloadFile(url, archivePath);
  await extractTarXz(archivePath, BIN_DIR);
  await unlink(archivePath).catch(() => {}); // cleanup archive
  await chmod(qemuPath, 0o755);

  process.stderr.write('qemu-system-xtensa installed.\n');
  return qemuPath;
}

export async function doctor() {
  const checks = [
    { name: 'arduino-cli',        path: join(BIN_DIR, 'arduino-cli') },
    { name: 'qemu-system-xtensa', path: join(BIN_DIR, 'qemu', 'bin', 'qemu-system-xtensa') },
  ];

  console.log('simboard toolchain status:');
  console.log(`Install dir: ${SIMBOARD_DIR}\n`);

  for (const check of checks) {
    const exists = await fileExists(check.path);
    const status = exists ? '✓ installed' : '✗ not installed';
    console.log(`  ${status}  ${check.name}`);
  }
}
