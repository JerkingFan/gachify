const DONE_KEY = "gachify:onboarding-v1-done";
const KARAOKE_KEY = "gachify:onboarding-karaoke";

export function isOnboardingDone(): boolean {
  return localStorage.getItem(DONE_KEY) === "1";
}

export function dismissOnboarding(): void {
  localStorage.setItem(DONE_KEY, "1");
}

export function markOnboardingKaraoke(): void {
  localStorage.setItem(KARAOKE_KEY, "1");
}

export function hasOnboardingKaraoke(): boolean {
  return localStorage.getItem(KARAOKE_KEY) === "1";
}
