"use client";

import { useRef, useState, useEffect } from "react";

interface VoiceRecorderProps {
  onRecorded: (blob: Blob) => void;
}

const MAX_SECONDS = 120;

export default function VoiceRecorder({ onRecorded }: VoiceRecorderProps) {
  const [phase, setPhase] = useState<"idle" | "recording" | "done">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bars, setBars] = useState<number[]>(Array(20).fill(4));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Setup audio analyser for waveform animation
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setRecordedUrl(URL.createObjectURL(blob));
        onRecorded(blob);
        stopStream();
        setPhase("done");
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setElapsed(0);
      setPhase("recording");
      setError(null);

      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          if (prev + 1 >= MAX_SECONDS) { stopRecording(); return MAX_SECONDS; }
          return prev + 1;
        });
      }, 1000);

      // Waveform animation
      animRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        const newBars = Array.from({ length: 20 }, (_, i) => {
          const v = data[Math.floor(i * data.length / 20)] || 0;
          return Math.max(4, Math.round((v / 255) * 48));
        });
        setBars(newBars);
      }, 80);

    } catch {
      setError("Microphone access denied. Please allow microphone permissions.");
    }
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (animRef.current) clearInterval(animRef.current);
    setBars(Array(20).fill(4));
    if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop();
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
  };

  const reset = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (animRef.current) clearInterval(animRef.current);
    if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop();
    stopStream();
    setRecordedUrl(null);
    setElapsed(0);
    setBars(Array(20).fill(4));
    setPhase("idle");
  };

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (animRef.current) clearInterval(animRef.current);
    stopStream();
  }, []);

  const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const progress = (elapsed / MAX_SECONDS) * 100;

  return (
    <div className="flex flex-col gap-3">
      {/* Visualiser card */}
      <div
        className="relative w-full rounded-2xl p-5 flex flex-col items-center gap-4"
        style={{ background: phase === "recording" ? "#fff0f5" : "#fafafa", border: "1px solid #ffe4e1", minHeight: "130px" }}
      >
        {phase === "idle" && (
          <div className="flex flex-col items-center gap-2 py-2">
            <span className="text-4xl">🎧</span>
            <p className="text-sm" style={{ color: "#b56a8a" }}>Press record to start your voice note</p>
          </div>
        )}

        {phase === "recording" && (
          <>
            {/* Waveform bars */}
            <div className="flex items-center justify-center gap-1 h-14 w-full">
              {bars.map((h, i) => (
                <div
                  key={i}
                  className="rounded-full transition-all duration-75"
                  style={{
                    width: "5px",
                    height: `${h}px`,
                    background: `linear-gradient(180deg, #ff9ebd, #f06292)`,
                    opacity: 0.7 + (h / 48) * 0.3,
                  }}
                />
              ))}
            </div>

            {/* Timer */}
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="font-mono text-sm font-bold" style={{ color: "#d6528a" }}>
                {fmtTime(elapsed)} / 2:00
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 rounded-full" style={{ background: "#ffe4e1" }}>
              <div
                className="h-1.5 rounded-full transition-all duration-1000"
                style={{ width: `${progress}%`, background: "linear-gradient(90deg, #ff9ebd, #f06292)" }}
              />
            </div>
          </>
        )}

        {phase === "done" && recordedUrl && (
          <div className="flex flex-col items-center gap-2 w-full">
            <span className="text-2xl">✅</span>
            <audio src={recordedUrl} controls className="w-full" style={{ borderRadius: "12px" }} />
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Controls */}
      <div className="flex gap-2">
        {phase === "idle" && (
          <button type="button" onClick={startRecording}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #ff9ebd, #f06292)" }}>
            🎙️ Start Recording
          </button>
        )}
        {phase === "recording" && (
          <>
            <button type="button" onClick={stopRecording}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ background: "#ef4444" }}>
              ⏹ Stop
            </button>
            <button type="button" onClick={reset}
              className="px-4 py-2 rounded-xl text-sm font-semibold border transition-all hover:bg-[#fff0f5]"
              style={{ borderColor: "#ffe4e1", color: "#b56a8a" }}>
              Cancel
            </button>
          </>
        )}
        {phase === "done" && (
          <button type="button" onClick={reset}
            className="flex-1 py-2 rounded-xl text-sm font-semibold border transition-all hover:bg-[#fff0f5]"
            style={{ borderColor: "#ffe4e1", color: "#b56a8a" }}>
            🔄 Re-record
          </button>
        )}
      </div>
    </div>
  );
}
