import { useState } from 'react';
import { useUserStore, UserProfile } from '@/store/useUserStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function Onboarding() {
  const setProfile = useUserStore((state) => state.setProfile);

  const [formData, setFormData] = useState<Partial<UserProfile>>({
    name: '',
    rollNo: '',
    mess: '',
    program: '',
    yearOfStudy: '',
    batchNo: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    // clear error
    if (errors[e.target.name]) {
      setErrors({ ...errors, [e.target.name]: '' });
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name) newErrors.name = 'Name is required';
    if (!formData.rollNo) newErrors.rollNo = 'Roll No is required';
    if (!formData.mess) newErrors.mess = 'Mess preference is required';
    if (!formData.program) newErrors.program = 'Program is required';
    if (!formData.yearOfStudy) newErrors.yearOfStudy = 'Year of study is required';
    
    // Batch is only needed if 1st Year BTech (UG)
    const isFirstYearUG = formData.program === 'UG' && formData.yearOfStudy === '1';
    if (isFirstYearUG && !formData.batchNo) {
      newErrors.batchNo = 'Batch No is required for first year BTech';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      setProfile(formData as UserProfile);
    }
  };

  const isFirstYearUG = formData.program === 'UG' && formData.yearOfStudy === '1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <Card className="w-full max-w-md p-6 bg-card shadow-2xl border-primary/20">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-foreground">Welcome to IIT Palakkad Dashboard</h2>
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

          <div className="space-y-2">
            <label className="text-sm font-medium">Roll No</label>
            <input
              type="text"
              name="rollNo"
              value={formData.rollNo || ''}
              onChange={handleChange}
              className={`w-full p-2 rounded-md border bg-background ${errors.rollNo ? 'border-red-500' : 'border-input'}`}
              placeholder="e.g. 112001001"
            />
            {errors.rollNo && <p className="text-red-500 text-xs">{errors.rollNo}</p>}
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
                <option value="1">Batch 1</option>
                <option value="2">Batch 2</option>
                <option value="3">Batch 3</option>
                <option value="4">Batch 4</option>
              </select>
              {errors.batchNo && <p className="text-red-500 text-xs">{errors.batchNo}</p>}
            </div>
          )}

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
