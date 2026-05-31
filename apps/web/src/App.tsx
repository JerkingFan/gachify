import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthBootstrap } from "@/components/auth/AuthBootstrap";
import { AppShell } from "@/components/layout/AppShell";
import { HomePage } from "@/pages/HomePage";
import { LibraryPage } from "@/pages/LibraryPage";
import { LoginPage } from "@/pages/LoginPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { VerifyEmailPage } from "@/pages/VerifyEmailPage";
import { AuthCallbackGuard } from "@/pages/AuthCallbackPage";
import { PlaylistPage } from "@/pages/PlaylistPage";
import { SearchPage } from "@/pages/SearchPage";
import { UploadPage } from "@/pages/UploadPage";
import { TrackPage } from "@/pages/TrackPage";
import { ArtistPage } from "@/pages/ArtistPage";
import { AdminPage } from "@/pages/AdminPage";

export default function App() {
  return (
    <AuthBootstrap>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/auth/callback/google" element={<AuthCallbackGuard />} />
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="library" element={<LibraryPage />} />
            <Route path="playlist/:id" element={<PlaylistPage />} />
            <Route path="upload" element={<UploadPage />} />
            <Route path="track/:id" element={<TrackPage />} />
            <Route path="artist/:id" element={<ArtistPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthBootstrap>
  );
}
