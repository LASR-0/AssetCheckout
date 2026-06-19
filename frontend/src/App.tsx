import { Routes, Route } from "react-router-dom";
import RequestFormPage from "@/pages/RequestFormPage";
import SuccessRedirect from "@/pages/SuccessRedirect";
import RequestTablePage from "@/pages/RequestsTablePage"
import Navbar from "./components/nav/Navbar";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import NoAccessPage from "./pages/NoAccessPage";
import SettingsPage from "./pages/SettingsPage";
import NotFoundPage from "./pages/NotFoundPage";
import LandingPage from "./pages/Home";

function App() {
  return (
    <>
      <Navbar />
      <div className="pt-16">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/checkout" element={
            <ProtectedRoute requireRole={false}><RequestFormPage /></ProtectedRoute>
          } />
          <Route path="/success" element={<SuccessRedirect />} />
          <Route
            path="/requests"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "MANAGER", "REQUESTER"]}>
                <RequestTablePage />
              </ProtectedRoute>
            }
          />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/no-access" element={<NoAccessPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
    </>
  );
}

export default App;