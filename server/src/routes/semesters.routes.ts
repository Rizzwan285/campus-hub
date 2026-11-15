import express, { Router } from 'express';
import { z } from 'zod';
import { invalidate } from '../middleware/cache';
import * as semesters from '../repositories/semesters.repository';
import * as profiles from '../repositories/profile.repository';
import {
  ImporterFailedError, ImporterUnavailableError, runImporter, safeUploadName,
} from '../importer/pythonImporter';
import { meetingListSchema, WEEKDAYS } from './schemas';

/**
 * /api/admin/semesters — creating a semester, importing the institute's
 * files, reviewing and correcting courses, and publishing.
 *
 * Mounted under the admin router, so every route here has already passed
 * `requireAdmin`. Bodies are parsed here, after that check: the large JSON and
 * file uploads these routes take are never read from an unauthenticated
 * client.
 */
export const semestersRouter = Router();

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_FILES_PER_SEMESTER = 60;

const largeJson = express.json({ limit: '16mb' });
const smallJson = express.json({ limit: '1mb' });
const rawUpload = express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES });

async function audit(req: express.Request, action: string, target: string, before: unknown, after: unknown) {
  await profiles.recordAudit({
    actorId: req.session?.sub ?? null,
    actorRoll: req.session?.roll ?? 'api-key',
    action, target, before, after,
  });
}

const actorOf = (req: express.Request) => req.session?.roll ?? 'api-key';

function idParam(raw: string | undefined): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Sends SemesterError as its own status; everything else goes to the error handler. */
function fail(error: unknown, res: express.Response, next: express.NextFunction) {
  if (error instanceof semesters.SemesterError) {
    res.status(error.status).json({ error: error.message, details: error.details });
    return;
  }
  next(error);
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD.').nullable().optional();
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM.');

// ---------------------------------------------------------------- semesters

semestersRouter.get('/', async (_req, res, next) => {
  try {
    res.json(await semesters.listSemesters());
  } catch (error) {
    next(error);
  }
});

const createBody = z.object({
  name: z.string().trim().min(3).max(60),
  startsOn: isoDate,
  endsOn: isoDate,
  copyFromId: z.number().int().positive().nullable().optional(),
});

semestersRouter.post('/', smallJson, async (req, res, next) => {
  try {
    const body = createBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: z.prettifyError(body.error) });
      return;
    }
    const created = await semesters.createSemester(body.data);
    await audit(req, 'semester.create', created.code, null, { name: created.name });
    res.status(201).json(created);
  } catch (error) {
    fail(error, res, next);
  }
});

semestersRouter.get('/:id', async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    const semester = id ? await semesters.getSemester(id) : null;
    if (!id || !semester) {
      res.status(404).json({ error: 'No such semester.' });
      return;
    }
    const [files, latestImport, publishCheck, snapshots] = await Promise.all([
      semesters.listFiles(id),
      semesters.latestImport(id),
      semesters.checkPublishable(id),
      semesters.listSnapshots(id),
    ]);
    res.json({ semester, files, latestImport, publishCheck, snapshots });
  } catch (error) {
    next(error);
  }
});

const slotDefinitionsSchema = z.record(
  z.string().trim().regex(/^[A-Za-z][A-Za-z0-9-]{0,9}$/, 'A slot code is letters, digits and hyphens.'),
  z.object({
    type: z.enum(['lecture', 'lab', 'tutorial']),
    timings: z
      .array(
        z
          .object({ day: z.enum(WEEKDAYS), startTime: clock, endTime: clock })
          .refine((timing) => timing.endTime > timing.startTime, { message: 'A slot must end after it starts.' }),
      )
      .min(1)
      .max(7),
  }),
);

const codeList = z.array(z.string().trim().min(2).max(20)).max(60);

