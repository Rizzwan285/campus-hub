import { useState } from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { getCurrentTimeInKolkata } from '@/utils/dateUtils';

interface DatePickerDialogProps {
  selectedDate: Date | null;
  onDateChange: (date: Date | null) => void;
}

export function DatePickerDialog({ selectedDate, onDateChange }: DatePickerDialogProps) {
  const [open, setOpen] = useState(false);
  const currentDate = getCurrentTimeInKolkata();
  
  // Calculate date range: today to 7 days ahead
  const minDate = currentDate;
  const maxDate = new Date(currentDate);
  maxDate.setDate(maxDate.getDate() + 7);

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      onDateChange(date);
      setOpen(false);
    }
  };

  const handleToday = () => {
    onDateChange(null);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start text-left font-normal transition-transform hover:scale-105",
            !selectedDate && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Select Date</DialogTitle>
          <DialogDescription>
            Choose a date to view bus schedules and mess menu (up to 7 days ahead)
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Calendar
            mode="single"
            selected={selectedDate || currentDate}
            onSelect={handleSelect}
            disabled={(date) => {
              const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
              const minDateOnly = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
              const maxDateOnly = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate());
              return dateOnly < minDateOnly || dateOnly > maxDateOnly;
            }}
            initialFocus
            className={cn("p-3 pointer-events-auto rounded-md border")}
          />
          <Button
            variant="outline"
            onClick={handleToday}
            className="w-full"
          >
            Back to Today
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
