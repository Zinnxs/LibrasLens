import React, { useRef, useState, useEffect, useCallback } from "react";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import * as handPoseDetection from "@tensorflow-models/hand-pose-detection";
import {
  Camera,
  History,
  Loader2,
  Signal,
  VideoOff,
  HelpCircle,
  Volume2,
  RefreshCw,
  Play,
  Pause,
  Sparkles,
  BookOpen,
  Smartphone,
  CheckCircle2,
  Trash2,
  Copy,
  PlusCircle,
  Undo2,
  Upload,
  Download,
  Database,
  FileSpreadsheet,
  Activity
} from "lucide-react";
import { guessGesture, classifyWithKNN, parseCSV, CSVSample, ColumnMapping, autoDetectMapping, parseCSVWithMapping, Point } from "./utils/gesture";
import { AnimatePresence, motion } from "motion/react";
import { SignsGuide } from "./components/SignsGuide";

type TranslationRecord = {
  id: string;
  timestamp: number;
  text: string;
};

const LANDMARK_NAMES: Record<number, string> = {
  0: "Pulso (Wrist)",
  1: "Polegar: Base (CMC)",
  2: "Polegar: MCP",
  3: "Polegar: IP",
  4: "Polegar: Ponta (Tip)",
  5: "Indicador: MCP",
  6: "Indicador: PIP",
  7: "Indicador: DIP",
  8: "Indicador: Ponta (Tip)",
  9: "Médio: MCP",
  10: "Médio: PIP",
  11: "Médio: DIP",
  12: "Médio: Ponta (Tip)",
  13: "Anelar: MCP",
  14: "Anelar: PIP",
  15: "Anelar: DIP",
  16: "Anelar: Ponta (Tip)",
  17: "Mindinho: MCP",
  18: "Mindinho: PIP",
  19: "Mindinho: DIP",
  20: "Mindinho: Ponta (Tip)"
};

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latestKeypointsRef = useRef<any>(null);

  // Core model and camera states
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);
  const [detector, setDetector] = useState<handPoseDetection.HandDetector | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [activeGesture, setActiveGesture] = useState<string | null>(null);
  const [isDetectionPaused, setIsDetectionPaused] = useState(false);
  
  // Custom camera facingMode: "user" (front) or "environment" (rear)
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");

  // Interaction modes: "translator" (realtime dictation), "practice" (learning game), or "dataset" (manage samples)
  const [appMode, setAppMode] = useState<"translator" | "practice" | "dataset">("translator");

  // State for Translator mode
  const [currentSentence, setCurrentSentence] = useState<string>("");
  const [showGuide, setShowGuide] = useState(false);
  const [history, setHistory] = useState<TranslationRecord[]>(() => {
    const saved = localStorage.getItem("libras_history");
    return saved ? JSON.parse(saved) : [];
  });

  // State for Practice mode
  const [practiceTarget, setPracticeTarget] = useState<string>("A");
  const [practiceProgress, setPracticeProgress] = useState<number>(0);
  const [practiceScore, setPracticeScore] = useState<number>(() => {
    const saved = localStorage.getItem("libras_practice_score");
    return saved ? parseInt(saved, 10) : 0;
  });
  const [practiceStreak, setPracticeStreak] = useState<number>(() => {
    const saved = localStorage.getItem("libras_practice_streak");
    return saved ? parseInt(saved, 10) : 0;
  });

  // Custom CSV & Landmark Dataset States
  const [csvSamples, setCsvSamples] = useState<CSVSample[]>(() => {
    const saved = localStorage.getItem("libras_csv_samples");
    return saved ? JSON.parse(saved) : [];
  });
  const [predictorType, setPredictorType] = useState<"heuristic" | "custom">(() => {
    return (localStorage.getItem("predictor_type") as "heuristic" | "custom") || "heuristic";
  });
  const [recordLabel, setRecordLabel] = useState<string>("A");
  const [isRecordingFlash, setIsRecordingFlash] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);

  // Interactive CSV Mapping Wizard States
  const [uploadedCsvText, setUploadedCsvText] = useState<string>("");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [showMappingWizard, setShowMappingWizard] = useState(false);
  const [invertCsvY, setInvertCsvY] = useState(false);

  // System states
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [copiedNotification, setCopiedNotification] = useState(false);

  // Synths & Audio effects
  const playSuccessSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playTone = (freq: number, start: number, duration: number, type: "sine" | "triangle" = "sine") => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(freq, start);
        
        gain.gain.setValueAtTime(0.12, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration - 0.02);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.start(start);
        osc.stop(start + duration);
      };
      
      const now = audioCtx.currentTime;
      // High pitched sweet double-tone
      playTone(523.25, now, 0.12, "sine"); // C5
      playTone(659.25, now + 0.08, 0.25, "sine"); // E5
    } catch (e) {
      console.warn("AudioContext not allowed or supported by browser constraints yet.", e);
    }
  };

  const playModeSwitchSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.setValueAtTime(349.23, now); // F4
      osc.frequency.exponentialRampToValueAtTime(440.00, now + 0.15); // A4
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch(e){}
  };

  useEffect(() => {
    // Unregister any stale or broken service workers to prevent 'Failed to fetch' blocks in sandbox iframes
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister().then(() => {
            console.log("Unregistered service worker to prevent dynamic asset fetch blocks.");
          });
        }
      }).catch((e) => console.warn("Service worker check ignored:", e));
    }

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
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
            solutionPath: "/mediapipe/",
            modelType: "lite",
            maxHands: 1,
          } as handPoseDetection.MediaPipeHandsMediaPipeModelConfig;
          newDetector = await handPoseDetection.createDetector(
            model,
            detectorConfig,
          );
        } catch (mpErr) {
          console.warn("Local MediaPipe failed, retrying with versioned CDN:", mpErr);
          try {
            const detectorConfig = {
              runtime: "mediapipe",
              solutionPath: "https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/",
              modelType: "lite",
              maxHands: 1,
            } as handPoseDetection.MediaPipeHandsMediaPipeModelConfig;
            newDetector = await handPoseDetection.createDetector(
              model,
              detectorConfig,
            );
          } catch (cdnErr) {
            console.warn("Versioned CDN MediaPipe failed, trying generic CDN:", cdnErr);
            const detectorConfig = {
              runtime: "mediapipe",
              solutionPath: "https://cdn.jsdelivr.net/npm/@mediapipe/hands/",
              modelType: "lite",
              maxHands: 1,
            } as handPoseDetection.MediaPipeHandsMediaPipeModelConfig;
            newDetector = await handPoseDetection.createDetector(
              model,
              detectorConfig,
            );
          }
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

  // Set up camera (responsive to facingMode changes)
  useEffect(() => {
    let active = true;
    const setupCamera = async () => {
      if (!videoRef.current) return;
      try {
        // Stop current stream tracks first to release camera lock
        if (videoRef.current.srcObject) {
          const stream = videoRef.current.srcObject as MediaStream;
          stream.getTracks().forEach((track) => track.stop());
        }

        setIsVideoReady(false);
        const constraints = {
          video: {
            facingMode: facingMode,
            width: { ideal: 640 },
            height: { ideal: 480 }
          },
          audio: false,
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (active && videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            if (videoRef.current) {
              videoRef.current.play().then(() => {
                setIsVideoReady(true);
                setCameraError(null);
              }).catch((e) => {
                console.error("Video play error:", e);
                setCameraError("Não foi possível iniciar o vídeo.");
              });
            }
          };
          
          // Safety fallback if metadata is already loaded
          if (videoRef.current.readyState >= 1) {
            videoRef.current.play().then(() => {
                setIsVideoReady(true);
                setCameraError(null);
              }).catch((e) => console.error(e));
          }
        }
      } catch (err) {
        console.warn("User camera error, trying basic constraints:", err);
        if (active) {
          setCameraError(
            "Câmera inacessível. Certifique-se de conceder acesso ou altere a direção da câmera."
          );
        }
      }
    };
    
    setupCamera();

    return () => {
      active = false;
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [facingMode]);

  // Detection Loop
  useEffect(() => {
    let animationFrameId: number;
    const historyLength = 12; // shortened for snappier mobile input
    const gestureHistory: (string | null)[] = [];

    let lastCommittedGesture: string | null = null;
    let lastCommittedTime = 0;

    const detect = async () => {
      if (isDetectionPaused) {
        animationFrameId = requestAnimationFrame(detect);
        return;
      }

      if (videoRef.current && canvasRef.current && detector && isVideoReady) {
        const video = videoRef.current;
        
        if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
          animationFrameId = requestAnimationFrame(detect);
          return;
        }

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        if (ctx) {
          // Sync sizes properly
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;

          ctx.clearRect(0, 0, canvas.width, canvas.height);

          try {
            const hands = await detector.estimateHands(video);

            if (hands && hands.length > 0) {
              const hand = hands[0];
              const keypoints = hand.keypoints;

              // Draw beautiful skeleton outline instead of plain dots
              ctx.lineWidth = 3;
              ctx.strokeStyle = "rgba(16, 185, 129, 0.4)"; // translucent emerald
              ctx.fillStyle = "#10B981"; // solid emerald-500

              // Draw finger connections
              const fingerJoints = [
                [0, 1, 2, 3, 4],       // Thumb
                [0, 5, 6, 7, 8],       // Index
                [0, 9, 10, 11, 12],    // Middle
                [0, 13, 14, 15, 16],   // Ring
                [0, 17, 18, 19, 20]    // Pinky
              ];

              fingerJoints.forEach(jointGroup => {
                ctx.beginPath();
                for (let j = 0; j < jointGroup.length; j++) {
                  const pt = keypoints[jointGroup[j]];
                  if (j === 0) ctx.moveTo(pt.x, pt.y);
                  else ctx.lineTo(pt.x, pt.y);
                }
                ctx.stroke();
              });

              // Draw solid keypoints
              for (let i = 0; i < keypoints.length; i++) {
                const x = keypoints[i].x;
                const y = keypoints[i].y;
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, 2 * Math.PI);
                ctx.fill();
              }

              // Store keypoints in ref for instant landmark recording
              latestKeypointsRef.current = keypoints;

              // Guess Gesture (Dynamic: heuristic or custom KNN-based dataset)
              let rawGuess: string | null = null;
              if (predictorType === "custom" && csvSamples.length > 0) {
                rawGuess = classifyWithKNN(keypoints, csvSamples);
              } else {
                rawGuess = guessGesture(keypoints);
              }

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

              // Set active gesture in real-time
              if (maxFreq >= historyLength * 0.5 && smoothedGuess) {
                setActiveGesture(smoothedGuess);

                if (appMode === "translator") {
                  const now = Date.now();
                  // Commit gesture to translator text box
                  if (
                    smoothedGuess !== lastCommittedGesture ||
                    now - lastCommittedTime > 1800
                  ) {
                    setCurrentSentence((prev) => prev + smoothedGuess);
                    lastCommittedGesture = smoothedGuess;
                    lastCommittedTime = now;
                    gestureHistory.length = 0; // Clear history to prevent duplicate instant prints

                    // Trigger subtle vibration feedback on phone
                    if (navigator.vibrate) {
                      navigator.vibrate(35);
                    }
                  }
                }
              } else {
                setActiveGesture(null);
              }
            } else {
              latestKeypointsRef.current = null;
              setActiveGesture(null);
              gestureHistory.push(null);
              if (gestureHistory.length > historyLength) {
                gestureHistory.shift();
              }
              if (gestureHistory.every((g) => g === null)) {
                lastCommittedGesture = null;
              }
            }
          } catch (e) {
            console.error("Detection loop error: ", e);
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
  }, [detector, isVideoReady, isDetectionPaused, appMode]);

  // Practice progress tracker logic
  useEffect(() => {
    if (appMode !== "practice" || !practiceTarget) return;

    if (activeGesture === practiceTarget) {
      // Progressively fill the practice ring
      const interval = setInterval(() => {
        setPracticeProgress((prev) => {
          const next = prev + 12;
          if (next >= 100) {
            clearInterval(interval);
            handlePracticeSuccess();
            return 100;
          }
          return next;
        });
      }, 100);
      return () => clearInterval(interval);
    } else {
      // Slow progress decay when not matching to avoid accidental quick swipes
      const interval = setInterval(() => {
        setPracticeProgress((prev) => Math.max(0, prev - 10));
      }, 120);
      return () => clearInterval(interval);
    }
  }, [activeGesture, practiceTarget, appMode]);

  // Interactive CSV Column Mapping Wizard Preview Renderer
  const wizardPreviewCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (showMappingWizard && uploadedCsvText && wizardPreviewCanvasRef.current) {
      try {
        const parsed = parseCSVWithMapping(uploadedCsvText, columnMappings);
        const canvas = wizardPreviewCanvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Fill background
        ctx.fillStyle = "#020617"; // slate-950
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (parsed && parsed.length > 0) {
          const sample = parsed[0];
          
          // Grid lines
          ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let i = 20; i < canvas.width; i += 20) {
            ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height);
          }
          for (let i = 20; i < canvas.height; i += 20) {
            ctx.moveTo(0, i); ctx.lineTo(canvas.width, i);
          }
          ctx.stroke();

          // Draw label
          ctx.fillStyle = "#10b981";
          ctx.font = "bold 11px monospace";
          ctx.fillText(`Amostra: "${sample.label}"`, 10, 20);

          const pts = sample.landmarks || sample.points.reduce<Record<number, Point>>((acc, p, i) => {
            acc[i] = p;
            return acc;
          }, {});

          // Scale and center [-1, 1] to fitting dimensions
          const scaleX = canvas.width * 0.45;
          const scaleY = canvas.height * 0.45;
          const centerX = canvas.width / 2;
          const centerY = canvas.height / 2;

          const toCanvasCoords = (pt: Point) => {
            const yVal = invertCsvY ? -pt.y : pt.y;
            return {
              x: centerX + pt.x * scaleX,
              y: centerY + yVal * scaleY
            };
          };

          // Draw skeleton connections
          const connections = [
            [0, 1, 2, 3, 4],       // Thumb
            [0, 5, 6, 7, 8],       // Index
            [0, 9, 10, 11, 12],    // Middle
            [0, 13, 14, 15, 16],   // Ring
            [0, 17, 18, 19, 20]    // Pinky
          ];

          ctx.lineWidth = 2.5;
          ctx.strokeStyle = "rgba(16, 185, 129, 0.7)";
          connections.forEach(group => {
            ctx.beginPath();
            let first = true;
            group.forEach(idx => {
              const pt = pts[idx];
              if (pt && (pt.x !== 0 || pt.y !== 0)) {
                const cCoords = toCanvasCoords(pt);
                if (first) {
                  ctx.moveTo(cCoords.x, cCoords.y);
                  first = false;
                } else {
                  ctx.lineTo(cCoords.x, cCoords.y);
                }
              }
            });
            ctx.stroke();
          });

          // Draw joints
          Object.entries(pts).forEach(([idxStr, pt]) => {
            const idx = parseInt(idxStr, 10);
            if (pt && (pt.x !== 0 || pt.y !== 0)) {
              const cCoords = toCanvasCoords(pt);
              ctx.beginPath();
              ctx.arc(cCoords.x, cCoords.y, 4.5, 0, 2 * Math.PI);
              ctx.fillStyle = "#10b981";
              ctx.fill();
              
              // Draw text label on tip nodes
              if ([0, 4, 8, 12, 16, 20].includes(idx)) {
                ctx.fillStyle = "#ffffff";
                ctx.font = "bold 8px sans-serif";
                ctx.fillText(String(idx), cCoords.x + 6, cCoords.y + 2);
              }
            }
          });
        } else {
          ctx.fillStyle = "#ef4444";
          ctx.font = "12px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("Nenhum sinal detectado", canvas.width / 2, canvas.height / 2);
        }
      } catch (err) {
        console.error("Error drawing wizard preview: ", err);
      }
    }
  }, [showMappingWizard, uploadedCsvText, columnMappings, invertCsvY]);

  // On correct practice target gesture completed
  const handlePracticeSuccess = useCallback(() => {
    playSuccessSound();

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const speakText = `Excelente! Letra ${practiceTarget}`;
      const utterance = new SpeechSynthesisUtterance(speakText);
      utterance.lang = "pt-BR";
      window.speechSynthesis.speak(utterance);
    }

    if (navigator.vibrate) {
      navigator.vibrate([80, 50, 120]);
    }

    // Score calculations
    setPracticeScore((prev) => {
      const next = prev + 10;
      localStorage.setItem("libras_practice_score", String(next));
      return next;
    });

    setPracticeStreak((prev) => {
      const next = prev + 1;
      localStorage.setItem("libras_practice_streak", String(next));
      return next;
    });

    // Shift to next random letter
    setPracticeTarget((prev) => {
      const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
      const filtered = letters.filter((l) => l !== prev);
      const randomLetter = filtered[Math.floor(Math.random() * filtered.length)];
      return randomLetter;
    });

    setPracticeProgress(0);
  }, [practiceTarget]);

  // Save translation sentence to history
  const saveSentence = () => {
    if (currentSentence.trim().length === 0) return;
    const newRecord: TranslationRecord = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      text: currentSentence,
    };
    const updatedHistory = [newRecord, ...history].slice(0, 30);
    setHistory(updatedHistory);
    localStorage.setItem("libras_history", JSON.stringify(updatedHistory));
    setCurrentSentence("");
  };

  const deleteRecord = (id: string) => {
    const updated = history.filter((r) => r.id !== id);
    setHistory(updated);
    localStorage.setItem("libras_history", JSON.stringify(updated));
  };

  const speakSentence = () => {
    if (!currentSentence || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(currentSentence);
    utterance.lang = "pt-BR";
    window.speechSynthesis.speak(utterance);
  };

  const copyToClipboard = () => {
    if (!currentSentence) return;
    navigator.clipboard.writeText(currentSentence);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2000);
  };

  const changeAppMode = (mode: "translator" | "practice" | "dataset") => {
    playModeSwitchSound();
    setAppMode(mode);
    setPracticeProgress(0);
    setActiveGesture(null);
  };

  // CSV file uploader handler
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) {
          setCsvError("O arquivo carregado está vazio.");
          return;
        }

        const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
        if (lines.length === 0) {
          setCsvError("O arquivo carregado está vazio.");
          return;
        }

        const firstLine = lines[0].trim();
        const headers = firstLine.split(/[;,]/).map((h, i) => h.trim().replace(/['"']/g, "") || `Coluna_${i}`);

        setUploadedCsvText(text);
        setCsvHeaders(headers);

        // Auto detect initial mapping
        const initialMapping = autoDetectMapping(headers);
        setColumnMappings(initialMapping);
        setShowMappingWizard(true);
      } catch (err) {
        console.error("Error preparing CSV: ", err);
        setCsvError("Falha ao abrir o CSV: " + String(err));
      }
    };
    reader.readAsText(file);
  };

  const applyMappingPreset = (preset: "autodetect" | "mp_3d" | "mp_2d" | "tips_3d" | "tips_2d") => {
    if (!csvHeaders || csvHeaders.length === 0) return;

    let newMappings: ColumnMapping[] = [];

    // Find label column index: default to column named 'label'/'class'/'classe' or first column
    const cleanHeaders = csvHeaders.map(h => h.toLowerCase().trim());
    let labelIdx = cleanHeaders.findIndex(h => 
      h === "label" || h === "class" || h === "classe" || h === "gesture" || h === "target" || h === "char" || h === "letter"
    );
    if (labelIdx === -1) labelIdx = 0;

    if (preset === "autodetect") {
      newMappings = autoDetectMapping(csvHeaders);
    } else if (preset === "mp_3d") {
      csvHeaders.forEach((header, i) => {
        if (i === labelIdx) {
          newMappings.push({ colIndex: i, header, targetLandmark: -1, coordinate: "label" });
          return;
        }
        const numericSeqIndex = i < labelIdx ? i : i - 1;
        const lIdx = Math.floor(numericSeqIndex / 3);
        const cType = numericSeqIndex % 3 === 0 ? "x" : numericSeqIndex % 3 === 1 ? "y" : "z";
        if (lIdx >= 0 && lIdx <= 20) {
          newMappings.push({ colIndex: i, header, targetLandmark: lIdx, coordinate: cType });
        } else {
          newMappings.push({ colIndex: i, header, targetLandmark: -1, coordinate: "x" });
        }
      });
    } else if (preset === "mp_2d") {
      csvHeaders.forEach((header, i) => {
        if (i === labelIdx) {
          newMappings.push({ colIndex: i, header, targetLandmark: -1, coordinate: "label" });
          return;
        }
        const numericSeqIndex = i < labelIdx ? i : i - 1;
        const lIdx = Math.floor(numericSeqIndex / 2);
        const cType = numericSeqIndex % 2 === 0 ? "x" : "y";
        if (lIdx >= 0 && lIdx <= 20) {
          newMappings.push({ colIndex: i, header, targetLandmark: lIdx, coordinate: cType });
        } else {
          newMappings.push({ colIndex: i, header, targetLandmark: -1, coordinate: "x" });
        }
      });
    } else if (preset === "tips_3d") {
      const fingerTips = [4, 8, 12, 16, 20]; // Thumb, Index, Middle, Ring, Pinky Tips
      csvHeaders.forEach((header, i) => {
        if (i === labelIdx) {
          newMappings.push({ colIndex: i, header, targetLandmark: -1, coordinate: "label" });
          return;
        }
        const numericSeqIndex = i < labelIdx ? i : i - 1;
        const fIdx = Math.floor(numericSeqIndex / 3);
        const cType = numericSeqIndex % 3 === 0 ? "x" : numericSeqIndex % 3 === 1 ? "y" : "z";
        if (fIdx >= 0 && fIdx < 5) {
          newMappings.push({ colIndex: i, header, targetLandmark: fingerTips[fIdx], coordinate: cType });
        } else {
          newMappings.push({ colIndex: i, header, targetLandmark: -1, coordinate: "x" });
        }
      });
    } else if (preset === "tips_2d") {
      const fingerTips = [4, 8, 12, 16, 20];
      csvHeaders.forEach((header, i) => {
        if (i === labelIdx) {
          newMappings.push({ colIndex: i, header, targetLandmark: -1, coordinate: "label" });
          return;
        }
        const numericSeqIndex = i < labelIdx ? i : i - 1;
        const fIdx = Math.floor(numericSeqIndex / 2);
        const cType = numericSeqIndex % 2 === 0 ? "x" : "y";
        if (fIdx >= 0 && fIdx < 5) {
          newMappings.push({ colIndex: i, header, targetLandmark: fingerTips[fIdx], coordinate: cType });
        } else {
          newMappings.push({ colIndex: i, header, targetLandmark: -1, coordinate: "x" });
        }
      });
    }

    setColumnMappings(newMappings);
  };

  const updateSingleColumnMapping = (colIdx: number, targetLandmark: number, coordinate: "x" | "y" | "z" | "label") => {
    setColumnMappings(prev => {
      return prev.map(m => {
        if (m.colIndex === colIdx) {
          return { ...m, targetLandmark, coordinate };
        }
        // If coordinate is set to label, ensure only one label exists
        if (coordinate === "label" && m.coordinate === "label" && m.colIndex !== colIdx) {
          return { ...m, coordinate: "x", targetLandmark: -1 };
        }
        return m;
      });
    });
  };

  const confirmCSVImport = () => {
    if (!uploadedCsvText) return;

    try {
      const parsed = parseCSVWithMapping(uploadedCsvText, columnMappings);
      if (parsed.length === 0) {
        setCsvError("Nenhum sinal válido detectado com o mapeamento selecionado.");
        return;
      }

      // If invert Y is toggled, invert the Y coordinate of parsed points
      if (invertCsvY) {
        parsed.forEach(sample => {
          sample.points.forEach(pt => {
            pt.y = -pt.y;
          });
          if (sample.landmarks) {
            Object.values(sample.landmarks).forEach(pt => {
              pt.y = -pt.y;
            });
          }
        });
      }

      setCsvSamples((prev) => {
        const updated = [...prev, ...parsed];
        localStorage.setItem("libras_csv_samples", JSON.stringify(updated));
        return updated;
      });

      setPredictorType("custom");
      localStorage.setItem("predictor_type", "custom");

      setShowMappingWizard(false);
      setUploadedCsvText("");
      playSuccessSound();
    } catch (err) {
      console.error("Error importing with mapping: ", err);
      setCsvError("Falha na importação: " + String(err));
    }
  };

  // Live Sample Recorder
  const recordSample = () => {
    if (!latestKeypointsRef.current) {
      alert("Nenhuma mão detectada pela câmera. Posicione sua mão em frente à câmera e tente novamente.");
      return;
    }

    const labelUpper = recordLabel.toUpperCase().trim();
    if (!labelUpper) {
      alert("Por favor, digite uma letra ou caractere válido para o sinal.");
      return;
    }

    const newSample: CSVSample = {
      label: labelUpper,
      points: latestKeypointsRef.current
    };

    setCsvSamples((prev) => {
      const updated = [...prev, newSample];
      localStorage.setItem("libras_csv_samples", JSON.stringify(updated));
      return updated;
    });

    // Vibration feedback on mobile
    if (navigator.vibrate) {
      navigator.vibrate(55);
    }

    // Flash recording confirmation
    setIsRecordingFlash(true);
    setTimeout(() => setIsRecordingFlash(false), 250);
  };

  const clearSamples = () => {
    if (window.confirm("Deseja realmente apagar todas as amostras carregadas do seu dataset?")) {
      setCsvSamples([]);
      localStorage.removeItem("libras_csv_samples");
      setPredictorType("heuristic");
      localStorage.setItem("predictor_type", "heuristic");
    }
  };

  const deleteSampleGroup = (label: string) => {
    if (window.confirm(`Deseja realmente apagar todas as amostras registradas para a letra "${label}"?`)) {
      setCsvSamples((prev) => {
        const updated = prev.filter(s => s.label !== label);
        localStorage.setItem("libras_csv_samples", JSON.stringify(updated));
        return updated;
      });
    }
  };

  const exportToCSV = () => {
    if (csvSamples.length === 0) return;

    // Standard columns: label, x0, y0, z0, ..., x20, y20, z20
    let csvContent = "label";
    for (let i = 0; i < 21; i++) {
      csvContent += `,x${i},y${i},z${i}`;
    }
    csvContent += "\n";

    csvSamples.forEach((sample) => {
      let row = `"${sample.label}"`;
      for (let i = 0; i < 21; i++) {
        const pt = sample.points[i];
        row += `,${pt?.x || 0},${pt?.y || 0},${pt?.z || 0}`;
      }
      csvContent += row + "\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "libras_custom_landmarks.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const togglePredictorType = (type: "heuristic" | "custom") => {
    setPredictorType(type);
    localStorage.setItem("predictor_type", type);
    playModeSwitchSound();
  };

  // Allow setting a training letter directly from the Signs Guide
  const handleTryLetter = (letter: string) => {
    setAppMode("practice");
    setPracticeTarget(letter);
    setPracticeProgress(0);
  };

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-[#07080a] text-white font-sans overflow-hidden">
      {/* Light Overlay Shadows for Visual Splendor */}
      <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none"></div>

      {/* Signs Guide Modal */}
      <AnimatePresence>
        {showGuide && (
          <SignsGuide 
            onClose={() => setShowGuide(false)} 
            onTryLetter={handleTryLetter}
          />
        )}
      </AnimatePresence>

      {/* Header Panel */}
      <header className="flex items-center justify-between px-4 sm:px-6 md:px-8 h-16 border-b border-white/5 bg-slate-950/80 backdrop-blur-md shrink-0 z-10 relative">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center">
            <span className={`absolute inline-flex h-2 w-2 rounded-full opacity-75 animate-ping ${isOffline ? "bg-amber-400" : "bg-emerald-400"}`}></span>
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isOffline ? "bg-amber-500" : "bg-emerald-500"}`}></span>
          </div>
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 hidden sm:inline-block">
            {isOffline ? "Modo Offline" : "Conectado"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-emerald-400" />
          <h1 className="text-sm sm:text-base font-light tracking-[0.25em] uppercase italic">
            Libras<span className="font-bold text-emerald-400">Lens</span>
          </h1>
        </div>

        <div className="flex gap-2 sm:gap-4 items-center">
          {/* Target button matching focus metadata styling */}
          <button
            onClick={() => setShowGuide(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 hover:from-emerald-500/20 hover:to-teal-500/20 text-emerald-400 hover:text-emerald-300 rounded-full transition-all duration-300 text-[10px] uppercase tracking-wider font-semibold border border-emerald-500/20 hover:border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.04)] hover:shadow-[0_0_18px_rgba(16,185,129,0.12)] active:scale-95"
          >
            <Sparkles size={11} className="animate-pulse shrink-0" />
            <span>Guia de Sinais</span>
          </button>
        </div>
      </header>

      {/* Mode Switch Tabs bar */}
      <div className="px-4 sm:px-6 py-2 bg-slate-950/40 border-b border-white/5 flex items-center justify-between shrink-0 gap-3">
        <div className="flex bg-slate-900/90 p-1 rounded-2xl border border-white/5 w-full sm:w-auto max-w-md">
          <button
            onClick={() => changeAppMode("translator")}
            className={`flex-1 sm:flex-initial px-4 py-2 text-xs font-semibold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${
              appMode === "translator"
                ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Volume2 size={13} />
            <span>Tradutor</span>
          </button>
          <button
            onClick={() => changeAppMode("practice")}
            className={`flex-1 sm:flex-initial px-4 py-2 text-xs font-semibold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${
              appMode === "practice"
                ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles size={13} />
            <span>Treinar</span>
          </button>
          <button
            onClick={() => changeAppMode("dataset")}
            className={`flex-1 sm:flex-initial px-4 py-2 text-xs font-semibold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${
              appMode === "dataset"
                ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Database size={13} />
            <span>Dataset CSV</span>
          </button>
        </div>

        {appMode === "practice" && (
          <div className="flex items-center gap-4 shrink-0 bg-slate-900/60 border border-white/5 px-4 py-1.5 rounded-2xl text-[11px] font-mono text-slate-300">
            <div>
              Pontos: <span className="text-emerald-400 font-bold">{practiceScore}</span>
            </div>
            <div className="w-[1px] h-3 bg-white/10"></div>
            <div>
              Combo: 🔥<span className="text-amber-400 font-bold">{practiceStreak}</span>
            </div>
          </div>
        )}

        {appMode === "dataset" && (
          <div className="flex items-center gap-3 shrink-0 bg-slate-900/60 border border-white/5 px-4 py-1.5 rounded-2xl text-[11px] font-mono text-slate-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Amostras: <span className="text-emerald-400 font-bold">{csvSamples.length}</span></span>
          </div>
        )}
      </div>

      {/* Main Container */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden p-3 sm:p-4 md:p-6 gap-4 relative z-0 h-full">
        
        {/* Left Side: Camera Area */}
        <main className="flex-[2] relative rounded-3xl bg-slate-950 border border-white/5 overflow-hidden group shadow-2xl flex flex-col justify-end min-h-[35vh] lg:min-h-0">
          
          {/* Active Detector Stream */}
          <div className="absolute inset-0 w-full h-full bg-slate-900/30">
            {!isVideoReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-4 z-20 bg-slate-950">
                {cameraError ? (
                  <div className="flex flex-col items-center gap-3 px-6 text-center">
                    <VideoOff className="w-10 h-10 text-amber-500" />
                    <p className="text-xs text-amber-200 max-w-sm leading-relaxed">{cameraError}</p>
                    <button 
                      onClick={() => setFacingMode(f => f === "user" ? "environment" : "user")}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-xs rounded-xl border border-white/5 flex items-center gap-2"
                    >
                      <RefreshCw size={12} />
                      Alternar Câmera
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                    <p className="text-[11px] uppercase tracking-widest text-slate-400 font-medium">Iniciando câmera...</p>
                  </div>
                )}
              </div>
            )}

            <video
              ref={videoRef}
              className={`absolute inset-0 w-full h-full object-cover pointer-events-none ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
              playsInline
              autoPlay
              muted
            />
            <canvas
              ref={canvasRef}
              className={`absolute inset-0 w-full h-full object-cover pointer-events-none z-10 ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
            />
          </div>

          {/* Practice Challenge HUD Overlay */}
          <AnimatePresence>
            {appMode === "practice" && isVideoReady && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute top-4 left-4 right-4 flex justify-between items-start gap-3 pointer-events-none z-20"
              >
                {/* Target prompt */}
                <div className="flex items-center gap-3 bg-black/60 backdrop-blur-md border border-white/10 p-3 rounded-2xl max-w-xs pointer-events-auto">
                  {/* Progress Ring */}
                  <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
                    <svg className="w-12 h-12 transform -rotate-90">
                      <circle
                        cx="24"
                        cy="24"
                        r="20"
                        stroke="rgba(255, 255, 255, 0.08)"
                        strokeWidth="3"
                        fill="transparent"
                      />
                      <circle
                        cx="24"
                        cy="24"
                        r="20"
                        stroke="#10b981"
                        strokeWidth="3.5"
                        fill="transparent"
                        strokeDasharray={2 * Math.PI * 20}
                        strokeDashoffset={2 * Math.PI * 20 * (1 - practiceProgress / 100)}
                        className="transition-all duration-100 ease-out"
                      />
                    </svg>
                    <span className="absolute text-xl font-bold text-white">{practiceTarget}</span>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-slate-400">FAÇA O SINAL DA LETRA</div>
                    <div className="text-[11px] font-semibold text-emerald-400">Mantenha a posição</div>
                  </div>
                </div>

                {/* Micro illustration card helper */}
                <div className="bg-slate-900/90 backdrop-blur-md border border-white/10 p-2.5 rounded-2xl w-16 h-16 sm:w-20 sm:h-20 flex flex-col items-center justify-center shrink-0 pointer-events-auto shadow-xl">
                  <span className="text-[8px] uppercase text-slate-500 font-bold mb-1">Dica ({practiceTarget})</span>
                  <img
                    src={`https://commons.wikimedia.org/wiki/Special:FilePath/Sign_language_${practiceTarget}.svg`}
                    alt="Sinal ajuda"
                    className="w-10 h-10 sm:w-12 sm:h-12 object-contain bg-white rounded-lg p-0.5"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                    referrerPolicy="no-referrer"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Quick Stats Overlay (Top Right in Translator Mode) */}
          {appMode === "translator" && isVideoReady && (
            <div className="absolute top-4 left-4 z-20 pointer-events-none">
              <span className="px-3 py-1.5 rounded-full bg-slate-950/70 backdrop-blur-md border border-white/5 text-[9px] uppercase tracking-wider text-slate-300 font-mono">
                Câmera {facingMode === "user" ? "Frontal" : "Traseira"}
              </span>
            </div>
          )}

          {/* Model load state badge */}
          {isModelLoading && !modelError && (
            <div className="absolute inset-0 bg-slate-950/90 z-40 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
              <p className="text-xs text-slate-400 animate-pulse font-mono uppercase tracking-wider">
                Carregando rede neural...
              </p>
            </div>
          )}

          {modelError && (
            <div className="absolute inset-0 bg-slate-950/90 z-40 flex flex-col items-center justify-center gap-3">
              <div className="text-red-500 font-bold mb-2">Erro de Inteligência Artificial</div>
              <p className="text-xs text-slate-400 max-w-sm text-center px-4">
                Não foi possível carregar o modelo de visão computacional. {modelError}
              </p>
              <button 
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded-xl"
              >
                Tentar Novamente
              </button>
            </div>
          )}

          {/* Camera Controls Floating Bar HUD (Bottom Center on video) */}
          {isVideoReady && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2.5 bg-slate-950/80 backdrop-blur-lg border border-white/10 p-2 rounded-full z-20 shadow-2xl">
              {/* Play / Pause Detection */}
              <button
                onClick={() => {
                  setIsDetectionPaused(!isDetectionPaused);
                  if (navigator.vibrate) navigator.vibrate(20);
                }}
                className={`p-2.5 rounded-full text-white transition-all ${
                  isDetectionPaused 
                    ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30" 
                    : "bg-white/5 hover:bg-white/10"
                }`}
                title={isDetectionPaused ? "Retomar Detecção" : "Pausar Detecção"}
              >
                {isDetectionPaused ? <Play size={15} /> : <Pause size={15} />}
              </button>

              {/* Flip camera facingMode */}
              <button
                onClick={() => {
                  setFacingMode(f => f === "user" ? "environment" : "user");
                  if (navigator.vibrate) navigator.vibrate(30);
                }}
                className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 transition-all hover:rotate-180 duration-500"
                title="Trocar Câmera"
              >
                <RefreshCw size={15} />
              </button>

              {/* System Engine Active status */}
              <div className="flex items-center gap-2 px-3 text-[10px] font-mono text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="hidden sm:inline">IA Ativa</span>
              </div>
            </div>
          )}

          {/* Active Gesture Large Display (Centered on Right Side of feed) */}
          <AnimatePresence>
            {activeGesture && isVideoReady && !isDetectionPaused && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8, x: 20 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.8, x: 20 }}
                className="absolute top-20 right-4 flex flex-col items-center gap-1.5 z-20 pointer-events-none"
              >
                <div className="bg-emerald-500/10 backdrop-blur-md border border-emerald-500/30 text-emerald-400 w-16 h-16 flex items-center justify-center rounded-2xl text-4xl font-light shadow-lg shadow-emerald-500/10 transform animate-bounce-short">
                  {activeGesture}
                </div>
                <span className="text-[8px] uppercase text-emerald-500/60 font-mono tracking-widest bg-emerald-500/5 px-2 py-0.5 rounded-full border border-emerald-500/10">
                  Detectado
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Right Side: History / Guidance Panel */}
        <aside className="w-full lg:flex-1 lg:max-w-md flex flex-col gap-4">
          
          {/* Dynamic Helper Panel based on appMode */}
          <div className="flex-1 flex flex-col h-full bg-slate-950 border border-white/5 rounded-3xl p-5 shadow-2xl overflow-hidden">
            
            {appMode === "translator" ? (
              <>
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2">
                    <History size={14} className="text-slate-400" />
                    <h2 className="text-xs uppercase tracking-[0.15em] text-slate-400 font-bold">
                      Frases Salvas
                    </h2>
                  </div>
                  {history.length > 0 && (
                    <button
                      onClick={() => {
                        setHistory([]);
                        localStorage.removeItem("libras_history");
                      }}
                      className="text-[9px] text-red-400/80 hover:text-red-400 uppercase tracking-widest transition-colors font-semibold"
                    >
                      Limpar Tudo
                    </button>
                  )}
                </div>

                <div
                  className="flex-1 overflow-y-auto space-y-3 pr-1 pb-2 custom-scrollbar"
                >
                  {history.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500 italic py-12 gap-3">
                      <History size={28} className="text-slate-700" />
                      <p className="text-xs text-center max-w-[200px] leading-relaxed">
                        Escreva uma tradução no painel abaixo e clique em "Salvar" para arquivar aqui.
                      </p>
                    </div>
                  ) : (
                    history.map((record) => (
                      <div
                        key={record.id}
                        className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 group relative transition-all"
                      >
                        <p className="text-sm text-slate-200 leading-relaxed italic pr-8">
                          "{record.text}"
                        </p>
                        <div className="flex items-center justify-between mt-3">
                          <span className="text-[9px] text-slate-500 uppercase font-mono">
                            {new Date(record.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit"
                            })}
                          </span>
                          <button
                            onClick={() => {
                              if (window.speechSynthesis) {
                                window.speechSynthesis.cancel();
                                const utterance = new SpeechSynthesisUtterance(record.text);
                                utterance.lang = "pt-BR";
                                window.speechSynthesis.speak(utterance);
                              }
                            }}
                            className="p-1 rounded-md bg-white/5 hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-400 transition-all flex items-center justify-center"
                            title="Ler Frase"
                          >
                            <Volume2 size={11} />
                          </button>
                        </div>
                        <button
                          onClick={() => deleteRecord(record.id)}
                          className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-[10px] uppercase tracking-widest text-red-500/70 hover:text-red-500 transition-opacity"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : appMode === "practice" ? (
              // Practice Mode detailed instructions panel
              <div className="flex flex-col h-full justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles size={14} className="text-emerald-400" />
                    <h2 className="text-xs uppercase tracking-[0.15em] text-slate-400 font-bold">
                      Painel de Treino Diário
                    </h2>
                  </div>

                  <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 p-4 rounded-2xl mb-4">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-1.5">
                      <CheckCircle2 size={15} className="text-emerald-400" />
                      Como Funciona?
                    </h3>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Mostre o sinal correspondente à letra exibida na tela. O anel ao redor da letra se encherá conforme você mantém a posição correta. Complete 100% para ganhar pontos!
                    </p>
                  </div>

                  {/* Level Progress Visual Bar */}
                  <div className="space-y-2 bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400">Status do Treino</span>
                      <span className="text-emerald-400 font-mono font-bold">Nível {Math.floor(practiceScore / 50) + 1}</span>
                    </div>
                    <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-white/5">
                      <div 
                        className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-300"
                        style={{ width: `${(practiceScore % 50) * 2}%` }}
                      ></div>
                    </div>
                    <div className="text-[10px] text-slate-500 flex justify-between">
                      <span>Próximo nível</span>
                      <span>{50 - (practiceScore % 50)} pts restantes</span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900/60 p-4 rounded-2xl border border-white/5 text-center mt-4">
                  <p className="text-[10px] text-slate-400 leading-relaxed mb-3">
                    Quer focar em outra letra específica? Abra o guia de sinais e selecione a letra desejada!
                  </p>
                  <button
                    onClick={() => setShowGuide(true)}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-[10px] font-bold uppercase tracking-wider text-slate-200 border border-white/5"
                  >
                    Selecionar Letra no Guia
                  </button>
                </div>
              </div>
            ) : (
              // Dataset CSV Mode Panel
              <div className="flex flex-col h-full overflow-hidden">
                <div className="flex items-center gap-2 mb-3">
                  <Database size={14} className="text-emerald-400" />
                  <h2 className="text-xs uppercase tracking-[0.15em] text-slate-400 font-bold">
                    Controle de Dataset Customizado
                  </h2>
                </div>

                {/* Predictor Toggle Selector */}
                <div className="grid grid-cols-2 bg-slate-900/80 p-1 rounded-xl border border-white/5 mb-4 shrink-0">
                  <button
                    onClick={() => togglePredictorType("heuristic")}
                    className={`px-3 py-2 text-[10px] uppercase tracking-wider font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      predictorType === "heuristic"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Activity size={12} />
                    <span>Algoritmo Padrão</span>
                  </button>
                  <button
                    onClick={() => togglePredictorType("custom")}
                    className={`px-3 py-2 text-[10px] uppercase tracking-wider font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      predictorType === "custom"
                        ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/10"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <FileSpreadsheet size={12} />
                    <span>Seu Dataset CSV</span>
                  </button>
                </div>

                {/* Sub-panels scrollable */}
                <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-2 custom-scrollbar">
                  
                  {/* CSV Import card */}
                  <div className="bg-white/[0.01] border border-white/5 p-4 rounded-2xl relative">
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                      <Upload size={13} className="text-emerald-400" />
                      Importar Planilha CSV (Python)
                    </h3>
                    <p className="text-[10px] text-slate-400 leading-relaxed mb-3">
                      Carregue o CSV contendo landmarks gravados para usar seu próprio modelo matemático k-NN em tempo real.
                    </p>
                    <label className="flex flex-col items-center justify-center border border-dashed border-white/10 hover:border-emerald-500/30 bg-slate-950/40 p-3 rounded-xl cursor-pointer transition-all hover:bg-slate-950/70">
                      <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
                        <FileSpreadsheet size={14} />
                        <span>Escolher Arquivo CSV</span>
                      </div>
                      <input 
                        type="file" 
                        accept=".csv" 
                        onChange={handleCSVUpload} 
                        className="hidden" 
                      />
                    </label>
                    {csvError && (
                      <p className="text-[10px] text-red-400 mt-2 font-mono leading-relaxed">{csvError}</p>
                    )}
                  </div>

                  {/* Realtime Landmark Sample Grabber */}
                  <div className="bg-white/[0.01] border border-white/5 p-4 rounded-2xl relative overflow-hidden">
                    {/* Recording instant visual feedback */}
                    <AnimatePresence>
                      {isRecordingFlash && (
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute inset-0 bg-emerald-500/20 backdrop-blur-sm flex items-center justify-center z-10"
                        >
                          <span className="text-sm font-bold text-emerald-300 flex items-center gap-2 uppercase tracking-widest animate-pulse">
                            <CheckCircle2 size={16} /> Amostra Gravada!
                          </span>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                      <Camera size={13} className="text-emerald-400" />
                      Gravar Amostra ao Vivo
                    </h3>
                    <p className="text-[10px] text-slate-400 leading-relaxed mb-3">
                      Adicione amostras ao vivo do seu próprio sinal. Posicione a mão e clique para capturar instantaneamente as posições.
                    </p>
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={recordLabel}
                        onChange={(e) => setRecordLabel(e.target.value.slice(0, 3).toUpperCase())}
                        placeholder="Letra (ex: A)"
                        className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 w-24 text-center font-bold"
                      />
                      <button
                        onClick={recordSample}
                        className="flex-1 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black text-xs font-bold rounded-xl uppercase tracking-wider transition-all"
                      >
                        Gravar Amostra
                      </button>
                    </div>
                  </div>

                  {/* Visual breakdown of loaded samples */}
                  <div className="bg-white/[0.01] border border-white/5 p-4 rounded-2xl">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                        Amostras no Seu Dataset
                      </h3>
                      {csvSamples.length > 0 && (
                        <button
                          onClick={clearSamples}
                          className="text-[9px] text-red-400 hover:text-red-300 uppercase tracking-wider font-bold"
                        >
                          Limpar Dataset
                        </button>
                      )}
                    </div>

                    {csvSamples.length === 0 ? (
                      <div className="py-6 px-2 text-center text-[10px] text-slate-500 italic bg-slate-950/30 rounded-xl border border-white/5">
                        Nenhum dado customizado carregado. Importe um CSV de Python ou grave amostras ao vivo acima!
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 max-h-[140px] overflow-y-auto pr-1 custom-scrollbar">
                        {Object.entries(
                          csvSamples.reduce<Record<string, number>>((acc, sample) => {
                            acc[sample.label] = (acc[sample.label] || 0) + 1;
                            return acc;
                          }, {})
                        ).map(([label, countVal]) => {
                          const count = countVal as number;
                          return (
                            <div 
                              key={label}
                              className="bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 rounded-xl p-2 flex flex-col items-center justify-center relative group/sample shrink-0 transition-all"
                            >
                              <span className="text-sm font-bold text-white">{label}</span>
                              <span className="text-[9px] text-slate-400 font-mono">{count} amostra{count > 1 ? "s" : ""}</span>
                              <button
                                onClick={() => deleteSampleGroup(label)}
                                className="absolute inset-0 bg-red-600/90 text-white text-[9px] uppercase font-bold rounded-xl flex items-center justify-center opacity-0 group-hover/sample:opacity-100 transition-opacity"
                                title={`Excluir amostras de ${label}`}
                              >
                                Apagar
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Export Card at bottom of side panel */}
                {csvSamples.length > 0 && (
                  <button
                    onClick={exportToCSV}
                    className="w-full mt-3 py-2.5 bg-slate-900 hover:bg-slate-800 rounded-xl text-xs font-bold uppercase tracking-wider text-emerald-400 border border-emerald-500/10 hover:border-emerald-500/30 flex items-center justify-center gap-1.5 transition-all shrink-0"
                  >
                    <Download size={13} />
                    <span>Exportar Dataset CSV</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Real-time translation input card bar (At the bottom, accessible) */}
      <section className="h-auto px-3 sm:px-4 md:px-6 pb-3 sm:pb-4 md:pb-6 shrink-0 relative z-20">
        <div className="w-full bg-[#101114] rounded-3xl border border-white/5 p-4 sm:p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shadow-2xl relative overflow-hidden">
          {/* Decorative left indicator line */}
          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-emerald-500 to-teal-500"></div>

          {/* Translation content display */}
          <div className="flex-1 min-w-0 flex flex-col justify-center pl-2">
            <span className="text-[9px] uppercase tracking-[0.3em] text-emerald-400 font-bold mb-1.5 block">
              {appMode === "translator" ? "Tradução em Tempo Real" : "Modo Treino Ativo"}
            </span>
            <div className="flex items-center gap-3 w-full">
              <h3 className="text-xl sm:text-2xl font-light tracking-tight min-h-[1.75rem] break-all truncate text-white/90">
                {appMode === "translator" ? (
                  currentSentence || (
                    <span className="text-slate-500 italic text-base sm:text-lg">
                      Sinalize para traduzir...
                    </span>
                  )
                ) : (
                  <span className="text-emerald-400 font-semibold flex items-center gap-2 text-base sm:text-lg">
                    <Sparkles size={16} className="animate-spin" />
                    Praticando Letra {practiceTarget}
                  </span>
                )}
                {appMode === "translator" && (
                  <span className="inline-block font-mono text-emerald-400 animate-pulse ml-1">
                    |
                  </span>
                )}
              </h3>
            </div>
          </div>

          {/* Action buttons (Only in translator mode) */}
          {appMode === "translator" && (
            <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center shrink-0">
              {/* Voice speak TTS button */}
              {currentSentence && (
                <button
                  onClick={speakSentence}
                  className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-slate-300 transition-colors flex items-center justify-center border border-white/5 shrink-0"
                  title="Falar Frase"
                >
                  <Volume2 size={16} />
                </button>
              )}

              {/* Copy translation button */}
              {currentSentence && (
                <button
                  onClick={copyToClipboard}
                  className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-slate-300 transition-colors flex items-center justify-center border border-white/5 relative shrink-0"
                  title="Copiar Texto"
                >
                  <Copy size={16} />
                  <AnimatePresence>
                    {copiedNotification && (
                      <motion.span
                        initial={{ opacity: 0, y: 10, scale: 0.9 }}
                        animate={{ opacity: 1, y: -30, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="absolute bg-emerald-500 text-black font-semibold text-[8px] px-2 py-0.5 rounded-full uppercase tracking-widest whitespace-nowrap"
                      >
                        Copiado!
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              )}

              {/* Clear button */}
              {currentSentence && (
                <button
                  onClick={() => setCurrentSentence("")}
                  className="p-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-2xl transition-colors flex items-center justify-center border border-red-500/10 shrink-0"
                  title="Limpar Tradução"
                >
                  <Trash2 size={16} />
                </button>
              )}

              <button
                onClick={saveSentence}
                disabled={!currentSentence}
                className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black text-[10px] sm:text-xs font-bold uppercase tracking-widest hover:shadow-lg hover:shadow-emerald-500/10 disabled:opacity-30 disabled:bg-white/10 disabled:from-slate-800 disabled:to-slate-800 disabled:text-white/30 transition-all flex items-center justify-center gap-1.5"
              >
                <PlusCircle size={14} />
                Salvar Frase
              </button>
            </div>
          )}
        </div>
      </section>

      {/* CSV Column Mapping Wizard Modal */}
      <AnimatePresence>
        {showMappingWizard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-[#0f1115] border border-white/10 rounded-3xl w-full max-w-4xl h-[90vh] md:h-[80vh] flex flex-col overflow-hidden shadow-2xl"
            >
              {/* Header */}
              <header className="p-5 border-b border-white/5 flex justify-between items-center bg-slate-950/40 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400">
                    <FileSpreadsheet size={20} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white tracking-wide">Mapeamento de Colunas do CSV</h2>
                    <p className="text-[10px] text-slate-400">Ajuste como os dados gravados no Python serão interpretados no site.</p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowMappingWizard(false); setUploadedCsvText(""); }}
                  className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </header>

              {/* Main Content Area */}
              <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                {/* Left Side: Preview & Presets */}
                <div className="w-full md:w-[350px] border-b md:border-b-0 md:border-r border-white/5 p-5 flex flex-col gap-4 overflow-y-auto bg-slate-950/20 shrink-0">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Pré-visualização do Sinal</span>
                    <div className="border border-white/5 rounded-2xl overflow-hidden aspect-square bg-slate-950 flex items-center justify-center relative shadow-inner">
                      <canvas
                        ref={wizardPreviewCanvasRef}
                        width={300}
                        height={300}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </div>

                  {/* Axis Inverter */}
                  <label className="flex items-center gap-2.5 p-3 bg-white/[0.02] border border-white/5 rounded-xl cursor-pointer hover:bg-white/[0.04] transition-colors shrink-0">
                    <input
                      type="checkbox"
                      checked={invertCsvY}
                      onChange={(e) => setInvertCsvY(e.target.checked)}
                      className="rounded border-white/10 text-emerald-500 focus:ring-emerald-500/30 bg-slate-900 w-4 h-4"
                    />
                    <div>
                      <span className="text-[11px] font-semibold text-white block">Inverter Eixo Y</span>
                      <span className="text-[9px] text-slate-400 block">Corrigir se a mão parecer de cabeça para baixo</span>
                    </div>
                  </label>

                  {/* Predefinições Rápidas */}
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Predefinições Rápidas (Presets)</span>
                    <div className="flex flex-col gap-1.5">
                      <button
                        onClick={() => applyMappingPreset("autodetect")}
                        className="w-full text-left py-2 px-3 bg-slate-900 hover:bg-slate-800 rounded-xl text-[10px] font-semibold text-slate-300 border border-white/5 hover:border-white/10 flex items-center justify-between"
                      >
                        <span>Autodetectar por Nomes</span>
                        <span className="text-[8px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded">Smart</span>
                      </button>
                      <button
                        onClick={() => applyMappingPreset("mp_3d")}
                        className="w-full text-left py-2 px-3 bg-slate-900 hover:bg-slate-800 rounded-xl text-[10px] font-semibold text-slate-300 border border-white/5 hover:border-white/10 flex items-center justify-between"
                      >
                        <span>MediaPipe Completo (21 pontos 3D)</span>
                        <span className="text-[8px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded font-mono">63 colunas</span>
                      </button>
                      <button
                        onClick={() => applyMappingPreset("mp_2d")}
                        className="w-full text-left py-2 px-3 bg-slate-900 hover:bg-slate-800 rounded-xl text-[10px] font-semibold text-slate-300 border border-white/5 hover:border-white/10 flex items-center justify-between"
                      >
                        <span>MediaPipe Completo (21 pontos 2D)</span>
                        <span className="text-[8px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded font-mono">42 colunas</span>
                      </button>
                      <button
                        onClick={() => applyMappingPreset("tips_3d")}
                        className="w-full text-left py-2 px-3 bg-slate-900 hover:bg-slate-800 rounded-xl text-[10px] font-semibold text-slate-300 border border-white/5 hover:border-white/10 flex items-center justify-between"
                      >
                        <span>Pontas dos Dedos (5 pontos 3D)</span>
                        <span className="text-[8px] bg-sky-500/10 text-sky-400 px-1.5 py-0.5 rounded font-mono">15 colunas</span>
                      </button>
                      <button
                        onClick={() => applyMappingPreset("tips_2d")}
                        className="w-full text-left py-2 px-3 bg-slate-900 hover:bg-slate-800 rounded-xl text-[10px] font-semibold text-slate-300 border border-white/5 hover:border-white/10 flex items-center justify-between"
                      >
                        <span>Pontas dos Dedos (5 pontos 2D)</span>
                        <span className="text-[8px] bg-sky-500/10 text-sky-400 px-1.5 py-0.5 rounded font-mono">10 colunas</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Side: Columns Mapping List */}
                <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0c0e]">
                  <div className="p-3 bg-slate-950/30 border-b border-white/5 text-[10px] text-slate-400 flex items-center justify-between shrink-0 font-mono">
                    <span>Total de Colunas: {csvHeaders.length}</span>
                    <span className="text-emerald-400">Ativas: {columnMappings.filter(m => m.targetLandmark >= 0 || m.coordinate === "label").length}</span>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <div className="grid grid-cols-1 gap-2">
                      {columnMappings.map((m) => {
                        const isActive = m.targetLandmark >= 0 || m.coordinate === "label";
                        return (
                          <div
                            key={m.colIndex}
                            className={`flex flex-col sm:flex-row items-stretch sm:items-center justify-between p-3 rounded-xl border transition-all ${
                              isActive
                                ? "bg-emerald-500/[0.02] border-emerald-500/20 shadow-sm"
                                : "bg-white/[0.01] border-white/5 opacity-60 hover:opacity-100"
                            }`}
                          >
                            <div className="flex items-center gap-3 mb-2 sm:mb-0">
                              <span className="text-[10px] font-mono bg-slate-900 text-slate-400 px-2 py-1 rounded border border-white/5">
                                #{m.colIndex}
                              </span>
                              <div className="min-w-0">
                                <span className="text-xs font-semibold text-white block truncate max-w-[150px] sm:max-w-[180px] font-mono">
                                  {m.header}
                                </span>
                              </div>
                            </div>

                            <div className="flex gap-2 items-center">
                              {/* Destination Joint Select */}
                              <select
                                value={m.coordinate === "label" ? "label" : m.targetLandmark}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === "label") {
                                    updateSingleColumnMapping(m.colIndex, -1, "label");
                                  } else {
                                    updateSingleColumnMapping(m.colIndex, parseInt(val, 10), m.coordinate === "label" ? "x" : m.coordinate);
                                  }
                                }}
                                className="bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white focus:outline-none focus:border-emerald-500 font-medium"
                              >
                                <option value="-1">❌ Ignorar / Descartar</option>
                                <option value="label">🏷️ Letra (Sinal / Label)</option>
                                <optgroup label="Articulações">
                                  {Object.entries(LANDMARK_NAMES).map(([idx, name]) => (
                                    <option key={idx} value={idx}>
                                      {name}
                                    </option>
                                  ))}
                                </optgroup>
                              </select>

                              {/* Coordinate Axis Select (Disabled for Label) */}
                              {m.coordinate !== "label" && (
                                <select
                                  disabled={m.targetLandmark === -1}
                                  value={m.coordinate}
                                  onChange={(e) => {
                                    updateSingleColumnMapping(m.colIndex, m.targetLandmark, e.target.value as "x" | "y" | "z");
                                  }}
                                  className="bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white focus:outline-none focus:border-emerald-500 font-mono disabled:opacity-30"
                                >
                                  <option value="x">Eixo X</option>
                                  <option value="y">Eixo Y</option>
                                  <option value="z">Eixo Z</option>
                                </select>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <footer className="p-4 border-t border-white/5 bg-slate-950/40 flex justify-end gap-3 shrink-0">
                <button
                  onClick={() => { setShowMappingWizard(false); setUploadedCsvText(""); }}
                  className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmCSVImport}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black text-xs font-bold uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-500/10"
                >
                  <CheckCircle2 size={13} />
                  Confirmar e Importar
                </button>
              </footer>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Styled inline components */}
      <style>{`
          @keyframes bounce-short {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-4px); }
          }
          .animate-bounce-short {
            animation: bounce-short 1.6s ease-in-out infinite;
          }
          ::-webkit-scrollbar {
            width: 4px;
            height: 4px;
          }
          ::-webkit-scrollbar-track {
            background: transparent; 
          }
          ::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.08); 
            border-radius: 10px;
          }
          ::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.15); 
          }
        `}</style>
    </div>
  );
}
