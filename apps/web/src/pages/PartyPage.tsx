import { Copy, Headphones, Loader2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/api/client";
import { TopBar } from "@/components/layout/TopBar";
import {
  getStoredPartyHost,
  storePartyHost,
  useListeningParty,
} from "@/hooks/useListeningParty";

export function PartyPage() {
  const { code: routeCode } = useParams<{ code?: string }>();
  const navigate = useNavigate();
  const [code, setCode] = useState(routeCode ?? "");
  const [hostToken, setHostToken] = useState<string | null>(
    routeCode ? getStoredPartyHost(routeCode) : null,
  );
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [joinCode, setJoinCode] = useState("");

  useListeningParty(code || null, hostToken);

  useEffect(() => {
    if (routeCode) {
      setCode(routeCode);
      setHostToken(getStoredPartyHost(routeCode));
    }
  }, [routeCode]);

  const partyUrl =
    typeof window !== "undefined" && code ? `${window.location.origin}/party/${code}` : "";

  const startParty = async () => {
    setBusy(true);
    try {
      const res = await api.createListeningParty();
      storePartyHost(res.code, res.host_token);
      setCode(res.code);
      setHostToken(res.host_token);
      navigate(`/party/${res.code}`, { replace: true });
    } finally {
      setBusy(false);
    }
  };

  const joinParty = () => {
    const c = joinCode.trim().toLowerCase();
    if (!c) return;
    setCode(c);
    setHostToken(null);
    navigate(`/party/${c}`);
  };

  const copyLink = async () => {
    if (!partyUrl) return;
    try {
      await navigator.clipboard.writeText(partyUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const isHost = Boolean(hostToken);

  return (
    <>
      <TopBar title="Listening party" />
      <div className="mx-auto max-w-lg flex-1 overflow-y-auto px-6 pb-10">
        <div className="mb-8 flex items-center gap-3">
          <Users className="h-8 w-8 text-spotify-green" />
          <div>
            <h1 className="text-2xl font-black">Listening party</h1>
            <p className="text-sm text-spotify-muted">One queue — host presses play, everyone syncs</p>
          </div>
        </div>

        {!code ? (
          <div className="space-y-6">
            <button
              type="button"
              disabled={busy}
              onClick={() => void startParty()}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-spotify-green py-3 text-sm font-bold text-black disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Headphones className="h-5 w-5" />}
              Start a party
            </button>
            <div className="rounded-lg bg-spotify-highlight p-4">
              <p className="mb-2 text-sm font-semibold">Join with code</p>
              <div className="flex gap-2">
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="Party code"
                  className="flex-1 rounded-md bg-spotify-base px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={joinParty}
                  className="rounded-full bg-white px-4 py-2 text-sm font-bold text-black"
                >
                  Join
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-white/10 bg-spotify-highlight p-5">
            <p className="text-xs uppercase text-spotify-muted">
              {isHost ? "You are the host" : "Guest · synced to host"}
            </p>
            <p className="mt-2 font-mono text-2xl font-bold tracking-widest">{code}</p>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold hover:bg-white/10"
            >
              <Copy className="h-4 w-4" />
              {copied ? "Copied!" : "Copy invite link"}
            </button>
            <p className="mt-4 text-sm text-spotify-muted">
              {isHost
                ? "Play, pause, and skip from the player — guests follow automatically."
                : "Playback follows the host. You can still adjust volume locally."}
            </p>
            <Link to="/" className="mt-4 inline-block text-sm text-spotify-green underline">
              Back to listening
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
