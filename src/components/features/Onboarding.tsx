import { useState } from 'react';
import { useUserStore, UserProfile } from '@/store/useUserStore';
import { Button } from '@/components/ui/button';
import { GraduationCap, BookOpen, UtensilsCrossed, Users, ChevronRight, Sparkles } from 'lucide-react';

export function Onboarding() {
  const setProfile = useUserStore((state) => state.setProfile);

  const [formData, setFormData] = useState<Partial<UserProfile>>({
    name: '',
    mess: '',
    program: '',
    branch: '',
    yearOfStudy: '',
    batchNo: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const isFirstYearUG = formData.program === 'UG' && formData.yearOfStudy === '1';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    setFormData(prev => ({ ...prev, [name]: value }));

    if (errors[name]) {
      setErrors({ ...errors, [name]: '' });
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name) newErrors.name = 'Name is required';
    if (!formData.mess) newErrors.mess = 'Mess preference is required';
    if (!formData.program) newErrors.program = 'Program is required';
    if (!formData.branch) newErrors.branch = 'Branch is required';
    if (!formData.yearOfStudy) newErrors.yearOfStudy = 'Year of study is required';
    
    if (isFirstYearUG && !formData.batchNo) {
      newErrors.batchNo = 'Batch No is required for first year BTech';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      const finalProfile = { ...formData } as UserProfile;
      setProfile(finalProfile);
      
      import('@/store/useTimetableStore').then(({ useTimetableStore }) => {
        useTimetableStore.getState().updateProfile(finalProfile.program!, finalProfile.branch!);
      });
    }
  };

  // Generate batch options B1 to B24
  const batchOptions = Array.from({ length: 24 }, (_, i) => `B${i + 1}`);

  const inputClass = (field: string) =>
    `w-full px-3.5 py-2.5 rounded-xl border bg-background/60 backdrop-blur-sm text-sm transition-all duration-200 outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 hover:border-primary/30 ${
      errors[field] ? 'border-red-400/80 focus:ring-red-400/30' : 'border-border/60'
    }`;

  const labelClass = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 mb-1.5 block';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: 'radial-gradient(ellipse at 30% 20%, hsl(var(--primary) / 0.08) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, hsl(var(--primary) / 0.05) 0%, transparent 50%), hsl(var(--background))'
      }}
    >
      {/* Decorative floating elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[15%] left-[10%] w-64 h-64 rounded-full bg-primary/5 blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-[20%] right-[15%] w-48 h-48 rounded-full bg-primary/8 blur-3xl animate-pulse" style={{ animationDuration: '6s' }} />
        <div className="absolute top-[60%] left-[60%] w-32 h-32 rounded-full bg-primary/4 blur-2xl animate-pulse" style={{ animationDuration: '5s' }} />
      </div>

      <div className="w-full max-w-lg relative">
        {/* Card */}
        <div className="bg-card/80 backdrop-blur-xl rounded-2xl border border-border/40 shadow-2xl shadow-primary/5 overflow-hidden">
          
          {/* Header Section */}
          <div className="relative px-8 pt-10 pb-6 text-center">
            {/* Logo / Icon */}
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 mb-5 shadow-lg shadow-primary/10">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            
            <h1 className="text-3xl font-bold text-foreground tracking-tight">
              Campus Companion
            </h1>
            <p className="text-muted-foreground mt-2 text-sm max-w-xs mx-auto leading-relaxed">
              Personalize your dashboard with your academic details
            </p>
          </div>

          {/* Form Section */}
          <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-5">
            
            {/* Name Field */}
            <div>
              <label className={labelClass}>
                <span className="inline-flex items-center gap-1.5">
                  <Users className="w-3 h-3" /> Your Name
                </span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name || ''}
                onChange={handleChange}
                className={inputClass('name')}
                placeholder="What should we call you?"
              />
              {errors.name && <p className="text-red-400 text-[11px] mt-1.5 font-medium">{errors.name}</p>}
            </div>

            {/* Program & Year Row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>
                  <span className="inline-flex items-center gap-1.5">
                    <GraduationCap className="w-3 h-3" /> Program
                  </span>
                </label>
                <select
                  name="program"
                  value={formData.program || ''}
                  onChange={handleChange}
                  className={inputClass('program')}
                >
                  <option value="">Select...</option>
                  <option value="UG">UG (B.Tech)</option>
                  <option value="PG">PG (M.Tech/MSc/PhD)</option>
                </select>
                {errors.program && <p className="text-red-400 text-[11px] mt-1.5 font-medium">{errors.program}</p>}
              </div>

              <div>
                <label className={labelClass}>Year</label>
                <select
                  name="yearOfStudy"
                  value={formData.yearOfStudy || ''}
                  onChange={handleChange}
                  className={inputClass('yearOfStudy')}
                >
                  <option value="">Select...</option>
                  <option value="1">1st Year</option>
                  <option value="2">2nd Year</option>
                  <option value="3">3rd Year</option>
                  <option value="4">4th Year</option>
                </select>
                {errors.yearOfStudy && <p className="text-red-400 text-[11px] mt-1.5 font-medium">{errors.yearOfStudy}</p>}
              </div>
            </div>

            {/* Batch (Conditional) */}
            {isFirstYearUG && (
              <div className="animate-in slide-in-from-top-2 fade-in duration-300">
                <label className={labelClass}>Batch No</label>
                <select
                  name="batchNo"
                  value={formData.batchNo || ''}
                  onChange={handleChange}
                  className={inputClass('batchNo')}
                >
                  <option value="">Select Batch...</option>
                  {batchOptions.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                {errors.batchNo && <p className="text-red-400 text-[11px] mt-1.5 font-medium">{errors.batchNo}</p>}
                <p className="text-[11px] text-muted-foreground/70 mt-1.5 leading-relaxed">
                  Your core timetable will be automatically loaded based on your batch.
                </p>
              </div>
            )}

            {/* Branch */}
            <div>
              <label className={labelClass}>
                <span className="inline-flex items-center gap-1.5">
                  <BookOpen className="w-3 h-3" /> Branch
                </span>
              </label>
              <select
                name="branch"
                value={formData.branch || ''}
                onChange={handleChange}
                className={inputClass('branch')}
              >
                <option value="">Select Branch...</option>
                {formData.program === 'UG' && (
                  <>
                    <option value="CSE">Computer Science & Engineering</option>
                    <option value="EE">Electrical Engineering</option>
                    <option value="ME">Mechanical Engineering</option>
                    <option value="CE">Civil Engineering</option>
                    <option value="DS">Data Science</option>
                  </>
                )}
                {formData.program === 'PG' && (
                  <>
                    <option value="CY">Chemistry (CY)</option>
                    <option value="MA">Mathematics (MA)</option>
                    <option value="PH">Physics (PH)</option>
                    <option value="HSS">Humanities (HSS)</option>
                    <option value="BSE">BSE</option>
                    <option value="ESSENCE">ESSENCE</option>
                    <option value="MTechCaM">MTech CaM</option>
                    <option value="MTechDS">MTech Data Science</option>
                    <option value="MTechDesignAutomation">MTech Design Automation</option>
                    <option value="MTechGeo">MTech Geotechnical</option>
                    <option value="MTechMME">MTech MME</option>
                    <option value="MTechPEPS">MTech PEPS</option>
                    <option value="MTechSOCD">MTech SOCD</option>
                    <option value="MTechStructuralEngineering">MTech Structural Eng.</option>
                    <option value="MTechThermofluidsEngineering">MTech Thermofluids Eng.</option>
                    <option value="MTechWaterResourcesEngineering">MTech Water Resources Eng.</option>
                  </>
                )}
              </select>
              {errors.branch && <p className="text-red-400 text-[11px] mt-1.5 font-medium">{errors.branch}</p>}
            </div>

            {/* Mess */}
            <div>
              <label className={labelClass}>
                <span className="inline-flex items-center gap-1.5">
                  <UtensilsCrossed className="w-3 h-3" /> Mess
                </span>
              </label>
              <select
                name="mess"
                value={formData.mess || ''}
                onChange={handleChange}
                className={inputClass('mess')}
              >
                <option value="">Select Mess...</option>
                <option value="Nila">Nila Mess (First Years)</option>
                <option value="Kedaram">Kedaram Mess</option>
              </select>
              {errors.mess && <p className="text-red-400 text-[11px] mt-1.5 font-medium">{errors.mess}</p>}
            </div>

            {/* Submit Button */}
            <Button 
              type="submit" 
              className="w-full mt-3 h-12 rounded-xl text-sm font-semibold gap-2 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all duration-200 hover:shadow-xl hover:shadow-primary/25 hover:scale-[1.01] active:scale-[0.99]"
            >
              Sign In
              <ChevronRight className="w-4 h-4" />
            </Button>
          </form>
        </div>

        {/* Footer Text */}
        <p className="text-center text-[11px] text-muted-foreground/50 mt-4">
          Your data stays on your device • No account needed
        </p>
      </div>
    </div>
  );
}
