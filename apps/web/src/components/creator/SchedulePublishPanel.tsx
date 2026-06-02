import { CalendarClock, Rocket } from "lucide-react";
import { useState } from "react";
import { api } from "@/api/client";
import type { Track } from "@/types";

export function SchedulePublishPanel({
  track,
  onUpdated,
}: {
  track: Track;
  onUpdated: (t: Track) => void;
}) {
  const defaultWhen = track.scheduled_publish_at
    ? track.scheduled_publish_at.slice(0, 16)
    : "";
  const [when, setWhen] = useState(defaultWhen);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const saveSchedule = async () => {
    if (!when) return;
    setBusy(true);
    setMessage("");
    try {
      const iso = new Date(when).toISOString();
      const updated = await api.scheduleTrackPublish(track.id, iso);
      onUpdated(updated);
      setMessage("Release scheduled — worker publishes automatically.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Schedule failed");
    } finally {
      setBusy(false);
    }
  };

  const publishNow = async () => {
    setBusy(true);
    setMessage("");
    try {
      const updated = await api.publishTrackNow(track.id);
      onUpdated(updated);
      setMessage("Your remix is live in the catalog.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-8 rounded-lg border border-spotify-green/30 bg-spotify-green/10 p-5">
      <div className="mb-3 flex items-center gap-2">
        <CalendarClock className="h-5 w-5 text-spotify-green" />
        <h2 className="text-lg font-bold">Approved — schedule your drop</h2>
      </div>
      <p className="mb-4 text-sm text-spotify-muted">
        Moderation passed. Pick a go-live time or publish immediately.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="text-spotify-muted">Go live at</span>
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="mt-1 block rounded-md bg-spotify-black px-3 py-2 text-white"
          />
        </label>
        <button
          type="button"
          disabled={busy || !when}
          onClick={() => void saveSchedule()}
          className="rounded-full bg-spotify-highlight px-4 py-2 text-sm font-semibold hover:bg-spotify-elevated disabled:opacity-50"
        >
          Schedule
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void publishNow()}
          className="inline-flex items-center gap-2 rounded-full bg-spotify-green px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
        >
          <Rocket className="h-4 w-4" />
          Publish now
        </button>
      </div>
      {track.scheduled_publish_at && (
        <p className="mt-3 text-xs text-spotify-muted">
          Scheduled: {new Date(track.scheduled_publish_at).toLocaleString()}
        </p>
      )}
      {message && <p className="mt-3 text-sm text-spotify-green">{message}</p>}
    </section>
  );
}
