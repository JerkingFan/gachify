import { test, expect } from "@playwright/test";

const apiURL = process.env.GACHIFY_E2E_API_URL ?? "http://localhost:8080";
const adminSecret = process.env.GACHIFY_E2E_ADMIN_SECRET ?? "e2e-admin-secret";
const unique = Date.now();

test("moderation: seed pending → admin approve → play", async ({ page, request }) => {
  // Seed a pending_review track (development allows /internal/seed without key)
  const usersRes = await request.get(`${apiURL}/api/v1/tracks?limit=1`);
  expect(usersRes.ok()).toBeTruthy();
  const existing = await usersRes.json();
  const creatorId =
    existing.items?.[0]?.creator_id ??
    (await seedCreator(request));

  const title = `E2E Pending ${unique}`;
  const seedRes = await request.post(`${apiURL}/internal/seed/tracks`, {
    data: {
      creator_id: creatorId,
      title,
      duration_ms: 120000,
      status: "pending_review",
      gachi_metadata: { preview_url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" },
    },
  });
  expect(seedRes.ok()).toBeTruthy();
  const track = await seedRes.json();
  const trackId = track.id as string;

  // Not visible as published yet
  const listBefore = await request.get(`${apiURL}/api/v1/tracks?q=${encodeURIComponent(title)}`);
  const beforeBody = await listBefore.json();
  expect(beforeBody.items?.some((t: { id: string }) => t.id === trackId)).toBeFalsy();

  // Admin approve
  const approve = await request.post(`${apiURL}/internal/admin/tracks/${trackId}/approve`, {
    headers: { "X-Gachify-Admin-Key": adminSecret },
  });
  expect(approve.ok()).toBeTruthy();

  // Register listener and open track page
  await page.goto(`/track/${trackId}`);
  await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: /play/i }).first().click();
  await expect(page.getByTestId("player-bar")).toBeVisible({ timeout: 10_000 });
});

async function seedCreator(request: import("@playwright/test").APIRequestContext): Promise<string> {
  const res = await request.post(`${apiURL}/internal/seed/users`, {
    data: {
      handle: `e2e_creator_${unique}`,
      display_name: "E2E Creator",
    },
  });
  expect(res.ok()).toBeTruthy();
  const user = await res.json();
  return user.id as string;
}
