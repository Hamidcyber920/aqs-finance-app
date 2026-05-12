/**
 * VoiceAgent — HIBBA AI Voice Assistant
 *
 * Features:
 * - Hold-to-talk mic button (floating, bottom-right)
 * - Spacebar keyboard shortcut (hold to talk)
 * - Records audio via MediaRecorder API
 * - Auto language detection (Arabic, Urdu, Bengali, English, French, German)
 * - Uploads to S3, transcribes via Whisper
 * - Sends transcript to Gemini 2.5 Flash agent (function-calling)
 * - Displays transcript + agent response with language indicator
 * - Plays TTS audio response automatically
 * - Navigates to correct page and pre-fills forms if agent returns a navigation action
 * - Multi-turn conversation memory within session
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, X, Volume2, Loader2, ChevronDown, ChevronUp, Sparkles, Globe, Trash2, MessageSquare } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

interface VoiceAgentProps {
  onFormFill?: (page: string, fields: Record<string, unknown>) => void;
}

type AgentState = "idle" | "recording" | "uploading" | "transcribing" | "thinking" | "speaking" | "done" | "error";

interface Message {
  role: "user" | "agent";
  text: string;
  audioUrl?: string | null;
  language?: string;
}

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English", ar: "العربية", ur: "اردو", bn: "বাংলা",
  fr: "Français", de: "Deutsch",
};

const LANGUAGE_FLAGS: Record<string, string> = {
  en: "🇬🇧", ar: "🇸🇦", ur: "🇵🇰", bn: "🇧🇩", fr: "🇫🇷", de: "🇩🇪",
};

export function VoiceAgent({ onFormFill }: VoiceAgentProps) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<AgentState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [detectedLanguage, setDetectedLanguage] = useState<string>("en");
  const [spacebarHeld, setSpacebarHeld] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const spacebarRecordingRef = useRef(false);

  const transcribeMutation = trpc.voiceAgent.transcribe.useMutation();
  const queryMutation = trpc.voiceAgent.query.useMutation();

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Spacebar push-to-talk
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.target === document.body && !spacebarRecordingRef.current && open) {
        e.preventDefault();
        spacebarRecordingRef.current = true;
        setSpacebarHeld(true);
        startRecording();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && spacebarRecordingRef.current) {
        e.preventDefault();
        spacebarRecordingRef.current = false;
        setSpacebarHeld(false);
        stopRecording();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [open]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      cancelAnimationFrame(animFrameRef.current);
      audioContextRef.current?.close();
    };
  }, []);

  const startRecording = useCallback(async () => {
    if (state === "recording") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

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
    } catch {
      toast.error("Microphone access denied. Please allow microphone access to use the voice assistant.");
      setState("error");
    }
  }, [state]);

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
    if (blob.size < 10000) {
      setState("idle");
      toast.info("Recording too short — please hold the button for at least 2 seconds and speak clearly.");
      return;
    }

    await processAudio(blob);
  }, [state]);

  const processAudio = async (blob: Blob) => {
    setState("uploading");
    try {
      const baseMime = blob.type.split(";")[0].trim();
      const mimeToExt: Record<string, string> = {
        "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a",
        "audio/mpeg": "mp3", "audio/wav": "wav",
      };
      const ext = mimeToExt[baseMime] ?? "webm";
      const cleanBlob = new Blob([blob], { type: baseMime });
      const formData = new FormData();
      formData.append("file", cleanBlob, `voice-${Date.now()}.${ext}`);

      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const { url: audioUrl } = await uploadRes.json();

      // Transcribe — auto-detect language
      setState("transcribing");
      const transcribeResult = await transcribeMutation.mutateAsync({ audioUrl });
      const { transcript, language } = transcribeResult;
      if (!transcript?.trim()) {
        setState("idle");
        toast.info("Couldn't hear anything clearly — please try again.");
        return;
      }

      // Update detected language
      const lang = language?.slice(0, 2) ?? "en";
      setDetectedLanguage(lang);

      setMessages(prev => [...prev, { role: "user", text: transcript, language: lang }]);

      // Query the agent with language context
      setState("thinking");
      const currentPage = window.location.pathname.replace("/", "") || "dashboard";
      const response = await queryMutation.mutateAsync({
        transcript,
        currentPage,
        withTts: true,
        detectedLanguage: language ?? "en",
      });

      setMessages(prev => [...prev, { role: "agent", text: response.answer, audioUrl: response.audioUrl, language: lang }]);

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
      const errMsg = err?.message?.includes("No speech") ? "No speech detected — please try again." : "Something went wrong. Please try again.";
      setMessages(prev => [...prev, { role: "agent", text: errMsg }]);
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
    setDetectedLanguage("en");
  };

  const stateLabel: Record<AgentState, string> = {
    idle: "Hold to speak  ·  or hold Space",
    recording: `Recording… ${recordingSeconds}s`,
    uploading: "Processing…",
    transcribing: "Transcribing…",
    thinking: "Thinking…",
    speaking: "Speaking…",
    done: "Hold to speak  ·  or hold Space",
    error: "Error — try again",
  };

  const isBusy = ["uploading", "transcribing", "thinking"].includes(state);

  const langFlag = LANGUAGE_FLAGS[detectedLanguage] ?? "🌐";
  const langLabel = LANGUAGE_LABELS[detectedLanguage] ?? detectedLanguage;

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "fixed bottom-20 right-4 z-50 w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-300",
          "sm:bottom-6",
          open
            ? "bg-red-500 hover:bg-red-600 text-white"
            : "bg-gradient-to-br from-emerald-600 to-emerald-800 hover:from-emerald-500 hover:to-emerald-700 text-white"
        )}
        title="HIBBA AI Assistant"
        aria-label="HIBBA AI Assistant"
      >
        {open ? <X className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
        {/* Pulsing ring when recording */}
        {state === "recording" && (
          <span className="absolute inset-0 rounded-full animate-ping bg-red-400 opacity-40" />
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className={cn(
          "fixed bottom-36 right-4 sm:bottom-24 z-50 w-80 sm:w-96 rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col",
          "bg-card text-card-foreground",
        )} style={{ maxHeight: "70vh" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-emerald-800 to-emerald-700 text-white">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-300" />
              <span className="font-semibold text-sm tracking-tight">HIBBA AI Assistant</span>
              {messages.length > 0 && (
                <span className="flex items-center gap-1 text-xs text-emerald-200 ml-1">
                  <Globe className="w-3 h-3" />
                  {langFlag} {langLabel}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button onClick={resetAgent} className="p-1 rounded hover:bg-white/10 text-white/70 hover:text-white" title="Clear conversation">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={() => setIsExpanded(e => !e)} className="p-1 rounded hover:bg-white/10 text-white/70 hover:text-white p-1">
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
                    <p className="font-medium">Assalamu Alaikum!</p>
                    <p className="text-xs mt-1 opacity-70">Ask me anything about AQS — finances, donors, compliance, staff, accommodation.</p>
                    <p className="text-xs mt-1 opacity-50">Supports English · العربية · اردو · বাংলা</p>
                    <div className="mt-3 space-y-1">
                      {["What's this month's balance?", "Show me Gift Aid balance", "Who are our active tenants?"].map(q => (
                        <button key={q} className="block w-full text-left text-xs px-2 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors" onClick={() => {
                          setMessages(prev => [...prev, { role: "user", text: q }]);
                          setState("thinking");
                          const currentPage = window.location.pathname.replace("/", "") || "dashboard";
                          queryMutation.mutateAsync({ transcript: q, currentPage, withTts: true, detectedLanguage: "en" }).then(response => {
                            setMessages(prev => [...prev, { role: "agent", text: response.answer, audioUrl: response.audioUrl }]);
                            if (response.audioUrl) {
                              setState("speaking");
                              const audio = new Audio(response.audioUrl);
                              audioRef.current = audio;
                              audio.onended = () => setState("done");
                              audio.play().catch(() => setState("done"));
                            } else {
                              setState("done");
                            }
                          }).catch(() => setState("error"));
                        }}>
                          <MessageSquare className="w-3 h-3 inline mr-1 opacity-50" />
                          {q}
                        </button>
                      ))}
                    </div>
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
                      <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
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
                    state === "recording" || spacebarHeld
                      ? "bg-red-500 scale-110 shadow-lg shadow-red-500/40"
                      : isBusy
                      ? "bg-muted text-muted-foreground cursor-not-allowed"
                      : state === "speaking"
                      ? "bg-emerald-500 text-white"
                      : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md hover:shadow-lg active:scale-95"
                  )}
                  onClick={state === "speaking" ? stopSpeaking : undefined}
                  title={state === "speaking" ? "Tap to stop" : "Hold to talk"}
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
