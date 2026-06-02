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
import { DiscoverPage } from "@/pages/DiscoverPage";
import { FollowingFeedPage } from "@/pages/FollowingFeedPage";
import { PlaylistJoinPage } from "@/pages/PlaylistJoinPage";
import { AdminPage } from "@/pages/AdminPage";
import { UploadPage } from "@/pages/UploadPage";
import { TrackPage } from "@/pages/TrackPage";
import { ArtistPage } from "@/pages/ArtistPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { SettingsPage } from "@/pages/SettingsPage";
import { EmbedTrackPage } from "@/pages/EmbedTrackPage";
import { CreatorHubPage } from "@/pages/CreatorHubPage";
import { ChartsPage } from "@/pages/ChartsPage";
import { TagDiscoverPage } from "@/pages/TagDiscoverPage";
import { PartyPage } from "@/pages/PartyPage";
import { UserHandleRedirectPage } from "@/pages/UserHandleRedirectPage";

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
          <Route path="/embed/track/:id" element={<EmbedTrackPage />} />
          <Route path="/u/:handle" element={<UserHandleRedirectPage />} />
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="discover" element={<DiscoverPage />} />
            <Route path="charts" element={<ChartsPage />} />
            <Route path="tag/:slug" element={<TagDiscoverPage variant="tag" />} />
            <Route path="mood/:slug" element={<TagDiscoverPage variant="mood" />} />
            <Route path="party/:code?" element={<PartyPage />} />
            <Route path="following" element={<FollowingFeedPage />} />
            <Route path="profile/:id" element={<ProfilePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="creator" element={<CreatorHubPage />} />
            <Route path="library" element={<LibraryPage />} />
            <Route path="playlist/join/:token" element={<PlaylistJoinPage />} />
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
