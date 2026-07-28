export function stringToColorClass(str: string): string {
  // A simple hash function
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Pre-defined pleasing color palettes (background, text, border)
  const palettes = [
    "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
    "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
    "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20",
    "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20",
    "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
    "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20",
    "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20",
    "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
    "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400 border-fuchsia-500/20",
    "bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-500/20",
    "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
  ];

  const index = Math.abs(hash) % palettes.length;
  return palettes[index];
}
