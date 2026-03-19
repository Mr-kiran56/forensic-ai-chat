import { useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AppSidebar } from "@/components/AppSidebar";
import { UploadModal } from "@/components/UploadModal";
import { ChatPage } from "@/pages/ChatPage";
import { InsightsPage } from "@/pages/InsightsPage";
import { NetworkPage } from "@/pages/NetworkPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <div className="flex h-screen w-full overflow-hidden">
            <AppSidebar onUploadClick={() => setUploadOpen(true)} />
            <main className="flex-1 overflow-hidden">
              <Routes>
                <Route path="/" element={<ChatPage />} />
                <Route path="/insights" element={<InsightsPage />} />
                <Route path="/network" element={<NetworkPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </main>
          </div>
          <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
