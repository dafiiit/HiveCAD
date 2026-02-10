import { Toaster as Sonner } from "@/components/ui/sonner";
import { UpdateChecker } from "@/components/updater/UpdateChecker";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { TabManager } from "@/components/layout/TabManager";
import NotFound from "./pages/NotFound";

import { AuthGateway } from "./components/auth/AuthGateway";
import { ErrorBoundary } from "./components/ErrorBoundary";

const queryClient = new QueryClient();

import { useEffect } from "react";
import { useUIStore } from "@/store/useUIStore";

const App = () => {
  const { theme, initialize } = useUIStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light');
    } else {
      document.body.classList.remove('light');
    }
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Sonner />
        <UpdateChecker />
        <BrowserRouter>
          <ErrorBoundary name="App Root">
            <Routes>
              <Route path="/" element={<AuthGateway><TabManager /></AuthGateway>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ErrorBoundary>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
