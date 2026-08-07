import { Routes, Route } from "react-router-dom";
import RequestFormPage from "@/pages/RequestFormPage";
import AccessoryRequestFormPage from "@/pages/AccessoryFormPage";
import SuccessRedirect from "@/pages/SuccessRedirect";
import RequestTablePage from "@/pages/RequestsTablePage"
import Navbar from "./components/nav/Navbar";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import NoAccessPage from "./pages/NoAccessPage";
import SettingsPage from "./pages/SettingsPage";
import NotFoundPage from "./pages/NotFoundPage";
import LandingPage from "./pages/Home";
import FeedbackPage from "./pages/FeedbackPage";
import TroubleshootingPage from "./pages/TroubleshootingPage";
import TroubleshootingArticlePage from "./pages/TroubleshootingArticlePage";
import Footer from "./components/footer/Footer";

function App() {
  return (
    <>
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
          <Route path="/success" element={<SuccessRedirect />} />
          <Route
            path="/requests"
            element={
              <ProtectedRoute requireRole={false}>
                <RequestTablePage />
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
              state. */}
          <Route path="/troubleshooting" element={
            <ProtectedRoute requireRole={false}><TroubleshootingPage /></ProtectedRoute>
          } />
          <Route path="/troubleshooting/:deviceKey" element={
            <ProtectedRoute requireRole={false}><TroubleshootingPage /></ProtectedRoute>
          } />
          <Route path="/troubleshooting/:deviceKey/:symptomId" element={
            <ProtectedRoute requireRole={false}><TroubleshootingArticlePage /></ProtectedRoute>
          } />
          <Route path="/no-access" element={<NoAccessPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
      <Footer />
    </>
  );
}

export default App;