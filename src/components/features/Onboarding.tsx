import { useState } from 'react';
import { useUserStore, UserProfile } from '@/store/useUserStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <Card className="w-full max-w-md p-6 bg-card shadow-2xl border-primary/20">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-foreground">Welcome to Campus Companion</h2>
          <p className="text-muted-foreground mt-2 text-sm">Please set up your profile to personalize your experience.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <input
              type="text"
              name="name"
              value={formData.name || ''}
              onChange={handleChange}
              className={`w-full p-2 rounded-md border bg-background ${errors.name ? 'border-red-500' : 'border-input'}`}
              placeholder="e.g. John Doe"
            />
            {errors.name && <p className="text-red-500 text-xs">{errors.name}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Program</label>
              <select
                name="program"
                value={formData.program || ''}
                onChange={handleChange}
                className={`w-full p-2 rounded-md border bg-background ${errors.program ? 'border-red-500' : 'border-input'}`}
              >
                <option value="">Select...</option>
                <option value="UG">UG (B.Tech)</option>
                <option value="PG">PG (M.Tech/MSc/PhD)</option>
              </select>
              {errors.program && <p className="text-red-500 text-xs">{errors.program}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Year of Study</label>
              <select
                name="yearOfStudy"
                value={formData.yearOfStudy || ''}
                onChange={handleChange}
                className={`w-full p-2 rounded-md border bg-background ${errors.yearOfStudy ? 'border-red-500' : 'border-input'}`}
              >
                <option value="">Select...</option>
                <option value="1">1st Year</option>
                <option value="2">2nd Year</option>
                <option value="3">3rd Year</option>
                <option value="4">4th Year</option>
              </select>
              {errors.yearOfStudy && <p className="text-red-500 text-xs">{errors.yearOfStudy}</p>}
            </div>
          </div>

          {isFirstYearUG && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Batch No</label>
              <select
                name="batchNo"
                value={formData.batchNo || ''}
                onChange={handleChange}
                className={`w-full p-2 rounded-md border bg-background ${errors.batchNo ? 'border-red-500' : 'border-input'}`}
              >
                <option value="">Select Batch...</option>
                {batchOptions.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              {errors.batchNo && <p className="text-red-500 text-xs">{errors.batchNo}</p>}
              <p className="text-xs text-muted-foreground mt-1">Your core timetable will be automatically loaded based on your batch.</p>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Branch</label>
            <select
              name="branch"
              value={formData.branch || ''}
              onChange={handleChange}
              className={`w-full p-2 rounded-md border bg-background ${errors.branch ? 'border-red-500' : 'border-input'}`}
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
            {errors.branch && <p className="text-red-500 text-xs">{errors.branch}</p>}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Mess</label>
            <select
              name="mess"
              value={formData.mess || ''}
              onChange={handleChange}
              className={`w-full p-2 rounded-md border bg-background ${errors.mess ? 'border-red-500' : 'border-input'}`}
            >
              <option value="">Select Mess...</option>
              <option value="Nila">Nila Mess (First Years)</option>
              <option value="Kedaram">Kedaram Mess</option>
            </select>
            {errors.mess && <p className="text-red-500 text-xs">{errors.mess}</p>}
          </div>

          <Button type="submit" className="w-full mt-6">
            Continue to Dashboard
          </Button>
        </form>
      </Card>
    </div>
  );
}
