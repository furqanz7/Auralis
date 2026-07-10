import { Route, Routes } from "react-router-dom";
import { HomePage } from "../App.jsx";
import ApplicationPage from "../hiring/pages/ApplicationPage.jsx";
import PrivateApplicationPage from "../hiring/pages/PrivateApplicationPage.jsx";
import AssessmentPage from "../hiring/pages/AssessmentPage.jsx";
import VerificationPage from "../hiring/pages/VerificationPage.jsx";
import ApplicationCompletePage from "../hiring/pages/ApplicationCompletePage.jsx";
import PrivacyPage from "../hiring/pages/PrivacyPage.jsx";
import PrivacyDeletionPage from "../hiring/pages/PrivacyDeletionPage.jsx";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/apply" element={<ApplicationPage />} />
      <Route
        path="/apply/:roleSlug/:campaignToken"
        element={<PrivateApplicationPage />}
      />
      <Route path="/assessment/:token" element={<AssessmentPage />} />
      <Route path="/verify/:token" element={<VerificationPage />} />
      <Route
        path="/application/:reference/complete/:returnToken"
        element={<ApplicationCompletePage />}
      />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/privacy/delete/:token" element={<PrivacyDeletionPage />} />
      <Route path="*" element={<HomePage />} />
    </Routes>
  );
}
