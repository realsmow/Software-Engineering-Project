import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { HOME_ROUTE_BY_ROLE, ROUTES } from "@/constants";
import { useAuthStore } from "@/features/auth/auth.store";

/**
 * Easter egg: plays Bad Apple!!, then goes home.
 *
 * Reachable only by typing `rule86` into the command palette - it is
 * deliberately absent from `constants/navigation.ts`, so no sidebar, tab bar
 * or palette listing ever points here.
 *
 * The video is embedded from YouTube rather than copied into the repo: it is
 * not ours to ship, and the embed plays on any machine. YouTube's player API
 * is what tells us the video ended; a plain iframe cannot.
 */
const VIDEO_ID = "9lNZ_Rnr7Jc";
const API_SRC = "https://www.youtube.com/iframe_api";
const PLAYING = 1;
const ENDED = 0;

interface YtPlayer {
  playVideo(): void;
  mute(): void;
  getPlayerState(): number;
  destroy(): void;
}
interface YtNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars: Record<string, number>;
      events: {
        onReady?: (e: { target: YtPlayer }) => void;
        onStateChange?: (e: { data: number }) => void;
      };
    },
  ) => YtPlayer;
}
type YtWindow = Window & { YT?: YtNamespace; onYouTubeIframeAPIReady?: () => void };

/** Loads the player API once per page load. */
function loadApi(): Promise<YtNamespace> {
  const w = window as YtWindow;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  return new Promise((resolve) => {
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(w.YT!);
    };
    if (!document.querySelector(`script[src="${API_SRC}"]`)) {
      const script = document.createElement("script");
      script.src = API_SRC;
      document.head.appendChild(script);
    }
  });
}

export default function Rule86Page() {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const host = useRef<HTMLDivElement>(null);

  const goHome = useCallback(() => {
    navigate(role ? HOME_ROUTE_BY_ROLE[role] : ROUTES.HOME, { replace: true });
  }, [navigate, role]);

  useEffect(() => {
    let player: YtPlayer | null = null;
    let cancelled = false;
    let fallback: number | undefined;
    void loadApi().then((YT) => {
      if (cancelled || !host.current) return;
      player = new YT.Player(host.current, {
        videoId: VIDEO_ID,
        playerVars: { autoplay: 1, controls: 1, rel: 0, playsinline: 1 },
        events: {
          onReady: ({ target }) => {
            target.playVideo();
            // A browser that blocks autoplay with sound still allows it muted.
            fallback = window.setTimeout(() => {
              if (target.getPlayerState() !== PLAYING) {
                target.mute();
                target.playVideo();
              }
            }, 1500);
          },
          onStateChange: ({ data }) => {
            if (data === ENDED) goHome();
          },
        },
      });
    });
    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
      player?.destroy();
    };
  }, [goHome]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") goHome();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goHome]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-black text-white">
      <div className="aspect-video w-full max-w-[min(100vw,160vh)] [&>iframe]:h-full [&>iframe]:w-full">
        {/* The API replaces this div with the player's iframe. */}
        <div ref={host} />
      </div>
      {/* A button too: once the video has focus, Esc goes to the player. */}
      <button
        type="button"
        onClick={goHome}
        className="rounded border border-white/30 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.3em] text-white/70 hover:border-white/60 hover:text-white"
      >
        rule86 &middot; back to home
      </button>
    </div>
  );
}
