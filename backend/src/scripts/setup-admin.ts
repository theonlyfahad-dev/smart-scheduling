import readline from 'node:readline';
import { Writable } from 'node:stream';
import { dbAdapter } from '../db/client.js';
import { setupAdmin } from '../auth/setup.service.js';
import { AppError, ConflictError, ValidationError } from '../errors/app.errors.js';

function promptInput(promptText: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function promptPassword(promptText: string): Promise<string> {
  return new Promise((resolve) => {
    let muted = false;
    const mutableStdout = new Writable({
      write(chunk, encoding, callback) {
        if (!muted) {
          process.stdout.write(chunk, encoding);
        }
        callback();
      },
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: mutableStdout,
      terminal: true,
    });

    process.stdout.write(promptText);
    muted = true;
    rl.question('', (answer) => {
      muted = false;
      process.stdout.write('\n');
      rl.close();
      resolve(answer);
    });
  });
}

async function main(): Promise<void> {
  console.log('=== Smart Campus (SmartTT) — First-Run Admin Setup ===\n');

  try {
    await dbAdapter.connect();

    const username = await promptInput('Enter Admin Username (3-50 chars, alphanumeric/underscore): ');
    const password = await promptPassword('Enter Admin Password (min 8 chars): ');

    const created = await setupAdmin(dbAdapter.db, username, password);

    console.log(`\n✓ Administrator account created successfully:`);
    console.log(`  ID:       ${created.id}`);
    console.log(`  Username: ${created.username}`);
    console.log(`  Role:     ${created.role}`);

    await dbAdapter.disconnect();
    process.exit(0);
  } catch (err: unknown) {
    if (err instanceof ConflictError) {
      console.error(`\n[Conflict] ${err.message}`);
    } else if (err instanceof ValidationError) {
      console.error(`\n[Validation Error] ${err.message}`);
    } else if (err instanceof AppError) {
      console.error(`\n[Error] ${err.message}`);
    } else {
      console.error(`\n[Unexpected Error]`, err instanceof Error ? err.message : String(err));
    }

    try {
      await dbAdapter.disconnect();
    } catch {
      // Ignore disconnect error on exit
    }
    process.exit(1);
  }
}

main();
