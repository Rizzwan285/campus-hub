/**
 * Creates or updates the developer account and sets its password.
 *
 *   npm run set-admin -- --password 'your-password'
 *   npm run set-admin -- --roll 142301026 --password 'your-password'
 *
 * The password is only ever stored as a scrypt hash. Pass it on the command
 * line in a shell that does not record history, or omit --password and set
 * ADMIN_PASSWORD in the environment instead.
 */
import { config } from '../src/config';
import { pool } from '../src/db';
import { hashPassword } from '../src/auth/tokens';
import { ensureAdmin, findByRoll } from '../src/repositories/profile.repository';

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

async function main() {
  const roll = argValue('--roll') ?? config.ADMIN_ROLL_NUMBER;
  const password = argValue('--password') ?? process.env.ADMIN_PASSWORD;

  if (!password) {
    console.error('No password given. Pass --password "..." or set ADMIN_PASSWORD.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Use a password of at least 8 characters.');
    process.exit(1);
  }

  await ensureAdmin(roll, hashPassword(password));
  const profile = await findByRoll(roll);

  console.log(`Admin account ready: ${profile?.roll_number} (role=${profile?.role})`);
  console.log('Sign in with that roll number and the password you just set.');
  await pool.end();
}

main().catch(async (error) => {
  console.error('Failed:', error instanceof Error ? error.message : error);
  await pool.end().catch(() => {});
  process.exit(1);
});