const configSchema = z.object({
  firstYear: z
    .object({
      excludedCodes: codeList.optional(),
      cohorts: z
        .array(
          z
            .object({
              batchMin: z.number().int().min(1).max(99),
              batchMax: z.number().int().min(1).max(99),
              excludedCodes: codeList,
            })
            .refine((cohort) => cohort.batchMax >= cohort.batchMin, { message: 'A batch range must not be reversed.' }),
        )
        .max(12)
        .optional(),
      extraByBranch: z.record(z.string().max(60), codeList).optional(),
    })
    .optional(),
  venueRules: z
    .array(
      z
        .object({
          courseCode: z.string().trim().min(2).max(20),
          meetingType: z.enum(['lecture', 'lab', 'tutorial']).nullable(),
          batchMin: z.number().int().min(1).max(999),
          batchMax: z.number().int().min(1).max(999),
          room: z.string().trim().min(1).max(120),
        })
        .refine((rule) => rule.batchMax >= rule.batchMin, { message: 'A batch range must not be reversed.' }),
    )
    .max(200)
    .optional(),
});

const updateBody = z.object({
  name: z.string().trim().min(3).max(60).optional(),
  startsOn: isoDate,
  endsOn: isoDate,
  slotDefinitions: slotDefinitionsSchema.optional(),
  slotsConfirmed: z.boolean().optional(),
  config: configSchema.optional(),
});

semestersRouter.patch('/:id', smallJson, async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    const body = updateBody.safeParse(req.body);
    if (!id || !body.success) {
      res.status(400).json({ error: body.success ? 'Invalid semester id.' : z.prettifyError(body.error) });
      return;
    }
    const before = await semesters.getSemester(id);
    const updated = await semesters.updateSemester(id, body.data);
    if (!before || !updated) {
      res.status(404).json({ error: 'No such semester.' });
      return;
    }
    await audit(req, 'semester.update', updated.code,
      { slotsConfirmed: before.slotsConfirmed, config: before.config },
      { fields: Object.keys(body.data), slotsConfirmed: updated.slotsConfirmed });
    // Slots and rules are read live, so students on this semester see them now.
    invalidate('/api/timetable');
    res.json(updated);
  } catch (error) {
    fail(error, res, next);
  }
});

// ---------------------------------------------------------------- uploads

/**
 * PUT /api/admin/semesters/:id/files/:name — the request body is the file.
 *
 * Stored as bytes and only ever handed to the importer. The name is checked
 * against a plain pattern and never used as a path on its own; the content
 * must at least be a zip container, which every .xlsx and .docx is.
 */
semestersRouter.put('/:id/files/:name', rawUpload, async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    const name = safeUploadName(req.params.name ?? '');
    const semester = id ? await semesters.getSemester(id) : null;
    if (!id || !semester) {
      res.status(404).json({ error: 'No such semester.' });
      return;
    }
    if (!name) {
      res.status(400).json({ error: 'Upload .xlsx course workbooks and the slot-system .docx only.' });
      return;
    }
    const content = req.body as Buffer;
    if (!Buffer.isBuffer(content) || content.length === 0) {
      res.status(400).json({ error: 'The file is empty.' });
      return;
    }
    if (content.subarray(0, 2).toString('latin1') !== 'PK') {
      res.status(400).json({ error: `${name} is not a real .xlsx or .docx file.` });
      return;
    }
    const existing = await semesters.listFiles(id);
    if (existing.length >= MAX_FILES_PER_SEMESTER && !existing.some((file) => file.name === name)) {
      res.status(400).json({ error: `A semester can hold at most ${MAX_FILES_PER_SEMESTER} files.` });
      return;
    }

    const saved = await semesters.saveFile({
      semesterId: id,
      name,
      kind: name.toLowerCase().endsWith('.docx') ? 'slots' : 'workbook',
      content,
      uploadedBy: actorOf(req),
    });
    await audit(req, 'semester.file.upload', `${semester.code}/${name}`, null, { size: saved.size, sha256: saved.sha256 });
    res.status(201).json(saved);
  } catch (error) {
    next(error);
  }
});

