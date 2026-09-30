import { Loader2, Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const SEEK_SECONDS = 10;
const SPEED_STORAGE_KEY = 'javdb115.playback.speed';
const CONTROLS_HIDE_MS = 3000;
const DOUBLE_TAP_MS = 300;

type Props = {
  readonly src: string;
  readonly title: string;
  readonly onClose: () => void;
};

// iOS Safari 的 iPhone 不支持元素全屏，只能让 video 进入系统全屏
type WebkitVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };
type LockableOrientation = ScreenOrientation & { lock?: (orientation: string) => Promise<void> };

export function VideoPlayer({ src, title, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimerRef = useRef<number | undefined>(undefined);
  const hintTimerRef = useRef<number | undefined>(undefined);
  const lastTapRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(readSavedSpeed);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [seekHint, setSeekHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setControlsVisible(false);
    }, CONTROLS_HIDE_MS);
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => undefined);
    } else {
      video.pause();
    }
    showControls();
  }, [showControls]);

  const seekBy = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    const end = Number.isFinite(video.duration) ? video.duration : Number.POSITIVE_INFINITY;
    video.currentTime = Math.max(0, Math.min(end, video.currentTime + delta));
    setCurrent(video.currentTime);
    setSeekHint(delta > 0 ? `快进 ${delta} 秒` : `快退 ${-delta} 秒`);
    window.clearTimeout(hintTimerRef.current);
    hintTimerRef.current = window.setTimeout(() => setSeekHint(null), 700);
    showControls();
  }, [showControls]);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    const video = videoRef.current as WebkitVideo | null;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (container?.requestFullscreen) {
      container.requestFullscreen()
        .then(() => (screen.orientation as LockableOrientation | undefined)?.lock?.('landscape'))
        .catch(() => undefined);
      return;
    }
    video?.webkitEnterFullscreen?.();
  }, []);

  function close() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    onClose();
  }

  function changeSpeed(value: number) {
    if (videoRef.current) videoRef.current.playbackRate = value;
    setSpeed(value);
    window.localStorage.setItem(SPEED_STORAGE_KEY, String(value));
  }

  function handleSurfacePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const now = event.timeStamp;
    const isDouble = now - lastTapRef.current < DOUBLE_TAP_MS;
    lastTapRef.current = isDouble ? 0 : now;
    if (event.pointerType === 'mouse') {
      // 桌面：单击暂停/播放，双击全屏（两次单击的播放切换相互抵消）
      togglePlay();
      if (isDouble) toggleFullscreen();
      return;
    }
    if (!isDouble) {
      if (controlsVisible) {
        setControlsVisible(false);
      } else {
        showControls();
      }
      return;
    }
    // 触屏：双击左侧快退、右侧快进、中间暂停/播放
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    if (ratio < 1 / 3) {
      seekBy(-SEEK_SECONDS);
    } else if (ratio > 2 / 3) {
      seekBy(SEEK_SECONDS);
    } else {
      togglePlay();
    }
  }

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (event.key === ' ' || event.key === 'k') {
        event.preventDefault();
        togglePlay();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        seekBy(-SEEK_SECONDS);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        seekBy(SEEK_SECONDS);
      } else if (event.key === 'f') {
        toggleFullscreen();
      } else if (event.key === 'Escape' && !document.fullscreenElement) {
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, seekBy, toggleFullscreen, togglePlay]);

  useEffect(() => {
    const video = videoRef.current;
    return () => {
      window.clearTimeout(hideTimerRef.current);
      window.clearTimeout(hintTimerRef.current);
      // 主动断开视频流，避免关闭后浏览器继续经服务器拉取 115 数据
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
    };
  }, []);

  const visible = controlsVisible || !playing || Boolean(error);

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-[100] flex select-none items-center justify-center bg-black ${visible ? '' : 'cursor-none'}`}
      role="dialog"
      aria-modal="true"
      aria-label={`播放 ${title}`}
      onPointerMove={(event) => { if (event.pointerType === 'mouse') showControls(); }}
    >
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        src={src}
        autoPlay
        playsInline
        preload="metadata"
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          video.playbackRate = speed;
          setDuration(Number.isFinite(video.duration) ? video.duration : 0);
          if (video.videoWidth === 0) {
            setNotice('没有检测到视频画面，可能是 HEVC 等浏览器不支持的编码，建议改用本机播放器');
          }
        }}
        onDurationChange={(event) => {
          const value = event.currentTarget.duration;
          setDuration(Number.isFinite(value) ? value : 0);
        }}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        onPlay={() => { setPlaying(true); showControls(); }}
        onPause={() => { setPlaying(false); setControlsVisible(true); }}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
        onRateChange={(event) => setSpeed(event.currentTarget.playbackRate)}
        onError={(event) => {
          setBuffering(false);
          setError(mediaErrorMessage(event.currentTarget.error));
        }}
      />

      <div className="absolute inset-0" onPointerUp={handleSurfacePointerUp} aria-hidden="true" />

      {buffering && !error ? (
        <Loader2 className="pointer-events-none absolute animate-spin text-white/80" size={44} aria-label="缓冲中" />
      ) : null}
      {seekHint ? (
        <div className="pointer-events-none absolute rounded-full bg-black/60 px-4 py-2 text-sm text-white" role="status">{seekHint}</div>
      ) : null}
      {error ? (
        <div className="absolute mx-6 max-w-sm rounded-xl bg-black/75 p-4 text-center text-sm leading-6 text-white" role="alert">
          {error}
          <button className="mt-3 block min-h-10 w-full rounded-lg bg-white/15 text-sm" onClick={close} type="button">返回</button>
        </div>
      ) : null}

      <div className={`absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 pb-8 pt-[calc(0.75rem+env(safe-area-inset-top))] text-white transition-opacity ${visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        <button className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-white/15" onClick={close} type="button" aria-label="关闭播放">
          <X size={22} />
        </button>
        <p className="min-w-0 truncate text-sm">{title}</p>
      </div>

      <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-10 text-white transition-opacity ${visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        {notice ? <p className="mb-2 text-xs text-amber-200">{notice}</p> : null}
        <div className="flex items-center gap-3 text-xs tabular-nums">
          <span>{formatTime(current)}</span>
          <input
            className="h-1 min-w-0 flex-1 cursor-pointer accent-brand"
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(current, duration || 0)}
            disabled={!duration}
            aria-label="播放进度"
            onChange={(event) => {
              const video = videoRef.current;
              if (!video) return;
              video.currentTime = Number(event.target.value);
              setCurrent(video.currentTime);
              showControls();
            }}
          />
          <span>{formatTime(duration)}</span>
        </div>
        <div className="mt-2 flex items-center gap-1">
          <ControlButton label={`快退 ${SEEK_SECONDS} 秒`} onClick={() => seekBy(-SEEK_SECONDS)}>
            <RotateCcw size={20} /><span className="text-[10px]">{SEEK_SECONDS}</span>
          </ControlButton>
          <ControlButton label={playing ? '暂停' : '播放'} onClick={togglePlay}>
            {playing ? <Pause size={24} /> : <Play size={24} />}
          </ControlButton>
          <ControlButton label={`快进 ${SEEK_SECONDS} 秒`} onClick={() => seekBy(SEEK_SECONDS)}>
            <RotateCw size={20} /><span className="text-[10px]">{SEEK_SECONDS}</span>
          </ControlButton>
          <div className="flex-1" />
          <label className="flex items-center text-xs">
            <span className="sr-only">播放倍速</span>
            <select
              className="min-h-10 rounded-lg bg-white/15 px-2 text-sm text-white"
              value={speed}
              onChange={(event) => changeSpeed(Number(event.target.value))}
            >
              {SPEEDS.map((value) => (
                <option className="text-ink" key={value} value={value}>{value}x</option>
              ))}
            </select>
          </label>
          <ControlButton label={fullscreen ? '退出全屏' : '全屏'} onClick={toggleFullscreen}>
            {fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
          </ControlButton>
        </div>
      </div>
    </div>
  );
}

function ControlButton({ label, onClick, children }: { readonly label: string; readonly onClick: () => void; readonly children: ReactNode }) {
  return (
    <button className="flex h-11 min-w-11 items-center justify-center gap-0.5 rounded-full px-2 hover:bg-white/15" onClick={onClick} type="button" aria-label={label} title={label}>
      {children}
    </button>
  );
}

function readSavedSpeed(): number {
  const saved = Number(window.localStorage.getItem(SPEED_STORAGE_KEY));
  return SPEEDS.includes(saved) ? saved : 1;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
}

function mediaErrorMessage(error: MediaError | null): string {
  if (error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED || error?.code === MediaError.MEDIA_ERR_DECODE) {
    return '浏览器无法解码这个视频（常见于 MKV/AVI/WMV 或 HEVC 编码），请返回改用本机播放器（如 VLC）播放。';
  }
  if (error?.code === MediaError.MEDIA_ERR_NETWORK) {
    return '视频流加载中断，可能是服务器带宽不足或 115 直链失效，请返回后重试。';
  }
  return '视频播放失败，请返回后重试或改用本机播放器。';
}
