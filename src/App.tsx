import React, { useRef, useState, useEffect, useCallback } from "react";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import * as handPoseDetection from "@tensorflow-models/hand-pose-detection";
import { Camera, History, Loader2, Signal, VideoOff } from "lucide-react";
import { guessGesture } from "./utils/gesture";

type TranslationRecord = {
  id: string;
  timestamp: number;
  text: string;
};

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isModelLoading, setIsModelLoading] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);
  const [detector, setDetector] =
    useState<handPoseDetection.HandDetector | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [activeGesture, setActiveGesture] = useState<string | null>(null);
  const [currentSentence, setCurrentSentence] = useState<string>("");

  const [history, setHistory] = useState<TranslationRecord[]>(() => {
    const saved = localStorage.getItem("libras_history");
    return saved ? JSON.parse(saved) : [];
  });

  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Clear bad caches
  useEffect(() => {
    if ("caches" in window) {
      caches.keys().then((names) => {
        for (let name of names) {
          caches.delete(name);
        }
      });
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (let registration of registrations) {
          registration.unregister();
        }
      });
    }
  }, []);

  // Initialize TFJS and HandPose model
  useEffect(() => {
    let active = true;

    const initModel = async () => {
      try {
        const model = handPoseDetection.SupportedModels.MediaPipeHands;
        let newDetector: handPoseDetection.HandDetector;

        try {
          const detectorConfig = {
            runtime: "mediapipe",
            solutionPath: "https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240",
            modelType: "lite",
            maxHands: 1,
          } as handPoseDetection.MediaPipeHandsMediaPipeModelConfig;
          newDetector = await handPoseDetection.createDetector(model, detectorConfig);
        } catch (mpErr) {
          console.warn("MediaPipe failed, falling back to TFJS", mpErr);
          await tf.ready();
          const tfjsConfig = {
            runtime: "tfjs",
            modelType: "lite",
            maxHands: 1,
            detectorModelUrl: "https://www.kaggle.com/models/mediapipe/handpose-3d/tfJs/detector-lite/1/model.json?tfjs-format=file",
            landmarkModelUrl: "https://www.kaggle.com/models/mediapipe/handpose-3d/tfJs/landmark-lite/1/model.json?tfjs-format=file",
          } as handPoseDetection.MediaPipeHandsTfjsModelConfig;
          newDetector = await handPoseDetection.createDetector(model, tfjsConfig);
        }

        if (active) {
          setDetector(newDetector);
          setIsModelLoading(false);
          setModelError(null);
        }
      } catch (err) {
        console.error("Error loading model:", err);
        setModelError(String(err));
        setIsModelLoading(false);
      }
    };

    initModel();
    return () => {
      active = false;
    };
  }, []);

  // Set up camera
  useEffect(() => {
    const setupCamera = async () => {
      if (!videoRef.current) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true, // simple constraint max compatibility
          audio: false,
        });
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setIsVideoReady(true);
          setCameraError(null);
        };
      } catch (err) {
        console.warn("User camera error, trying any camera:", err);
        setCameraError(
          "Camera unavailable. Ensure permissions are granted or connect a camera.",
        );
      }
    };
    setupCamera();

    return () => {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Detection Loop
  useEffect(() => {
    let animationFrameId: number;

    const historyLength = 15;
    const gestureHistory: (string | null)[] = [];
    
    let lastCommittedGesture: string | null = null;
    let lastCommittedTime = 0;

    const detect = async () => {
      if (videoRef.current && canvasRef.current && detector && isVideoReady) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        if (ctx) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;

          ctx.clearRect(0, 0, canvas.width, canvas.height);

          try {
            const hands = await detector.estimateHands(video);

            if (hands && hands.length > 0) {
              const hand = hands[0];
              const keypoints = hand.keypoints;

              // Draw Keypoints
              ctx.fillStyle = "#10B981"; // Tailwind emerald-500
              for (let i = 0; i < keypoints.length; i++) {
                const x = keypoints[i].x;
                const y = keypoints[i].y;
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, 2 * Math.PI);
                ctx.fill();
              }

              // Guess Gesture
              const rawGuess = guessGesture(keypoints);
              gestureHistory.push(rawGuess);
              if (gestureHistory.length > historyLength) {
                gestureHistory.shift();
              }

              // Find most frequent gesture
              const frequencies: Record<string, number> = {};
              let maxFreq = 0;
              let smoothedGuess: string | null = null;

              for (const g of gestureHistory) {
                if (g) {
                  frequencies[g] = (frequencies[g] || 0) + 1;
                  if (frequencies[g] > maxFreq) {
                    maxFreq = frequencies[g];
                    smoothedGuess = g;
                  }
                }
              }

              // If dominant gesture > 60% of history
              if (maxFreq >= historyLength * 0.6 && smoothedGuess) {
                setActiveGesture(smoothedGuess);

                const now = Date.now();
                if (smoothedGuess !== lastCommittedGesture || (now - lastCommittedTime > 2000)) {
                  setCurrentSentence((prev) => prev + smoothedGuess);
                  lastCommittedGesture = smoothedGuess;
                  lastCommittedTime = now;
                  
                  // Clear history after commit to avoid immediately triggering again
                  gestureHistory.length = 0;
                }
              } else {
                setActiveGesture(null);
                // Also push null if too noisy
              }

            } else {
              setActiveGesture(null);
              gestureHistory.push(null);
              if (gestureHistory.length > historyLength) {
                gestureHistory.shift();
              }
              // If we see nothing for a while, clear last committed so we can type same letter again
              if (gestureHistory.every(g => g === null)) {
                 lastCommittedGesture = null;
              }
            }
          } catch (e) {
            console.error("Detection error: ", e);
          }
        }
      }
      animationFrameId = requestAnimationFrame(detect);
    };

    if (isVideoReady && detector) {
      detect();
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [detector, isVideoReady]);

  // Persist History
  useEffect(() => {
    localStorage.setItem("libras_history", JSON.stringify(history));
  }, [history]);

  const saveSentence = () => {
    if (currentSentence.trim().length === 0) return;
    const newRecord: TranslationRecord = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      text: currentSentence,
    };
    setHistory((prev) => [newRecord, ...prev].slice(0, 20)); // keep last 20
    setCurrentSentence("");
  };

  const deleteRecord = (id: string) => {
    setHistory((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-[#0A0A0A] text-white font-sans overflow-hidden">
      <header className="flex items-center justify-between px-4 md:px-8 h-16 border-b border-white/5 bg-[#0D0D0D] shrink-0 z-10 relative shadow-md">
        <div className="flex items-center gap-3 hidden sm:flex">
          <div
            className={`w-3 h-3 rounded-full ${isOffline ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]" : "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"}`}
          ></div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-white/50 hidden md:block">
            {isOffline ? "Sistema Offline" : "Sistema Ativo"}
          </span>
        </div>
        <h1 className="text-lg font-light tracking-[0.2em] uppercase italic justify-self-center mx-auto sm:mx-0">
          Libras<span className="font-bold">Lens</span>
        </h1>
        <div className="flex gap-6 items-center">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase text-white/40 tracking-wider">
              Engine
            </span>
            <span
              className={`text-[10px] font-mono flex items-center gap-1 ${modelError ? "text-red-500" : "text-emerald-500"}`}
            >
              {isModelLoading ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading...
                </>
              ) : modelError ? (
                "Error"
              ) : (
                "TFJS Active"
              )}
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden p-4 md:p-6 gap-4 md:gap-6 flex-col lg:flex-row relative z-0">
        <main className="flex-[2] relative rounded-3xl bg-black border border-white/5 overflow-hidden group shadow-2xl flex items-center justify-center min-h-[40vh] lg:min-h-0">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="w-full h-full opacity-40 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent"></div>
            <div className="absolute w-[60%] h-[80%] max-w-sm border-2 border-dashed border-emerald-500/30 rounded-2xl flex items-center justify-center hidden sm:flex">
              <span className="text-[10px] uppercase tracking-[0.3em] text-emerald-500/50">
                Área de Foco
              </span>
            </div>
          </div>

          <div className="absolute top-6 left-6 flex flex-col gap-2 z-20 pointer-events-none">
            <span className="px-3 py-1 w-max rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[10px] uppercase tracking-wider text-white/70">
              Câmera Frontal
            </span>
            {modelError && (
              <span className="px-3 py-1 w-max max-w-xs md:max-w-md rounded-xl bg-red-500/20 backdrop-blur-md border border-red-500/40 text-[10px] text-red-300">
                {modelError}
              </span>
            )}
          </div>

          {/* Detection Output Visualizer */}
          {activeGesture && (
            <div className="absolute bottom-6 right-6 flex flex-col items-center gap-2 z-20 pointer-events-none">
              <div className="absolute bottom-full mb-4 bg-emerald-500/10 backdrop-blur-md border border-emerald-500/30 text-emerald-500 w-16 h-16 flex items-center justify-center rounded-2xl text-4xl font-light shadow-lg shadow-emerald-500/10 transform animate-bounce-short">
                {activeGesture}
              </div>
              <span className="text-[10px] uppercase text-emerald-500/60 tracking-widest hidden md:block">
                Sinal
              </span>
            </div>
          )}

          {!isVideoReady && (
            <div className="flex flex-col items-center text-white/30 gap-4 z-20">
              <VideoOff
                className={`w-8 h-8 ${cameraError ? "text-amber-500 opacity-80" : "opacity-50"}`}
              />
              <p
                className={`text-xs uppercase tracking-widest ${cameraError ? "text-amber-500" : ""}`}
              >
                {cameraError ? cameraError : "Iniciando câmera..."}
              </p>
            </div>
          )}
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover mirror"
            playsInline
            muted
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full object-cover mirror z-10 pointer-events-none"
          />
        </main>

        <aside className="w-full lg:flex-1 lg:max-w-md flex flex-col gap-4">
          <div className="flex flex-col h-full bg-[#111111] rounded-3xl border border-white/5 p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xs uppercase tracking-[0.2em] text-white/50 flex items-center gap-2">
                Histórico Recente
              </h2>
              <button
                onClick={() => setHistory([])}
                className="text-[10px] text-white/20 hover:text-white/60 uppercase tracking-widest transition-colors"
              >
                Limpar
              </button>
            </div>
            <div
              className="flex-1 overflow-y-auto space-y-4 pr-2 pb-4"
              style={{ scrollbarWidth: "none" }}
            >
              {history.length === 0 ? (
                <div className="text-white/30 text-xs italic text-center mt-10">
                  Nenhuma tradução salva ainda.
                </div>
              ) : (
                history.map((record) => (
                  <div
                    key={record.id}
                    className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 group relative"
                  >
                    <p className="text-sm text-white/90 leading-relaxed italic">
                      "{record.text}"
                    </p>
                    <span className="text-[10px] text-white/30 uppercase mt-2 block">
                      {new Date(record.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <button
                      onClick={() => deleteRecord(record.id)}
                      className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-[10px] uppercase tracking-widest text-red-500/70 hover:text-red-500 transition-opacity"
                    >
                      Excluir
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>

      <section className="h-auto lg:h-32 px-4 md:px-6 pb-4 md:pb-6 shrink-0 relative z-20">
        <div className="h-full w-full bg-[#161616] rounded-[2rem] border border-white/5 flex flex-col lg:flex-row items-center px-6 lg:px-10 py-6 lg:py-0 relative overflow-hidden gap-6 shadow-2xl">
          <div className="absolute left-0 top-0 bottom-0 w-2 bg-emerald-500"></div>

          <div className="flex-1 w-full flex flex-col justify-center">
            <span className="text-[10px] uppercase tracking-[0.4em] text-emerald-500 mb-2 block">
              Tradução em Tempo Real
            </span>
            <div className="flex items-center gap-4">
              <h3 className="text-3xl sm:text-4xl font-light tracking-tight min-h-[2.5rem] break-all">
                {currentSentence || (
                  <span className="text-white/20 italic text-xl sm:text-2xl">
                    Aguardando...
                  </span>
                )}
                <span className="inline-block font-mono text-white/20 animate-pulse ml-2 -translate-y-1">
                  |
                </span>
              </h3>
              {currentSentence && (
                <button
                  onClick={() => setCurrentSentence("")}
                  className="shrink-0 p-2 text-white/30 hover:text-red-400 hover:bg-white/5 rounded-full transition-colors flex items-center justify-center"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-3 w-full lg:w-auto shrink-0 mt-2 lg:mt-0">
            <button
              onClick={saveSentence}
              disabled={!currentSentence}
              className="w-full lg:w-auto px-8 py-3.5 rounded-2xl bg-white text-black text-[10px] sm:text-xs font-bold uppercase tracking-widest hover:bg-gray-200 disabled:opacity-50 disabled:bg-white/10 disabled:text-white/30 transition-all flex items-center justify-center gap-2"
            >
              Salvar Frase
            </button>
          </div>
        </div>
      </section>

      <style>{`
          .mirror {
            transform: scaleX(-1);
          }
          @keyframes bounce-short {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-5px); }
          }
          .animate-bounce-short {
            animation: bounce-short 1.5s ease-in-out infinite;
          }
          ::-webkit-scrollbar {
            width: 6px;
          }
          ::-webkit-scrollbar-track {
            background: transparent; 
          }
          ::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,0.1); 
            border-radius: 10px;
          }
          ::-webkit-scrollbar-thumb:hover {
            background: rgba(255,255,255,0.2); 
          }
        `}</style>
    </div>
  );
}
