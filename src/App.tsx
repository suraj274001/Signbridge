import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { LandingPage } from './pages/LandingPage';
import { TranslatePage } from './pages/TranslatePage';
import { SpeakPage } from './pages/SpeakPage';
import { ConversationPage } from './pages/ConversationPage';
import { TrainPage } from './pages/TrainPage';
import { LabPage } from './pages/LabPage';
import { EvaluationPage } from './pages/EvaluationPage';
import { AboutPage } from './pages/AboutPage';
import { SignLibraryPage } from './pages/SignLibraryPage';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <ScrollToTop />
        <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
          <Navbar />
          <main id="main-content" className="flex-1">
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/translate" element={<TranslatePage />} />
              <Route path="/speak" element={<SpeakPage />} />
              <Route path="/conversation" element={<ConversationPage />} />
              <Route path="/library" element={<SignLibraryPage />} />
              <Route path="/train" element={<TrainPage />} />
              <Route path="/lab" element={<LabPage />} />
              <Route path="/evaluation" element={<EvaluationPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </BrowserRouter>
    </AppProvider>
  );
}
