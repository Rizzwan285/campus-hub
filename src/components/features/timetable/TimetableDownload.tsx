import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useTimetableStore } from '@/store/useTimetableStore';
import { useUserStore } from '@/store/useUserStore';
import { buildTimetableExport } from '@/lib/timetableExport';

type Format = 'pdf' | 'xlsx';

const FORMATS: Array<{ format: Format; title: string; detail: string; icon: typeof FileText; mime: string }> = [
  {
    format: 'pdf',
    title: 'PDF',
    detail: 'Your week on one page, with course details on the next. Best for printing or keeping on your phone.',
    icon: FileText,
    mime: 'application/pdf',
  },
  {
    format: 'xlsx',
    title: 'Excel',
    detail: 'The same week as a coloured grid, plus sheets of courses and classes you can sort and edit.',
    icon: FileSpreadsheet,
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
];

function saveFile(data: ArrayBuffer, mime: string, name: string) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Some browsers start reading the file only after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Saves the student's timetable as a PDF or an Excel workbook. */
export function TimetableDownload() {
  const activeCourses = useTimetableStore((state) => state.activeCourses);
  const semester = useTimetableStore((state) => state.semester);
  const profile = useUserStore((state) => state.profile);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Format | null>(null);

  const download = async (format: Format, mime: string) => {
    if (busy) return;
    setBusy(format);
    try {
      const model = buildTimetableExport({
        courses: activeCourses,
        profile,
        semesterName: semester?.name,
        now: new Date(),
      });
      // Both writers are large, so each is fetched only when it is asked for.
      const data =
        format === 'pdf'
          ? await (await import('@/lib/timetablePdf')).buildTimetablePdf(model)
          : await (await import('@/lib/timetableXlsx')).buildTimetableXlsx(model);
      saveFile(data, mime, `${model.fileBase}.${format}`);
      toast.success(`Timetable saved as ${model.fileBase}.${format}`);
      setOpen(false);
    } catch (error) {
      console.error(error);
      toast.error('Could not make the file. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" title="Download your timetable as a PDF or Excel file">
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Download</span>
          <span className="sr-only sm:hidden">Download timetable</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Download timetable</DialogTitle>
          <DialogDescription>
            Your selected courses for a regular week, including any timings you changed yourself.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {FORMATS.map(({ format, title, detail, icon: Icon, mime }) => (
            <button
              key={format}
              type="button"
              disabled={busy !== null}
              onClick={() => void download(format, mime)}
              className="flex items-start gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/8 text-primary">
                {busy === format ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{title}</span>
                <span className="block text-xs text-muted-foreground mt-0.5">{detail}</span>
              </span>
            </button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          A downloaded file does not update. If a class moves later, download it again.
        </p>
      </DialogContent>
    </Dialog>
  );
}
