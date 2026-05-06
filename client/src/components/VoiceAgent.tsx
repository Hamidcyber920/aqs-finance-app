/**
 * VoiceAgent — Floating AI voice assistant
 *
 * Features:
 * - Hold-to-talk mic button (floating, bottom-right)
 * - Records audio via MediaRecorder API
 * - Uploads to S3, transcribes via Whisper
 * - Sends transcript to LLM agent (function-calling)
 * - Displays transcript + agent response
 * - Plays TTS audio response automatically
 * - Navigates to correct page and pre-fills forms if agent returns a navigation action
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, X, Volume2, Loader2, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

interface VoiceAgentProps {
  /** Expose a setter so parent pages can pre-fill forms */
  onFormFill?: (page: string, fields: Record<string, unknown>) => void;
}

type AgentState = "idle" | "recording" | "uploading" | "transcribing" | "thinking" | "speaking" | "done" | "error";

interface Message {
  role: "user" | "agent";
  text: string;
  audioUrl?: string | null;
}

export function VoiceAgent({ onFormFill }: VoiceAgentProps) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<AgentState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const transcribeMutation = trpc.voiceAgent.transcribe.useMutation();
  const queryMutation = trpc.voiceAgent.query.useMutation();

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      cancelAnimationFrame(animFrameRef.current);
      audioContextRef.current?.close();
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Set up audio level analyser for waveform visualisation
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioContextRef.current = ctx;
      analyserRef.current = analyser;

      const animateLevel = () => {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setAudioLevel(avg / 128);
        animFrameRef.current = requestAnimationFrame(animateLevel);
      };
      animateLevel();

      // Start recording
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.start(100);
      mediaRecorderRef.current = recorder;

      setState("recording");
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    } catch (err) {
      toast.error("Microphone access denied. Please allow microphone access to use the voice agent.");
      setState("error");
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current || state !== "recording") return;

    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    cancelAnimationFrame(animFrameRef.current);
    setAudioLevel(0);

    const recorder = mediaRecorderRef.current;
    recorder.stream.getTracks().forEach(t => t.stop());
    audioContextRef.current?.close();

    await new Promise<void>(resolve => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });

    const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
    if (blob.size < 1000) {
      setState("idle");
      toast.info("Recording too short — please hold the button and speak.");
      return;
    }

    await processAudio(blob);
  }, [state]);

  const processAudio = async (blob: Blob) => {
    setState("uploading");
    try {
      // Upload audio to S3 via the file upload endpoint
      const formData = new FormData();
      const ext = blob.type.includes("mp4") ? "m4a" : "webm";
      formData.append("file", blob, `voice-${Date.now()}.${ext}`);

      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const { url: audioUrl } = await uploadRes.json();

      // Transcribe
      setState("transcribing");
      const { transcript } = await transcribeMutation.mutateAsync({ audioUrl });
      if (!transcript?.trim()) {
        setState("idle");
        toast.info("Couldn't hear anything clearly — please try again.");
        return;
      }

      setMessages(prev => [...prev, { role: "user", text: transcript }]);

      // Query the agent
      setState("thinking");
      const currentPage = window.location.pathname.replace("/", "") || "dashboard";
      const response = await queryMutation.mutateAsync({ transcript, currentPage, withTts: true });

      setMessages(prev => [...prev, { role: "agent", text: response.answer, audioUrl: response.audioUrl }]);

      // Handle navigation action
      if (response.navigationAction) {
        const { page, prefillFields } = response.navigationAction;
        setTimeout(() => {
          navigate(`/${page}`);
          if (prefillFields && onFormFill) {
            onFormFill(page, prefillFields);
          }
        }, 1500);
      }

      // Play TTS audio
      if (response.audioUrl) {
        setState("speaking");
        const audio = new Audio(response.audioUrl);
        audioRef.current = audio;
        audio.onended = () => setState("done");
        audio.onerror = () => setState("done");
        await audio.play().catch(() => setState("done"));
      } else {
        setState("done");
      }
    } catch (err: any) {
      console.error("[VoiceAgent]", err);
      setState("error");
      setMessages(prev => [...prev, { role: "agent", text: "Sorry, something went wrong. Please try again." }]);
    }
  };

  const stopSpeaking = () => {
    audioRef.current?.pause();
    setState("done");
  };

  const resetAgent = () => {
    setState("idle");
    setMessages([]);
    setRecordingSeconds(0);
  };

  const stateLabel: Record<AgentState, string> = {
    idle: "Hold to speak",
    recording: `Recording… ${recordingSeconds}s`,
    uploading: "Processing…",
    transcribing: "Transcribing…",
    thinking: "Thinking…",
    speaking: "Speaking…",
    done: "Hold to speak",
    error: "Error — try again",
  };

  const isBusy = ["uploading", "transcribing", "thinking"].includes(state);

  return (
    <>
      {/* Floating mic button */}
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "fixed bottom-20 right-4 z-50 w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-300",
          "sm:bottom-6",
          open
            ? "bg-red-500 hover:bg-red-600 text-white"
            : "bg-gradient-to-br from-emerald-600 to-emerald-800 hover:from-emerald-500 hover:to-emerald-700 text-white"
        )}
        title="AI Voice Assistant"
        aria-label="AI Voice Assistant"
      >
        {open ? <X className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
        {/* Pulsing ring when recording */}
        {state === "recording" && (
          <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-60" />
        )}
      </button>

      {/* Agent panel */}
      {open && (
        <div className={cn(
          "fixed z-40 bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300",
          "bottom-36 right-4 w-[calc(100vw-2rem)] max-w-sm",
          "sm:bottom-24 sm:right-4 sm:w-96",
        )}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-emerald-700 to-emerald-900 text-white">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              <span className="font-semibold text-sm">AQS Finance Assistant</span>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button onClick={resetAgent} className="text-white/70 hover:text-white text-xs px-2 py-1 rounded">
                  Clear
                </button>
              )}
              <button onClick={() => setIsExpanded(e => !e)} className="text-white/70 hover:text-white p-1">
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {isExpanded && (
            <>
              {/* Message history */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3 max-h-64 min-h-[80px]">
                {messages.length === 0 && (
                  <div className="text-center text-muted-foreground text-sm py-4">
                    <Sparkles className="w-8 h-8 mx-auto mb-2 text-emerald-500 opacity-50" />
                    <p>Ask me anything about AQS finances.</p>
                    <p className="text-xs mt-1 opacity-70">Try: "What are this month's expenses?" or "Add payroll for Ahmed, £1,200"</p>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                      msg.role === "user"
                        ? "bg-emerald-600 text-white rounded-br-sm"
                        : "bg-muted text-foreground rounded-bl-sm"
                    )}>
                      <p className="leading-relaxed">{msg.text}</p>
                      {msg.role === "agent" && msg.audioUrl && (
                        <button
                          onClick={() => { const a = new Audio(msg.audioUrl!); a.play(); }}
                          className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <Volume2 className="w-3 h-3" /> Replay
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {isBusy && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2 flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {stateLabel[state]}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Mic control */}
              <div className="border-t border-border p-4 flex flex-col items-center gap-2">
                {/* Waveform bars */}
                {state === "recording" && (
                  <div className="flex items-end gap-0.5 h-8 mb-1">
                    {Array.from({ length: 20 }).map((_, i) => (
                      <div
                        key={i}
                        className="w-1 bg-emerald-500 rounded-full transition-all duration-75"
                        style={{
                          height: `${Math.max(4, audioLevel * 32 * (0.5 + Math.sin(Date.now() / 100 + i) * 0.5))}px`,
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* Hold-to-talk button */}
                <button
                  onMouseDown={startRecording}
                  onMouseUp={stopRecording}
                  onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
                  onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
                  disabled={isBusy}
                  className={cn(
                    "w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 select-none touch-none",
                    state === "recording"
                      ? "bg-red-500 scale-110 shadow-lg shadow-red-500/40"
                      : isBusy
                      ? "bg-muted text-muted-foreground cursor-not-allowed"
                      : state === "speaking"
                      ? "bg-emerald-500 text-white"
                      : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md hover:shadow-lg active:scale-95"
                  )}
                  onClick={state === "speaking" ? stopSpeaking : undefined}
                  title={state === "speaking" ? "Stop speaking" : "Hold to talk"}
                >
                  {isBusy ? (
                    <Loader2 className="w-7 h-7 animate-spin" />
                  ) : state === "speaking" ? (
                    <Volume2 className="w-7 h-7 animate-pulse" />
                  ) : state === "recording" ? (
                    <MicOff className="w-7 h-7 text-white" />
                  ) : (
                    <Mic className="w-7 h-7" />
                  )}
                </button>

                <p className="text-xs text-muted-foreground text-center">
                  {state === "speaking" ? "Tap to stop" : stateLabel[state]}
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
