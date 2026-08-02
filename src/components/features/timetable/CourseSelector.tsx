import { useState, useMemo } from 'react';
import { useTimetableStore } from '@/store/useTimetableStore';
import { Button } from '@/components/ui/button';
import { Settings, Check, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

export function CourseSelector() {
  const { loadedCourses, selectedCourseIds, updateSelectedCourses } = useTimetableStore();
  const [open, setOpen] = useState(false);
  
  const [search, setSearch] = useState('');

  // Filter and sort courses alphabetically by courseCode
  const filteredCourses = useMemo(() => {
    return loadedCourses
      .filter(course => {
        const matchSearch = course.courseCode.toLowerCase().includes(search.toLowerCase()) || 
                            course.courseName.toLowerCase().includes(search.toLowerCase());
        return matchSearch;
      })
      .sort((a, b) => a.courseCode.localeCompare(b.courseCode));
  }, [loadedCourses, search]);

  const toggleCourse = (code: string) => {
    if (selectedCourseIds.includes(code)) {
      updateSelectedCourses(selectedCourseIds.filter(cId => cId !== code));
    } else {
      updateSelectedCourses([...selectedCourseIds, code]);
    }
  };


  const clearAll = () => updateSelectedCourses([]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings className="h-4 w-4" />
          <span className="hidden sm:inline">Select Courses</span>
          {selectedCourseIds.length > 0 && (
            <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-bold">
              {selectedCourseIds.length}
            </span>
          )}
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between mt-1">
            <DialogTitle>Manage Courses</DialogTitle>
            <div className="flex gap-2 mr-6 text-sm">

              <button onClick={clearAll} className="text-destructive hover:underline font-medium">Clear All</button>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 mt-4 pr-6">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by code or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-muted/50 border-transparent rounded-md text-sm focus:border-primary focus:bg-background transition-colors outline-none ring-1 ring-border focus:ring-primary"
              />
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4 -mr-4 mt-2">
          {filteredCourses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <Search className="h-10 w-10 opacity-20 mb-3" />
              <p>No courses match your search criteria.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 pb-6 mt-4">
              {filteredCourses.map(course => {
                const isSelected = selectedCourseIds.includes(course.courseCode);
                return (
                  <div 
                    key={course.courseCode}
                    onClick={() => toggleCourse(course.courseCode)}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      isSelected 
                        ? 'bg-primary/5 border-primary shadow-[0_2px_10px_rgba(var(--primary),0.1)]' 
                        : 'bg-card hover:bg-muted/50 border-border'
                    }`}
                  >
                    <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-input bg-background'
                    }`}>
                      {isSelected && <Check className="w-3 h-3" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate leading-tight mb-1">{course.courseCode}</p>
                      <p className="text-xs text-muted-foreground leading-snug break-words line-clamp-2" title={course.courseName}>
                        {course.courseName}
                      </p>
                      {course.credits && (
                        <span className="inline-block mt-2 text-[10px] bg-secondary/30 text-secondary-foreground px-1.5 py-0.5 rounded font-medium">
                          {course.credits} Credits
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
        
        <div className="pt-4 border-t flex items-center justify-between mt-2">
          <p className="text-sm text-muted-foreground font-medium">
            {selectedCourseIds.length} course{selectedCourseIds.length !== 1 ? 's' : ''} selected
          </p>
          <Button onClick={() => setOpen(false)}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