semestersRouter.patch('/:id/files/:fileId', smallJson, async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    const fileId = idParam(req.params.fileId);
    const body = z
      .object({ program: z.enum(['UG', 'PG']).nullable(), branch: z.string().trim().max(60).nullable() })
      .safeParse(req.body);
    if (!id || !fileId || !body.success) {
      res.status(400).json({ error: 'Give a programme (UG or PG) and a branch.' });
      return;
    }
    const updated = await semesters.setFileTarget(id, fileId, body.data.program, body.data.branch || null);
    if (!updated) {
      res.status(404).json({ error: 'No such file.' });
      return;
    }
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

semestersRouter.delete('/:id/files/:fileId', async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    const fileId = idParam(req.params.fileId);
    if (!id || !fileId || !(await semesters.deleteFile(id, fileId))) {
      res.status(404).json({ error: 'No such file.' });
      return;
    }
    await audit(req, 'semester.file.delete', `${id}/${fileId}`, null, null);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------- import

/** POST /api/admin/semesters/:id/import — parses the uploaded files into the draft. */
semestersRouter.post('/:id/import', async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    const semester = id ? await semesters.getSemester(id) : null;
    if (!id || !semester) {
      res.status(404).json({ error: 'No such semester.' });
      return;
    }
    const files = await semesters.readFiles(id);
    if (!files.some((file) => file.kind === 'workbook')) {
      res.status(400).json({ error: 'Upload at least one course workbook first.' });
      return;
    }

    let parsed: semesters.ParsedImport;
    try {
      parsed = await runImporter({
        files, semesterName: semester.name, slotDefinitions: semester.slotDefinitions,
      });
    } catch (error) {
      if (error instanceof ImporterUnavailableError) {
        res.status(503).json({ error: error.message, importerUnavailable: true });
        return;
      }
      if (error instanceof ImporterFailedError) {
        res.status(422).json({ error: error.message });
        return;
      }
      throw error;
    }

    const summary = await semesters.applyImport(id, parsed, actorOf(req));
    await audit(req, 'semester.import', semester.code, null, {
      importId: summary.importId, total: summary.total, added: summary.added.length,
      modified: summary.modified.length, removed: summary.removed.length, invalid: summary.invalid,
    });
    res.json(summary);
  } catch (error) {
    fail(error, res, next);
  }
});

const issueSchema = z.object({
  code: z.string().max(40),
  severity: z.enum(['blocking', 'review', 'info']),
  message: z.string().max(800),
  detail: z.record(z.string(), z.unknown()).optional(),
});

const scheduleSchema = z.object({
  assignments: z
    .array(
      z.object({
        slot: z.string().trim().min(1).max(12),
        days: z.array(z.enum(WEEKDAYS)).max(7).nullable(),
        room: z.string().trim().max(120).default(''),
        batches: z.string().trim().max(60).nullish().transform((value) => value || undefined),
        startTime: clock.nullish().transform((value) => value || undefined),
        endTime: clock.nullish().transform((value) => value || undefined),
        type: z.enum(['lecture', 'lab', 'tutorial']).nullish().transform((value) => value || undefined),
        recurrence: z.enum(['weekly', 'biweekly_odd', 'biweekly_even']).nullish().transform((value) => value || undefined),
        overrides: z
          .partialRecord(
            z.enum(WEEKDAYS),
            z.object({
              room: z.string().trim().max(120).optional(),
              startTime: clock.optional(),
              endTime: clock.optional(),
            }),
          )
          .optional(),
        note: z.string().max(300).nullish().transform((value) => value || undefined),
      }),
    )
    .max(60),
  custom: meetingListSchema.default([]),
});

