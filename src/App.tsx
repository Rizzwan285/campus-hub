import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import Index from "./pages/Index";
import Timetable from "./pages/Timetable";
import Campus from "./pages/Campus";
import Leave from "./pages/Leave";
import Academics from "./pages/Academics";
import NotFound from "./pages/NotFound";
import Admin from "./pages/Admin";
import { LEGACY_REDIRECTS } from "./routes";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      {/* Vite exposes the configured base path here, so the router follows
          whatever `base` vite.config.ts was built with. */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Index />} />
            <Route path="/timetable" element={<Timetable />} />
            <Route path="/academics" element={<Academics />} />
            <Route path="/campus" element={<Campus />} />
            <Route path="/leave" element={<Leave />} />
          </Route>
          {/* Old and shortcut addresses (src/routes.ts), e.g. /gym -> /campus#gym. */}
          {LEGACY_REDIRECTS.map(({ from, to }) => (
            <Route key={from} path={from} element={<Navigate to={to} replace />} />
          ))}
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
