import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { config } from '../config';
import type { ParsedImport } from '../repositories/semesters.repository';

/**
 * Runs the Python importer (scripts/pipeline/import_semester.py) on uploaded
 * files and returns its JSON.
 *
 * The parser is Python because the slot-expression logic already was, and it
 * uses only the standard library, so the host needs a `python3` and nothing
 * else. If there is none, `ImporterUnavailableError` says so and the admin can
 * run the same script on their own machine and upload its output instead.
 *
 * Uploaded files are untrusted: they are written under a fresh temporary
 * directory with names this module chose, the interpreter runs in isolated
 * mode (-I: no user site-packages, no PYTHON* variables, script directory not
 * importable from the data directory), with a time limit, an output limit and
 * an environment stripped of the API's secrets.
 */

const SCRIPT = path.resolve(__dirname, '../../../scripts/pipeline/import_semester.py');
const TIMEOUT_MS = 90_000;
const MAX_OUTPUT_BYTES = 40 * 1024 * 1024;

export class ImporterUnavailableError extends Error {}
export class ImporterFailedError extends Error {}

export interface ImportFile {
  name: string;
  content: Buffer;
  program?: string | null;
  branch?: string | null;
}

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9 ._()&,+-]{0,180}\.(xlsx|docx)$/i;

/** The name if it is safe to store and to create on disk, otherwise null. */
export function safeUploadName(name: string): string | null {
  // A name with a path in it is refused outright rather than trimmed to its
  // last part: nothing legitimate uploads "../x.xlsx".
  const base = name.trim();
  if (/[\\/]/.test(base) || base.includes('..')) return null;
  return SAFE_NAME.test(base) ? base : null;
}

export async function runImporter(input: {
  files: ImportFile[];
  semesterName: string;
  slotDefinitions: unknown;
}): Promise<ParsedImport> {
  try {
    await fs.access(SCRIPT);
  } catch {
    throw new ImporterUnavailableError(
      'The importer script is not deployed with this API (scripts/pipeline/import_semester.py is missing).',
    );
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'campus-import-'));
  const dataDir = path.join(workDir, 'files');
  try {
    await fs.mkdir(dataDir, { mode: 0o700 });
    for (const file of input.files) {
      const name = safeUploadName(file.name);
      if (!name) throw new ImporterFailedError(`"${file.name}" is not an acceptable file name.`);
      await fs.writeFile(path.join(dataDir, name), file.content, { mode: 0o600 });
    }
    const manifestPath = path.join(workDir, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify({
      semester: input.semesterName,
      slotDefinitions: input.slotDefinitions,
      files: input.files
        .filter((file) => file.program && file.branch)
        .map((file) => ({ name: safeUploadName(file.name), program: file.program, branch: file.branch })),
    }));

    const output = await execute([
      '-I', SCRIPT, '--dir', dataDir, '--manifest', manifestPath, '--semester', input.semesterName,
    ]);
    try {
      return JSON.parse(output) as ParsedImport;
    } catch {
      throw new ImporterFailedError('The importer did not return valid JSON.');
    }
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

function execute(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(config.PYTHON_BIN, args, {
      // Nothing from the API's environment: no database URL, no secrets.
      env: { PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin', LANG: 'C.UTF-8', PYTHONIOENCODING: 'utf-8' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const chunks: Buffer[] = [];
    let size = 0;
    let stderr = '';
    let settled = false;
    const finish = (error: Error | null, value?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value ?? '');
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new ImporterFailedError('The importer took too long and was stopped.'));
    }, TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_OUTPUT_BYTES) {
        child.kill('SIGKILL');
        finish(new ImporterFailedError('The importer produced too much output.'));
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 4000) stderr += chunk.toString('utf8');
    });
    child.on('error', (error: NodeJS.ErrnoException) => {
      finish(
        error.code === 'ENOENT'
          ? new ImporterUnavailableError(
              `No Python interpreter ("${config.PYTHON_BIN}") on the API host. Set PYTHON_BIN, or run ` +
                'scripts/pipeline/import_semester.py on your machine and upload its JSON.',
            )
          : new ImporterFailedError(error.message),
      );
    });
    child.on('close', (code) => {
      if (code === 0) finish(null, Buffer.concat(chunks).toString('utf8'));
      else finish(new ImporterFailedError(`The importer failed (exit ${code}). ${stderr.trim().slice(-600)}`));
    });
  });
}
