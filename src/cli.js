import { program } from 'commander';
import { createRequire } from 'module';
import { BOARDS } from './adapters/base.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

program
  .name('simboard')
  .version(version);

program
  .command('boards')
  .description('List available boards')
  .action(() => {
    console.log('Available boards:');
    for (const [flag, info] of Object.entries(BOARDS)) {
      console.log(`  --board ${flag.padEnd(8)} ${info.fqbn}`);
    }
  });

program
  .command('run <sketch>')
  .description('Compile and run a sketch')
  .requiredOption('--board <board>', 'Target board (uno, nano, mega, esp32)')
  .action(async (sketch, opts) => {
    const { run } = await import('./runner.js');
    await run(sketch, opts.board);
  });

program
  .command('compile <sketch>')
  .description('Compile a sketch and print binary path')
  .requiredOption('--board <board>', 'Target board')
  .action(async (sketch, opts) => {
    const { compile } = await import('./runner.js');
    const binaryPath = await compile(sketch, opts.board);
    console.log(binaryPath);
  });

program
  .command('doctor')
  .description('Show toolchain installation status')
  .action(async () => {
    const { doctor } = await import('./installer.js');
    await doctor();
  });

program.parseAsync().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
