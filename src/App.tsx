import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import Index from "./pages/Index";
import Timetable from "./pages/Timetable";
import Campus from "./pages/Campus";
import Gym from "./pages/Gym";
import NotFound from "./pages/NotFound";
import Admin from "./pages/Admin";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      {/* Vite exposes the configured base path here, so the router follows
          whatever `base` vite.config.ts was built with. */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Index />} />
            <Route path="/timetable" element={<Timetable />} />
            <Route path="/campus" element={<Campus />} />
            <Route path="/gym" element={<Gym />} />
          </Route>
          {/* Legacy & direct shortcut redirects */}
          <Route path="/food" element={<Navigate to="/" replace />} />
          <Route path="/buggy" element={<Navigate to="/" replace />} />
          <Route path="/buggy-timings" element={<Navigate to="/" replace />} />
          <Route path="/bus-timings" element={<Navigate to="/" replace />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
