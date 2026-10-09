"use client";

import { useRef, useState, useEffect } from "react";

interface VideoRecorderProps {
  onRecorded: (blob: Blob) => void;
  onClear?: () => void;
  existingUrl?: string | null;
}

const MAX_SECONDS = 120;

export default function VideoRecorder({ onRecorded, onClear, existingUrl }: VideoRecorderProps) {
  const [phase, setPhase] = useState<"idle" | "preview" | "recording" | "done">(existingUrl ? "done" : "idle");
  const [elapsed, setElapsed] = useState(0);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(existingUrl ?? null);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    stopStream();
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop();
    setPhase(existingUrl ? "done" : "idle");
    setRecordedUrl(existingUrl ?? null);
    setElapsed(0);
  }, [existingUrl]);

  useEffect(() => {
    if ((phase === "preview" || phase === "recording") && videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.muted = true;
      }
    }
  }, [phase]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      setPhase("preview");
      setError(null);
    } catch {
      setError("Camera access denied. Please allow camera & microphone permissions.");
    }
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const mr = new MediaRecorder(streamRef.current, { mimeType: "video/webm", videoBitsPerSecond: 600_000, audioBitsPerSecond: 64_000 }) // keeps a 2-minute clip around 10MB;
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      setRecordedUrl(url);
      onRecorded(blob);
      stopStream();
      setPhase("done");
    };
    mr.start();
    mediaRecorderRef.current = mr;
    setElapsed(0);
    setPhase("recording");

    timerRef.current = setInterval(() => {
      setElapsed((prev) => {
        if (prev + 1 >= MAX_SECONDS) {
          stopRecording();
          return MAX_SECONDS;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
    }
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const reset = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    stopStream();
    if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop();
    setRecordedUrl(null);
    setElapsed(0);
    setPhase("idle");
    onClear?.();
  };

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); stopStream(); }, []);

  const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="flex flex-col gap-3">
      {/* Video viewport */}
      <div
        className="relative w-full rounded-2xl overflow-hidden flex items-center justify-center"
        style={{ background: "#1a1a2e", minHeight: "180px" }}
      >
        {phase === "idle" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <span className="text-4xl">🎥</span>
            <p className="text-sm" style={{ color: "#b56a8a" }}>Click to open camera</p>
            <button
              type="button"
              onClick={startCamera}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #ff9ebd, #f06292)" }}
            >
              Open Camera
            </button>
          </div>
        )}

        {(phase === "preview" || phase === "recording") && (
          <>
            <video ref={videoRef} autoPlay playsInline className="w-full rounded-2xl" style={{ maxHeight: "220px", objectFit: "cover" }} />
            {phase === "recording" && (
              <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1 rounded-full"
                style={{ background: "rgba(0,0,0,0.6)" }}>
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-white text-xs font-mono font-semibold">{fmtTime(elapsed)} / 2:00</span>
              </div>
            )}
          </>
        )}

        {phase === "done" && recordedUrl && (
          <video src={recordedUrl} controls className="w-full rounded-2xl" style={{ maxHeight: "220px" }} />
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Controls */}
      <div className="flex gap-2">
        {phase === "preview" && (
          <button type="button" onClick={startRecording}
            className="flex-1 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #ff9ebd, #f06292)" }}>
            ⏺ Start Recording
          </button>
        )}
        {phase === "recording" && (
          <button type="button" onClick={stopRecording}
            className="flex-1 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ background: "#ef4444" }}>
            ⏹ Stop Recording
          </button>
        )}
        {phase === "done" && (
          <>
            <button type="button" onClick={reset}
              className="flex-1 py-2 rounded-xl text-sm font-semibold border transition-all hover:bg-[#fff0f5]"
              style={{ borderColor: "#ffe4e1", color: "#b56a8a" }}>
              🔄 Re-record
            </button>
            <span className="flex items-center px-3 rounded-xl text-xs font-semibold text-white"
              style={{ background: "#22c55e" }}>✓ Saved</span>
          </>
        )}
        {(phase === "idle") && null}
        {(phase !== "idle" && phase !== "done") && (
          <button type="button" onClick={reset}
            className="px-4 py-2 rounded-xl text-sm font-semibold border transition-all hover:bg-[#fff0f5]"
            style={{ borderColor: "#ffe4e1", color: "#b56a8a" }}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
