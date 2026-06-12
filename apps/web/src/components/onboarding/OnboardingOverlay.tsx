import { type ReactNode, useEffect, useState } from "react";
import { Check, Heart, ListMusic, Mic2, UserPlus, X } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import {
  dismissOnboarding,
  hasOnboardingKaraoke,
  isOnboardingDone,
  markOnboardingKaraoke,
} from "@/lib/onboarding";
import { useAuthStore } from "@/store/authStore";
import { useLibraryStore } from "@/store/libraryStore";
import { useUIStore } from "@/store/uiStore";

export function OnboardingOverlay() {
  const [visible, setVisible] = useState(false);
  const [followingCount, setFollowingCount] = useState(0);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const likedIds = useLibraryStore((s) => s.likedIds);
  const playlists = useLibraryStore((s) => s.playlists);
  const karaokeFullscreen = useUIStore((s) => s.karaokeFullscreenOpen);
  const expandKaraoke = useUIStore((s) => s.expandKaraokeInNowPlaying);

  useEffect(() => {
    if (isOnboardingDone()) return;
    setVisible(true);
  }, []);

  useEffect(() => {
    if (karaokeFullscreen || expandKaraoke) markOnboardingKaraoke();
  }, [karaokeFullscreen, expandKaraoke]);

  useEffect(() => {
    if (!isAuthenticated) {
      setFollowingCount(0);
      return;
    }
    void api.getFollowing().then((r) => {
      setFollowingCount(r.items?.length ?? r.user_ids.length);
    });
  }, [isAuthenticated]);

  const step1 = likedIds.size > 0;
  const step2 = playlists.length > 0;
  const step3 = followingCount > 0 || hasOnboardingKaraoke();
  const allDone = step1 && step2 && step3;

  useEffect(() => {
    if (allDone && visible) {
      const t = window.setTimeout(() => {
        dismissOnboarding();
        setVisible(false);
      }, 1200);
      return () => clearTimeout(t);
    }
  }, [allDone, visible]);

  if (!visible) return null;

  const dismiss = () => {
    dismissOnboarding();
    setVisible(false);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--gachify-mobile-chrome-h)+12px)] z-[70] flex justify-center px-4 md:bottom-24">
      <div className="pointer-events-auto w-full max-w-lg rounded-xl border border-white/10 bg-spotify-elevated/95 p-4 shadow-2xl backdrop-blur-md">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-spotify-green">
              Quick start
            </p>
            <h2 className="text-lg font-bold">Three steps to feel at home</h2>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-full p-1.5 text-spotify-muted hover:bg-white/10 hover:text-white"
            aria-label="Dismiss onboarding"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ol className="space-y-2 text-sm">
          <Step done={step1} icon={Heart} label="Like a remix" hint="Press M on any track" />
          <Step
            done={step2}
            icon={ListMusic}
            label="Save a playlist"
            hint={
              <Link to="/library" className="text-spotify-green hover:underline">
                Open Library
              </Link>
            }
          />
          <Step
            done={step3}
            icon={isAuthenticated ? UserPlus : Mic2}
            label={isAuthenticated ? "Follow a creator or open karaoke" : "Try karaoke (L)"}
            hint={
              isAuthenticated ? (
                <Link to="/following?tab=artists" className="text-spotify-green hover:underline">
                  Following
                </Link>
              ) : (
                "Log in to follow artists"
              )
            }
          />
        </ol>
        {allDone && (
          <p className="mt-3 text-center text-sm font-semibold text-spotify-green">
            You are all set — enjoy the dungeon.
          </p>
        )}
      </div>
    </div>
  );
}

function Step({
  done,
  icon: Icon,
  label,
  hint,
}: {
  done: boolean;
  icon: typeof Heart;
  label: string;
  hint: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg bg-spotify-black/40 px-3 py-2">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          done ? "bg-spotify-green text-black" : "bg-spotify-highlight text-spotify-muted"
        }`}
      >
        {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={done ? "text-spotify-muted line-through" : "font-medium"}>{label}</p>
        <p className="text-xs text-spotify-muted">{hint}</p>
      </div>
    </li>
  );
}