const parsedImportBody = z.object({
  parserVersion: z.string().max(20),
  semester: z.string().max(60).nullish(),
  slots: z.object({
    status: z.enum(['parsed', 'failed', 'missing']),
    definitions: slotDefinitionsSchema,
    issues: z.array(z.object({ slot: z.string().nullable(), message: z.string().max(400) })).max(200),
    file: z.string().nullish(),
  }),
  files: z.array(z.record(z.string(), z.unknown())).max(MAX_FILES_PER_SEMESTER),
  courses: z
    .array(
      z.object({
        program: z.enum(['UG', 'PG']),
        branch: z.string().trim().min(1).max(60),
        courseCode: z.string().trim().min(2).max(40),
        courseName: z.string().max(300),
        credits: z.string().max(40).default(''),
        category: z.string().max(60).default(''),
        instructors: z.array(z.string().max(200)).max(20).default([]),
        rawSlot: z.string().max(400).default(''),
        remarks: z.array(z.string().max(2000)).max(20).default([]),
        sourceRows: z
          .array(
            z.object({
              file: z.string().max(200),
              sheet: z.string().max(100),
              row: z.number().int(),
              cells: z.record(z.string(), z.string().max(4000)),
            }),
          )
          .max(40),
        schedule: scheduleSchema,
        issues: z.array(issueSchema).max(60),
      }),
    )
    .max(3000),
  warnings: z
    .array(
      z.object({
        file: z.string().nullable(), sheet: z.string().nullable(), row: z.number().nullable(),
        message: z.string().max(600),
      }),
    )
    .max(500),
});

/**
 * POST /api/admin/semesters/:id/import-parsed
 *
 * Takes the JSON `scripts/pipeline/import_semester.py --out` writes. For when
 * the API host has no Python: the same parser, run on the admin's machine.
 */
semestersRouter.post('/:id/import-parsed', largeJson, async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    const semester = id ? await semesters.getSemester(id) : null;
    if (!id || !semester) {
      res.status(404).json({ error: 'No such semester.' });
      return;
    }
    const body = parsedImportBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: `That is not importer output. ${z.prettifyError(body.error).slice(0, 600)}` });
      return;
    }
    const summary = await semesters.applyImport(id, body.data as unknown as semesters.ParsedImport, actorOf(req));
    await audit(req, 'semester.import', semester.code, null, {
      importId: summary.importId, total: summary.total, via: 'parsed-json',
    });
    res.json(summary);
  } catch (error) {
    fail(error, res, next);
  }
});

// ---------------------------------------------------------------- catalogue

/** The draft's courses, without the bulky source and parser copies. */
semestersRouter.get('/:id/courses', async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    if (!id) {
      res.status(404).json({ error: 'No such semester.' });
      return;
    }
    const courses = await semesters.listCourses(id);
    res.json(
      courses.map((course) => ({
        id: course.id, program: course.program, branch: course.branch, courseCode: course.courseCode,
        courseName: course.courseName, credits: course.credits, category: course.category,
        rawSlot: course.rawSlot, origin: course.origin, meetings: course.meetings,
        issues: course.issues.filter((entry) => !entry.resolved && entry.severity !== 'info'),
        reviewStatus: course.reviewStatus, manual: course.manual, removed: course.removed,
        dirty: course.dirty, importChange: course.importChange,
      })),
    );
  } catch (error) {
    next(error);
  }
});

semestersRouter.get('/:id/courses/:courseId', async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    const courseId = idParam(req.params.courseId);
    const course = id && courseId ? await semesters.getCourse(id, courseId) : null;
    if (!course) {
      res.status(404).json({ error: 'No such course.' });
      return;
    }
    res.json(course);
  } catch (error) {
    next(error);
  }
});

const courseBody = z.object({
  courseCode: z.string().trim().min(2).max(40).optional(),
  courseName: z.string().trim().max(300).optional(),
  credits: z.string().trim().max(40).nullable().optional(),
  category: z.string().trim().max(60).nullable().optional(),
  instructors: z.array(z.string().trim().max(200)).max(20).optional(),
  schedule: scheduleSchema.optional(),
  resolveIssues: z.boolean().optional(),
  removed: z.boolean().optional(),
});

