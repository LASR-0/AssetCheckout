import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import RequestFormPage from "@/pages/RequestFormPage";
import AccessoryRequestFormPage from "@/pages/AccessoryFormPage";
import LoanFormPage from "@/pages/LoanFormPage";
import SuccessRedirect from "@/pages/SuccessRedirect";
import RequestTablePage from "@/pages/RequestsTablePage"
import StockPage from "@/pages/StockPage";
import Navbar from "./components/nav/Navbar";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import NoAccessPage from "./pages/NoAccessPage";
import SettingsPage from "./pages/SettingsPage";
import NotFoundPage from "./pages/NotFoundPage";
import LandingPage from "./pages/Home";
import FeedbackPage from "./pages/FeedbackPage";
import TroubleshootingPage from "./pages/TroubleshootingPage";
import TroubleshootingArticlePage from "./pages/TroubleshootingArticlePage";
import { TROUBLESHOOTING_ROUTES } from "./lib/troubleshootingRoutes";
import Footer from "./components/footer/Footer";
import { syncOrgPreset } from "./hooks/usePreset";
import TourProvider from "./components/tour/TourProvider";
import { ToastProvider } from "./components/ui/toast";

// Dev-only component gallery for the redesign. The DEV check is a build-time
// constant, so in production both this import and its route are dropped.
const UiGallery = import.meta.env.DEV ? lazy(() => import("./pages/dev/UiGallery")) : null;

function App() {
  // Once, at boot. The palette the org defaults to has to reach everybody, and
  // the picker that would otherwise fetch it only mounts on the Settings page.
  // It never overrides somebody's own choice — see syncOrgPreset.
  useEffect(() => {
    void syncOrgPreset();
  }, []);

  return (
    // Above the navbar and the routes both, because the tour button and the
    // page have to agree on which tour applies here — see TourProvider.
    <TourProvider>
      <ToastProvider>
      <Navbar />
      <div className="pt-16">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/assets" element={
            <ProtectedRoute requireRole={false}><RequestFormPage /></ProtectedRoute>
          } />
          <Route path="/accessories" element={
            <ProtectedRoute requireRole={false}><AccessoryRequestFormPage /></ProtectedRoute>
          } />
          {/* Loans. requireRole={false} like the two forms above: borrowing
              a device is not an approver's or an admin's job, and a requester
              who has never filed anything else is exactly who books one. */}
          <Route path="/loan" element={
            <ProtectedRoute requireRole={false}><LoanFormPage /></ProtectedRoute>
          } />
          {/* Where the page lived when it only lent hotspots — kept so old
              bookmarks and links in people's mail still land somewhere. */}
          <Route path="/hotspot" element={<Navigate to="/loan" replace />} />
          <Route path="/success" element={<SuccessRedirect />} />
          <Route
            path="/requests"
            element={
              <ProtectedRoute requireRole={false}>
                <RequestTablePage />
              </ProtectedRoute>
            }
          />
          {/* The stock keeper's own page. requireRole={false} matches the
              requests route: a keeper is usually a REQUESTER, and the page
              gates itself on the assignment rather than on the role — see the
              empty state, which explains what to do instead. */}
          <Route
            path="/stock"
            element={
              <ProtectedRoute requireRole={false}>
                <StockPage />
              </ProtectedRoute>
            }
          />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/feedback" element={
            <ProtectedRoute requireRole={false}><FeedbackPage /></ProtectedRoute>
          } />
          {/* Troubleshooting. Three real routes, deliberately: the article
              carries its symptom in the URL so IT can send somebody a direct
              link to it. The bare /troubleshooting path redirects to the
              first device with content rather than rendering a deviceless
              state.

              The patterns come from lib/troubleshootingRoutes so the links
              are built from the same source that registers them — Phase 0's
              accessory deep link broke on exactly that mismatch. */}
          <Route path={TROUBLESHOOTING_ROUTES.index} element={
            <ProtectedRoute requireRole={false}><TroubleshootingPage /></ProtectedRoute>
          } />
          <Route path={TROUBLESHOOTING_ROUTES.subject} element={
            <ProtectedRoute requireRole={false}><TroubleshootingPage /></ProtectedRoute>
          } />
          <Route path={TROUBLESHOOTING_ROUTES.article} element={
            <ProtectedRoute requireRole={false}><TroubleshootingArticlePage /></ProtectedRoute>
          } />
          <Route path="/no-access" element={<NoAccessPage />} />
          {UiGallery && (
            <Route path="/dev/ui" element={<Suspense fallback={null}><UiGallery /></Suspense>} />
          )}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
      <Footer />
      </ToastProvider>
    </TourProvider>
  );
}

export default App;