semestersRouter.put('/:id/courses/:courseId', smallJson, async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    const courseId = idParam(req.params.courseId);
    const body = courseBody.safeParse(req.body);
    if (!id || !courseId || !body.success) {
      res.status(400).json({ error: body.success ? 'Invalid id.' : z.prettifyError(body.error) });
      return;
    }
    const before = await semesters.getCourse(id, courseId);
    const saved = await semesters.saveCourse(id, courseId, body.data as semesters.CourseEdit, actorOf(req));
    if (!before || !saved) {
      res.status(404).json({ error: 'No such course.' });
      return;
    }
    await audit(req, 'semester.course.update', `${id}/${saved.program}/${saved.branch}/${saved.courseCode}`,
      { meetings: before.meetings, removed: before.removed }, { meetings: saved.meetings, removed: saved.removed });
    res.json(saved);
  } catch (error) {
    fail(error, res, next);
  }
});

semestersRouter.post('/:id/courses/:courseId/reset', async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    const courseId = idParam(req.params.courseId);
    const saved = id && courseId ? await semesters.resetCourseToParsed(id, courseId) : null;
    if (!saved) {
      res.status(404).json({ error: 'No such course.' });
      return;
    }
    await audit(req, 'semester.course.reset', `${id}/${saved.program}/${saved.branch}/${saved.courseCode}`, null, null);
    res.json(saved);
  } catch (error) {
    fail(error, res, next);
  }
});

const newCourseBody = z.object({
  program: z.enum(['UG', 'PG']),
  branch: z.string().trim().min(1).max(60),
  courseCode: z.string().trim().min(2).max(40),
  courseName: z.string().trim().min(1).max(300),
  credits: z.string().trim().max(40).optional(),
  category: z.string().trim().max(60).optional(),
});

semestersRouter.post('/:id/courses', smallJson, async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    const body = newCourseBody.safeParse(req.body);
    if (!id || !body.success) {
      res.status(400).json({ error: body.success ? 'Invalid semester id.' : z.prettifyError(body.error) });
      return;
    }
    if (!(await semesters.getSemester(id))) {
      res.status(404).json({ error: 'No such semester.' });
      return;
    }
    const created = await semesters.createCourse(id, body.data, actorOf(req));
    await audit(req, 'semester.course.create', `${id}/${created.program}/${created.branch}/${created.courseCode}`, null, null);
    res.status(201).json(created);
  } catch (error) {
    fail(error, res, next);
  }
});

// ---------------------------------------------------------------- publishing

semestersRouter.post('/:id/publish', smallJson, async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    const body = z.object({ note: z.string().trim().max(300).optional() }).safeParse(req.body ?? {});
    if (!id || !body.success) {
      res.status(400).json({ error: 'Invalid request.' });
      return;
    }
    const result = await semesters.publishSemester(id, { actor: actorOf(req), note: body.data.note || null });
    await audit(req, 'semester.publish', result.semester.code, { version: result.version - 1 },
      { version: result.version, courses: result.courses, note: body.data.note ?? null });
    invalidate('/api/timetable');
    res.json(result);
  } catch (error) {
    fail(error, res, next);
  }
});

semestersRouter.post('/:id/rollback', smallJson, async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    const body = z.object({ version: z.number().int().positive() }).safeParse(req.body);
    if (!id || !body.success) {
      res.status(400).json({ error: 'Say which version to go back to.' });
      return;
    }
    const result = await semesters.rollbackSemester(id, body.data.version, actorOf(req));
    await audit(req, 'semester.rollback', result.semester.code, null,
      { restoredVersion: body.data.version, newVersion: result.version });
    invalidate('/api/timetable');
    res.json(result);
  } catch (error) {
    fail(error, res, next);
  }
});

semestersRouter.post('/:id/activate', async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid semester id.' });
      return;
    }
    const result = await semesters.activateSemester(id, actorOf(req));
    await audit(req, 'semester.activate', result.semester.code,
      { previous: result.archived?.code ?? null }, { closedRequests: result.closedRequests });
    // Every public payload is per-semester now; drop them all.
    invalidate();
    res.json(result);
  } catch (error) {
    fail(error, res, next);
  }
});

semestersRouter.post('/:id/archive', async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid semester id.' });
      return;
    }
    const archived = await semesters.archiveSemester(id);
    await audit(req, 'semester.archive', archived.code, null, null);
    invalidate('/api/timetable');
    res.json(archived);
  } catch (error) {
    fail(error, res, next);
  }
});
