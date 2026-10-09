import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Camera,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Sparkles,
  UserCheck,
  ChevronRight,
  Shield,
  FileText,
  Award,
  Download,
  Trash2,
  Calendar,
  Send,
  Eye,
  Check,
  ArrowLeft,
  Settings2,
  ExternalLink,
  Info,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { VRMCanvas } from './VRMCanvas';
import { soundManager, waitForPersonaVoice, getPersonaVoice } from '../lib/audio';
import { AI_PROFILE } from '../constants';
import { AvatarEmotion } from '../lib/emotionDetector';

interface InterviewPageProps {
  onNavigateHome: () => void;
  onNavigateToChat: () => void;
}

type InterviewStage = 'lobby' | 'meeting' | 'recruiter_review';

type MeetingPhase =
  | 'joining'
  | 'welcome'
  | 'question_1'
  | 'question_2'
  | 'task_written'
  | 'task_pressure'
  | 'task_snapshot'
  | 'candidate_qa'
  | 'wrapup';

interface SnapshotItem {
  id: string;
  angle: 'forward' | 'left' | 'right';
  label: string;
  dataUrl: string;
  timestamp: string;
}

interface QuestionResponse {
  phase: string;
  question: string;
  answer: string;
  timestamp: string;
  aiNotes?: string;
}

function calculateAgreementMatch(spoken: string): number {
  const target = 'i am ready to start my interview and i agree to the rules';
  const cleanSpoken = spoken.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleanSpoken) return 0;

  if (cleanSpoken.includes(target) || (target.includes(cleanSpoken) && cleanSpoken.length >= 40)) {
    return 100;
  }

  const targetWords = target.split(' ');
  const spokenWords = cleanSpoken.split(' ');

  let matchCount = 0;
  for (const word of targetWords) {
    if (spokenWords.includes(word)) {
      matchCount++;
    }
  }

  const wordRatio = Math.round((matchCount / targetWords.length) * 100);

  // Core trigger phrase check: "i am ready to start my interview" (7 of 13 words = 54%)
  if (cleanSpoken.includes('i am ready to start my interview')) {
    const extraWords = ['and', 'agree', 'to', 'the', 'rules'];
    let extraHits = 0;
    for (const w of extraWords) {
      if (cleanSpoken.includes(w)) extraHits++;
    }
    // Base 60% + up to 40% for the agreement phrase
    const combined = Math.min(100, 60 + extraHits * 10);
    return Math.max(wordRatio, combined);
  }

  return wordRatio;
}

export const InterviewPage: React.FC<InterviewPageProps> = ({
  onNavigateHome,
  onNavigateToChat,
}) => {
  // ----------------------------------------------------
  // Stage State
  // ----------------------------------------------------
  const [stage, setStage] = useState<InterviewStage>('lobby');
  const [activePov, setActivePov] = useState<'candidate' | 'recruiter'>('candidate');

  // Meeting ID extracted from URL query params (default 'demo')
  const [interviewId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('id') || 'demo';
    }
    return 'demo';
  });

  // Candidate Profile Information
  const [candidateName, setCandidateName] = useState<string>('Alex Rivera');
  const [targetRole, setTargetRole] = useState<string>('Senior Full Stack & AI Systems Engineer');

  // Lobby Speech Agreement ("I am ready to start my interview and I agree to the rules")
  const [hasAgreedToRules, setHasAgreedToRules] = useState<boolean>(false);
  const [lobbySpokenText, setLobbySpokenText] = useState<string>('');
  const [lobbyMatchPercent, setLobbyMatchPercent] = useState<number>(0);
  const [lobbySpeechError, setLobbySpeechError] = useState<string | null>(null);
  const [isLobbyListening, setIsLobbyListening] = useState<boolean>(false);

  // Media Devices & Streams
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');
  const [selectedAudioId, setSelectedAudioId] = useState<string>('');
  const [isCameraActive, setIsCameraActive] = useState<boolean>(true);
  const [isMicActive, setIsMicActive] = useState<boolean>(true);
  const [hasPermissions, setHasPermissions] = useState<boolean>(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Audio Testing in Lobby
  const [micVolume, setMicVolume] = useState<number>(0);
  const [isSpeakerTesting, setIsSpeakerTesting] = useState<boolean>(false);

  // Refs for Media Streams & Recorders
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const lobbyVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micAnimFrameRef = useRef<number | null>(null);

  // Video Recording System
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [recordedDuration, setRecordedDuration] = useState<number>(0);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Meeting Progression State
  const [meetingPhase, setMeetingPhase] = useState<MeetingPhase>('joining');
  const [hanaEntered, setHanaEntered] = useState<boolean>(false);
  const [hanaEmotion, setHanaEmotion] = useState<AvatarEmotion>('neutral');
  const [hanaIsSpeaking, setHanaIsSpeaking] = useState<boolean>(false);
  const [hanaReactionText, setHanaReactionText] = useState<string>('');

  // Edge case: User interruption detection & resume prefix
  const hanaIsSpeakingRef = useRef<boolean>(false);
  const currentHanaLineRef = useRef<string>('');
  const wasInterruptedRef = useRef<boolean>(false);
  const speechResumeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Speech Recognition (Candidate speech to text)
  const [candidateLiveTranscript, setCandidateLiveTranscript] = useState<string>('');
  const [isCandidateSpeaking, setIsCandidateSpeaking] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);

  // Spotlight Tasks Data
  // Task 1: Written assessment (>= 100 characters)
  const [writtenText, setWrittenText] = useState<string>('');
  const [writtenSubmitted, setWrittenSubmitted] = useState<boolean>(false);

  // Task 2: Situational assessment (Radio buttons)
  const [pressureRating, setPressureRating] = useState<string>('');
  const [pressureSubmitted, setPressureSubmitted] = useState<boolean>(false);

  // Task 3: Visual Identity Snapshots (Forward, Left, Right via trigger words "click", "do it", "okay", "ready")
  const [snapshotStep, setSnapshotStep] = useState<0 | 1 | 2 | 3>(0); // 0: not started, 1: forward, 2: left, 3: right
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [isListeningForTrigger, setIsListeningForTrigger] = useState<boolean>(false);
  const [lastDetectedTrigger, setLastDetectedTrigger] = useState<string | null>(null);

  // Candidate Q&A
  const [candidateQuestionInput, setCandidateQuestionInput] = useState<string>('');
  const [qaHistory, setQaHistory] = useState<Array<{ sender: 'candidate' | 'hana'; text: string }>>([]);

  // Log of all responses for Recruiter Review
  const [recordedResponses, setRecordedResponses] = useState<QuestionResponse[]>([]);

  // Recruiter Dashboard State
  const [candidateStatus, setCandidateStatus] = useState<'under_review' | 'shortlisted' | 'rejected'>('under_review');
  const [recruiterActiveTab, setRecruiterActiveTab] = useState<'recording' | 'responses' | 'resume'>('recording');
  const [recordingPlaybackSpeed, setRecordingPlaybackSpeed] = useState<number>(1);
  const reviewVideoPlayerRef = useRef<HTMLVideoElement | null>(null);
  const [isReviewPlaying, setIsReviewPlaying] = useState<boolean>(false);
  const [reviewCurrentTime, setReviewCurrentTime] = useState<number>(0);
  const [selectedSnapshotModal, setSelectedSnapshotModal] = useState<string | null>(null);

  // ----------------------------------------------------
  // Initialize Media Devices & Stream in Lobby
  // ----------------------------------------------------
  const startCameraStream = useCallback(async (vDeviceId?: string, aDeviceId?: string) => {
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: vDeviceId ? { deviceId: { exact: vDeviceId } } : { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: aDeviceId ? { deviceId: { exact: aDeviceId } } : true,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      if (lobbyVideoRef.current) {
        lobbyVideoRef.current.srcObject = stream;
      }
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      setHasPermissions(true);
      setPermissionError(null);

      // Setup audio analysis for live mic volume meter
      setupAudioMeter(stream);

      // Enumerate available devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const vDevs = devices.filter((d) => d.kind === 'videoinput');
      const aDevs = devices.filter((d) => d.kind === 'audioinput');
      setVideoDevices(vDevs);
      setAudioDevices(aDevs);

      if (!selectedVideoId && vDevs[0]) setSelectedVideoId(vDevs[0].deviceId);
      if (!selectedAudioId && aDevs[0]) setSelectedAudioId(aDevs[0].deviceId);
    } catch (err: any) {
      console.warn('Media permission error:', err);
      setPermissionError(err?.message || 'Camera or microphone access denied');
      setHasPermissions(false);
    }
  }, [selectedVideoId, selectedAudioId]);

  const setupAudioMeter = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateMeter = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setMicVolume(normalized);

        // Track candidate speaking state
        if (normalized > 18) {
          setIsCandidateSpeaking(true);
          handleCandidateSpeechActivity();
        } else {
          setIsCandidateSpeaking(false);
        }

        micAnimFrameRef.current = requestAnimationFrame(updateMeter);
      };

      updateMeter();
    } catch {
      // AudioContext meter fallback
    }
  };

  useEffect(() => {
    startCameraStream();
    return () => {
      if (micAnimFrameRef.current) cancelAnimationFrame(micAnimFrameRef.current);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  // Live Lobby Speech Detection for Meeting Agreement Phrase
  useEffect(() => {
    if (stage !== 'lobby') return;

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setLobbySpeechError('Web Speech API is not supported in this browser. You can click to agree manually.');
      return;
    }

    let isDisposed = false;
    let recognition: any = null;

    try {
      recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        if (!isDisposed) {
          setIsLobbyListening(true);
          setLobbySpeechError(null);
        }
      };

      recognition.onresult = (event: any) => {
        if (isDisposed) return;
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }

        const combined = (final || interim).trim();
        if (combined) {
          setLobbySpokenText(combined);
          const score = calculateAgreementMatch(combined);
          setLobbyMatchPercent(score);

          if (score >= 80) {
            setHasAgreedToRules(true);
            soundManager.playSend();
          }
        }
      };

      recognition.onerror = (e: any) => {
        if (isDisposed) return;
        if (e.error === 'not-allowed') {
          setLobbySpeechError('Microphone permission required for speech verification.');
        } else if (e.error !== 'no-speech') {
          setLobbySpeechError(`Speech recognition: ${e.error || 'Check microphone input'}`);
        }
      };

      recognition.onend = () => {
        if (!isDisposed && stage === 'lobby' && !hasAgreedToRules) {
          try {
            recognition.start();
          } catch {}
        } else {
          setIsLobbyListening(false);
        }
      };

      recognition.start();
    } catch (err: any) {
      setLobbySpeechError(err?.message || 'Speech recognition initialization failed.');
    }

    return () => {
      isDisposed = true;
      try {
        recognition?.stop();
      } catch {}
    };
  }, [stage, hasAgreedToRules]);

  // Speaker audio test
  const handleTestSpeaker = () => {
    setIsSpeakerTesting(true);
    soundManager.playReceive();
    try {
      const uttr = new SpeechSynthesisUtterance('Audio output test successful. Can you hear this clearly?');
      uttr.rate = 1.05;
      uttr.pitch = 1.25;
      const voice = getPersonaVoice();
      if (voice) uttr.voice = voice;
      uttr.onend = () => setIsSpeakerTesting(false);
      uttr.onerror = () => setIsSpeakerTesting(false);
      window.speechSynthesis?.speak(uttr);
    } catch {
      setIsSpeakerTesting(false);
    }
  };

  // Toggle local tracks
  const toggleCamera = () => {
    if (mediaStreamRef.current) {
      const videoTrack = mediaStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraActive(videoTrack.enabled);
      }
    }
  };

  const toggleMic = () => {
    if (mediaStreamRef.current) {
      const audioTrack = mediaStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicActive(audioTrack.enabled);
      }
    }
  };

  // ----------------------------------------------------
  // Speech Synthesis & Interruption Logic (Hana Voice)
  // ----------------------------------------------------
  const speakHanaLine = useCallback(
    async (text: string, onDone?: () => void, emotion: AvatarEmotion = 'neutral') => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        onDone?.();
        return;
      }

      window.speechSynthesis.cancel();
      currentHanaLineRef.current = text;
      hanaIsSpeakingRef.current = true;
      setHanaIsSpeaking(true);
      setHanaEmotion(emotion);

      const voice = await waitForPersonaVoice(1500);
      const utterance = new SpeechSynthesisUtterance(text);
      if (voice) utterance.voice = voice;
      utterance.pitch = 1.25;
      utterance.rate = 1.05;

      utterance.onend = () => {
        hanaIsSpeakingRef.current = false;
        setHanaIsSpeaking(false);
        setHanaEmotion('neutral');
        onDone?.();
      };

      utterance.onerror = (e) => {
        if (e.error !== 'interrupted' && e.error !== 'canceled') {
          console.warn('Hana speech error:', e);
        }
        hanaIsSpeakingRef.current = false;
        setHanaIsSpeaking(false);
      };

      window.speechSynthesis.speak(utterance);
    },
    []
  );

  // Interruption handling: candidate speaks while Hana is explaining
  const handleCandidateSpeechActivity = useCallback(() => {
    if (hanaIsSpeakingRef.current) {
      // User is talking while Hana is speaking!
      window.speechSynthesis.cancel();
      hanaIsSpeakingRef.current = false;
      setHanaIsSpeaking(false);
      wasInterruptedRef.current = true;
      setHanaEmotion('surprised');
      setHanaReactionText('Listening to you...');

      if (speechResumeTimeoutRef.current) clearTimeout(speechResumeTimeoutRef.current);

      // Wait until candidate stops talking for 1.8 seconds, then resume with prefix
      speechResumeTimeoutRef.current = setTimeout(() => {
        if (wasInterruptedRef.current && currentHanaLineRef.current) {
          wasInterruptedRef.current = false;
          const resumeText = `Oh, okay. As we were saying... ${currentHanaLineRef.current}`;
          speakHanaLine(resumeText, undefined, 'happy');
        }
      }, 1800);
    }
  }, [speakHanaLine]);

  // ----------------------------------------------------
  // Candidate Speech Recognition (Real-Time Audio Input)
  // ----------------------------------------------------
  useEffect(() => {
    if (stage !== 'meeting') return;

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    try {
      const recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }

        const combined = (final || interim).trim();
        setCandidateLiveTranscript(combined);

        // Check for trigger words for snapshot verification: "click", "do it", "okay", "ready"
        if (isListeningForTrigger && combined) {
          const lower = combined.toLowerCase();
          const triggers = ['click', 'do it', 'okay', 'ready'];
          const matched = triggers.find((t) => lower.includes(t));
          if (matched) {
            setLastDetectedTrigger(matched);
            handleTakeSnapshotTrigger();
          }
        }

        // Contextual reactions from Hana while candidate is answering
        if (combined.length > 25 && !hanaIsSpeakingRef.current) {
          const reactions = ['Hmm...', 'I see', 'Got it', 'Understood'];
          const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
          setHanaReactionText(randomReaction);
          setHanaEmotion('neutral');
        }
      };

      recognition.onerror = () => {
        // Continue quietly
      };

      recognition.onend = () => {
        // Restart if still in meeting
        if (stage === 'meeting') {
          try {
            recognition.start();
          } catch {}
        }
      };

      recognition.start();
      recognitionRef.current = recognition;

      return () => {
        try {
          recognition.stop();
        } catch {}
      };
    } catch {}
  }, [stage, isListeningForTrigger]);

  // ----------------------------------------------------
  // Video Recording Engine (MediaRecorder)
  // ----------------------------------------------------
  const startRecordingSession = () => {
    if (!mediaStreamRef.current) return;
    try {
      recordedChunksRef.current = [];
      const options = { mimeType: 'video/webm;codecs=vp8,opus' };
      let recorder: MediaRecorder;

      try {
        recorder = new MediaRecorder(mediaStreamRef.current, options);
      } catch {
        recorder = new MediaRecorder(mediaStreamRef.current);
      }

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const fullBlob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const videoUrl = URL.createObjectURL(fullBlob);
        setRecordedVideoUrl(videoUrl);
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;

      setRecordedDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordedDuration((prev) => prev + 1);
      }, 1000);
    } catch (e) {
      console.warn('MediaRecorder error:', e);
    }
  };

  const stopRecordingSession = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
  };

  // ----------------------------------------------------
  // Enter Meeting & Start Phases
  // ----------------------------------------------------
  const handleJoinMeeting = () => {
    setStage('meeting');
    setActivePov('candidate');
    setMeetingPhase('joining');

    startRecordingSession();
    soundManager.playSend();

    // Hana enters shortly (within 3 seconds)
    setTimeout(() => {
      setHanaEntered(true);
      soundManager.playReceive();

      // Hana welcomes the candidate
      setMeetingPhase('welcome');
      const welcomeText = `Hello! Welcome to your interview with MuxAI. I'm Hana, your AI screening partner today. It's wonderful to meet you, ${candidateName}! Can you hear and see me clearly?`;
      speakHanaLine(welcomeText, () => {
        // Transition to Question 1
        setTimeout(() => {
          advanceToPhase('question_1');
        }, 1500);
      }, 'happy');
    }, 2400);
  };

  const advanceToPhase = (nextPhase: MeetingPhase) => {
    setMeetingPhase(nextPhase);
    setCandidateLiveTranscript('');

    if (nextPhase === 'question_1') {
      const q1 = "Let's begin with a quick introduction. Could you tell me a bit about yourself, your background, and what drives your passion for this role?";
      speakHanaLine(q1, undefined, 'neutral');
    } else if (nextPhase === 'question_2') {
      const q2 = "Thank you! Now, could you walk me through a challenging technical problem or project you tackled recently? How did you approach resolving it?";
      speakHanaLine(q2, undefined, 'neutral');
    } else if (nextPhase === 'task_written') {
      const prompt = "Before we continue, we have a short written assessment. Please take your time to write down 3 things you like about yourself and why.";
      speakHanaLine(prompt, undefined, 'happy');
    } else if (nextPhase === 'task_pressure') {
      const prompt = "Next is a quick situational assessment regarding workload and pressure. Please select the option that best reflects your working style.";
      speakHanaLine(prompt, undefined, 'neutral');
    } else if (nextPhase === 'task_snapshot') {
      const prompt = "For our verification check, we have a quick visual task! Please write down your phone number on a piece of paper and hold it up to the camera. We'll capture three angles: looking forward, looking left, and looking right while continuing to hold the paper up. When you are ready at each angle, say 'click', 'do it', 'okay', or 'ready'!";
      setSnapshotStep(1);
      setIsListeningForTrigger(true);
      speakHanaLine(prompt, undefined, 'happy');
    } else if (nextPhase === 'candidate_qa') {
      const prompt = "Awesome! We're almost at the end of our session. Do you have any questions for the recruiter or about the team and role?";
      speakHanaLine(prompt, undefined, 'happy');
    } else if (nextPhase === 'wrapup') {
      const closing = `Thank you so much for your time today, ${candidateName}! You did fantastic. The recruiting team will review your session, answers, and visual verification, and we'll follow up with you very soon. Have a wonderful rest of your day!`;
      speakHanaLine(closing, () => {
        setTimeout(() => {
          handleEndMeetingAndReview();
        }, 2000);
      }, 'happy');
    }
  };

  // Submit candidate answer for Question 1 & 2
  const handleConfirmAnswer = (qKey: 'question_1' | 'question_2') => {
    const text = candidateLiveTranscript || (qKey === 'question_1' ? 'General introduction provided.' : 'Technical challenge overview provided.');
    const qTitle =
      qKey === 'question_1'
        ? 'Candidate Introduction & Motivation'
        : 'Technical Challenge & Problem Solving';

    setRecordedResponses((prev) => [
      ...prev,
      {
        phase: qKey,
        question: qTitle,
        answer: text,
        timestamp: new Date().toLocaleTimeString(),
        aiNotes: 'Clear articulation, strong self-confidence and domain relevance.',
      },
    ]);

    soundManager.playSend();

    if (qKey === 'question_1') {
      const acknowledge = 'Thank you for sharing that! That gives great insight into your journey.';
      speakHanaLine(acknowledge, () => {
        advanceToPhase('question_2');
      }, 'happy');
    } else {
      const acknowledge = 'Understood! That was a very pragmatic approach to solving that challenge.';
      speakHanaLine(acknowledge, () => {
        advanceToPhase('task_written');
      }, 'neutral');
    }
  };

  // Submit written task (Must be >= 100 characters)
  const handleSubmitWrittenTask = () => {
    if (writtenText.trim().length < 100) return;
    setWrittenSubmitted(true);
    soundManager.playSend();

    setRecordedResponses((prev) => [
      ...prev,
      {
        phase: 'task_written',
        question: 'Write down 3 things you like about yourself and why.',
        answer: writtenText.trim(),
        timestamp: new Date().toLocaleTimeString(),
        aiNotes: `Written reflection evaluated (${writtenText.trim().length} chars). High self-awareness and structured delivery.`,
      },
    ]);

    const acknowledge = 'Thank you for completing that! Great reflections. Let us move to the next item.';
    speakHanaLine(acknowledge, () => {
      advanceToPhase('task_pressure');
    }, 'happy');
  };

  // Submit situational pressure choice
  const handleSubmitPressureRating = () => {
    if (!pressureRating) return;
    setPressureSubmitted(true);
    soundManager.playSend();

    setRecordedResponses((prev) => [
      ...prev,
      {
        phase: 'task_pressure',
        question: 'How well do you perform under pressure?',
        answer: pressureRating,
        timestamp: new Date().toLocaleTimeString(),
        aiNotes: `Selected style: "${pressureRating}". Demonstrates dynamic adaptability under deadline stress.`,
      },
    ]);

    let acknowledge = 'Got it! Noted on your performance preferences.';
    if (pressureRating.includes('HELL YEAH')) {
      acknowledge = "Haha, 'HELL YEAH'! I love that energy! Confidence under high-stakes deliveries is always valued.";
    }

    speakHanaLine(acknowledge, () => {
      advanceToPhase('task_snapshot');
    }, 'smug');
  };

  // ----------------------------------------------------
  // Snapshot Capture Station with Voice Trigger ("click", "do it", "okay", "ready")
  // ----------------------------------------------------
  const handleTakeSnapshotTrigger = () => {
    soundManager.playSend();

    // Capture image from local video feed
    const video = localVideoRef.current || lobbyVideoRef.current;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

    const angles: Array<'forward' | 'left' | 'right'> = ['forward', 'left', 'right'];
    const currentAngle = angles[snapshotStep - 1] || 'forward';

    const newSnapshot: SnapshotItem = {
      id: `snap_${Date.now()}`,
      angle: currentAngle,
      label: currentAngle === 'forward' ? 'Looking Forward' : currentAngle === 'left' ? 'Looking Left' : 'Looking Right',
      dataUrl,
      timestamp: new Date().toLocaleTimeString(),
    };

    setSnapshots((prev) => [...prev, newSnapshot]);

    if (snapshotStep === 1) {
      setSnapshotStep(2);
      speakHanaLine("Great! Now turn your head to look left while holding the paper up.", undefined, 'happy');
    } else if (snapshotStep === 2) {
      setSnapshotStep(3);
      speakHanaLine("Perfect! Now turn your head to look right while continuing to hold the paper.", undefined, 'happy');
    } else if (snapshotStep === 3) {
      setIsListeningForTrigger(false);
      speakHanaLine("Awesome! Visual identity verification capture completed.", () => {
        advanceToPhase('candidate_qa');
      }, 'happy');
    }
  };

  // Candidate Q&A handling
  const handleSendCandidateQuestion = () => {
    const qText = candidateQuestionInput.trim();
    if (!qText) return;

    setQaHistory((prev) => [...prev, { sender: 'candidate', text: qText }]);
    setCandidateQuestionInput('');
    soundManager.playSend();

    // Hana responds
    setTimeout(() => {
      let answer = "That's a fantastic question! At MuxAI, our team focuses on pushing frontier autonomous AI agents while giving engineers autonomy to experiment and ship directly. Collaboration is open and high-velocity.";
      if (qText.toLowerCase().includes('salary') || qText.toLowerCase().includes('compensation')) {
        answer = "Compensation packages are highly competitive with full equity packages and top-tier benefits, discussed in detail at the offer stage.";
      } else if (qText.toLowerCase().includes('remote') || qText.toLowerCase().includes('location')) {
        answer = "We are remote-first with flexible hubs globally, giving you freedom in your setup.";
      }

      setQaHistory((prev) => [...prev, { sender: 'hana', text: answer }]);
      speakHanaLine(answer, undefined, 'happy');
    }, 600);
  };

  const handleFinishQaNoQuestions = () => {
    advanceToPhase('wrapup');
  };

  // ----------------------------------------------------
  // End Meeting & Transition to Recruiter Review Mode
  // ----------------------------------------------------
  const handleEndMeetingAndReview = () => {
    stopRecordingSession();
    window.speechSynthesis?.cancel();
    setStage('recruiter_review');
    setActivePov('recruiter');
  };

  // Recruiter actions
  const handleShortlistCandidate = () => {
    setCandidateStatus('shortlisted');
    soundManager.playReceive();
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
    });
  };

  const handleRejectCandidate = () => {
    setCandidateStatus('rejected');
    soundManager.playSend();
  };

  const handleDiscardRecording = () => {
    if (confirm('Are you sure you want to discard this interview recording?')) {
      if (recordedVideoUrl) URL.revokeObjectURL(recordedVideoUrl);
      setRecordedVideoUrl(null);
      recordedChunksRef.current = [];
    }
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remaining = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`;
  };

  // ----------------------------------------------------
  // STAGE 1: LOBBY & PRE-INTERVIEW SETUP (Mercor Style)
  // ----------------------------------------------------
  if (stage === 'lobby') {
    return (
      <div className="min-h-screen bg-[#0e1017] text-white flex flex-col font-sans select-none">
        {/* Top Navigation */}
        <header className="h-16 border-b border-white/10 px-6 flex items-center justify-between bg-[#141622]/80 backdrop-blur-md sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onNavigateHome}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white transition-colors cursor-pointer"
              title="Return to Home"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <h1 className="font-bold text-sm sm:text-base font-heading tracking-tight text-white">
                Hana Interview
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="px-3.5 py-1 rounded-full bg-white/10 text-neutral-300 font-mono text-xs font-semibold">
              ID: {interviewId}
            </span>
          </div>
        </header>

        {/* Main Lobby Container */}
        <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col justify-center">
          <div className="mb-8 text-center sm:text-left">
            <h2 className="text-2xl sm:text-4xl font-bold font-heading text-white tracking-tight">
              Get ready for your interview
            </h2>
            <p className="text-neutral-400 text-sm sm:text-base mt-2 max-w-2xl">
              Let&apos;s check if your camera and microphone are working properly before joining the meeting room.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 7 cols: Live Camera Feed & Device Selectors */}
            <div className="lg:col-span-7 space-y-4">
              <div className="relative aspect-video rounded-3xl overflow-hidden bg-black/60 border border-white/10 shadow-2xl flex items-center justify-center group">
                <video
                  ref={lobbyVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover transform -scale-x-100 ${!isCameraActive ? 'hidden' : ''}`}
                />

                {!isCameraActive && (
                  <div className="flex flex-col items-center gap-3 text-neutral-400">
                    <VideoOff className="w-12 h-12 stroke-[1.5]" />
                    <span className="text-sm">Camera is currently turned off</span>
                  </div>
                )}

                {permissionError && (
                  <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-6 text-center z-20">
                    <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
                    <h4 className="text-base font-bold text-white">Camera Access Required</h4>
                    <p className="text-xs text-neutral-300 max-w-md mt-1">{permissionError}</p>
                    <button
                      type="button"
                      onClick={() => startCameraStream()}
                      className="mt-4 px-4 py-2 rounded-xl text-xs font-semibold bg-[#55d2f6] text-black hover:opacity-90 cursor-pointer"
                    >
                      Grant Device Permissions
                    </button>
                  </div>
                )}

                {/* Video Overlay Controls */}
                <div className="absolute bottom-4 inset-x-4 flex items-center justify-between pointer-events-none z-10">
                  <div className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center gap-2 pointer-events-auto">
                    <span className={`w-2 h-2 rounded-full ${isCameraActive ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    <span className="text-xs text-white font-medium">{candidateName}</span>
                  </div>

                  <div className="flex items-center gap-2 pointer-events-auto">
                    <button
                      type="button"
                      onClick={toggleCamera}
                      className={`p-3 rounded-full backdrop-blur-md border transition-all cursor-pointer ${
                        isCameraActive
                          ? 'bg-white/10 border-white/15 text-white hover:bg-white/20'
                          : 'bg-red-500/30 border-red-500 text-red-200 hover:bg-red-500/40'
                      }`}
                      title={isCameraActive ? 'Turn Off Camera' : 'Turn On Camera'}
                    >
                      {isCameraActive ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={toggleMic}
                      className={`p-3 rounded-full backdrop-blur-md border transition-all cursor-pointer ${
                        isMicActive
                          ? 'bg-white/10 border-white/15 text-white hover:bg-white/20'
                          : 'bg-red-500/30 border-red-500 text-red-200 hover:bg-red-500/40'
                      }`}
                      title={isMicActive ? 'Mute Microphone' : 'Unmute Microphone'}
                    >
                      {isMicActive ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Hardware Source Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
                  <label className="text-xs text-neutral-400 font-medium block mb-1.5">Camera Source</label>
                  <select
                    value={selectedVideoId}
                    onChange={(e) => {
                      setSelectedVideoId(e.target.value);
                      startCameraStream(e.target.value, selectedAudioId);
                    }}
                    className="w-full text-xs bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-[#55d2f6]"
                  >
                    {videoDevices.map((d, i) => (
                      <option key={d.deviceId || i} value={d.deviceId} className="bg-neutral-900">
                        {d.label || `Camera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
                  <label className="text-xs text-neutral-400 font-medium block mb-1.5">Microphone Source</label>
                  <select
                    value={selectedAudioId}
                    onChange={(e) => {
                      setSelectedAudioId(e.target.value);
                      startCameraStream(selectedVideoId, e.target.value);
                    }}
                    className="w-full text-xs bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-[#55d2f6]"
                  >
                    {audioDevices.map((d, i) => (
                      <option key={d.deviceId || i} value={d.deviceId} className="bg-neutral-900">
                        {d.label || `Microphone ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Real-time Voice Agreement Prompt Row */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                <p className="text-xs text-neutral-300 leading-relaxed">
                  To start the meeting, please say{' '}
                  <strong className="text-white font-bold">I am ready to start my interview</strong> and I agree to the rules.
                </p>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 text-xs font-mono">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isLobbyListening ? 'bg-emerald-400 animate-ping' : 'bg-neutral-500'
                      }`}
                    />
                    <span className="text-neutral-400 truncate">
                      {lobbySpokenText ? `Heard: "${lobbySpokenText}"` : 'Listening for phrase...'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        hasAgreedToRules
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : lobbyMatchPercent > 0
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-white/10 text-neutral-400'
                      }`}
                    >
                      {lobbyMatchPercent}% Match
                    </span>
                  </div>
                </div>

                {lobbySpeechError && (
                  <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2 text-xs text-amber-300">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                      <span className="truncate">{lobbySpeechError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setHasAgreedToRules(true);
                        setLobbyMatchPercent(100);
                        soundManager.playSend();
                      }}
                      className="text-xs font-semibold text-[#55d2f6] hover:underline shrink-0 cursor-pointer"
                    >
                      Agree Manually
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right 5 cols: Readiness Checklist & Join Button */}
            <div className="lg:col-span-5 space-y-5">
              <div className="p-6 rounded-3xl bg-[#141624] border border-white/10 shadow-xl space-y-6">
                <div>
                  <h3 className="text-lg font-bold font-heading text-white">Interview Readiness</h3>
                  <p className="text-xs text-neutral-400 mt-1">
                    Please make sure you are ready before you begin.
                  </p>
                </div>

                {/* Candidate Info Input (Only Full Name) */}
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="text-xs font-semibold text-neutral-300 block mb-1">Your Full Name</label>
                    <input
                      type="text"
                      value={candidateName}
                      onChange={(e) => setCandidateName(e.target.value)}
                      placeholder="e.g. Alex Rivera"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-black/30 border border-white/10 text-white text-sm focus:outline-none focus:border-[#55d2f6]"
                    />
                  </div>
                </div>

                {/* Live Mic Volume Test Meter */}
                <div className="p-4 rounded-2xl bg-black/30 border border-white/5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-neutral-300 flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5 text-[#55d2f6]" />
                      <span>Microphone Input Level</span>
                    </span>
                    <span className="font-mono text-neutral-400">
                      {micVolume > 10 ? 'Detecting Voice' : 'Quiet'}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-75 rounded-full ${
                        micVolume > 60 ? 'bg-emerald-400' : micVolume > 15 ? 'bg-[#55d2f6]' : 'bg-neutral-500'
                      }`}
                      style={{ width: `${Math.min(100, micVolume * 1.5)}%` }}
                    />
                  </div>
                </div>

                {/* Speaker Audio Output Test */}
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-black/30 border border-white/5">
                  <div className="flex items-center gap-2.5">
                    <Volume2 className="w-4 h-4 text-neutral-300" />
                    <div>
                      <span className="text-xs font-medium text-white block">Speaker Audio Test</span>
                      <span className="text-[11px] text-neutral-400 block">Hear sample AI recruiter tone</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleTestSpeaker}
                    disabled={isSpeakerTesting}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer shrink-0"
                  >
                    {isSpeakerTesting ? 'Playing Sound...' : 'Test Sound'}
                  </button>
                </div>

                {/* Checklist Badges with Red X and Green Checkmark indicators */}
                <div className="space-y-2.5 pt-2 border-t border-white/10">
                  <div className="flex items-center gap-2 text-xs">
                    {hasPermissions && isCameraActive ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                    )}
                    <span
                      className={
                        hasPermissions && isCameraActive ? 'text-neutral-200' : 'text-red-300 font-medium'
                      }
                    >
                      Camera stream connected &amp; ready
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    {hasPermissions && isMicActive && (micVolume > 5 || lobbySpokenText.length > 0) ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                    )}
                    <span
                      className={
                        hasPermissions && isMicActive && (micVolume > 5 || lobbySpokenText.length > 0)
                          ? 'text-neutral-200'
                          : 'text-red-300 font-medium'
                      }
                    >
                      Microphone input detected
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    {hasAgreedToRules ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                    )}
                    <span className={hasAgreedToRules ? 'text-neutral-200' : 'text-red-300 font-medium'}>
                      Agreement with meeting policies
                    </span>
                  </div>
                </div>

                {/* Join Interview Button */}
                <button
                  type="button"
                  onClick={handleJoinMeeting}
                  disabled={!hasPermissions || !isCameraActive || !isMicActive || !hasAgreedToRules}
                  className="w-full py-4 rounded-2xl text-sm font-bold bg-[#55d2f6] text-neutral-950 hover:bg-[#8ce0fa] active:scale-95 transition-all shadow-lg shadow-[#55d2f6]/20 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none"
                >
                  <span>Enter Video Screening Room</span>
                  <ChevronRight className="w-4 h-4 stroke-[3]" />
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ----------------------------------------------------
  // STAGE 2: LIVE VIDEO MEETING ROOM (Mercor style)
  // ----------------------------------------------------
  if (stage === 'meeting') {
    const isSpotlightActive =
      meetingPhase === 'task_written' ||
      meetingPhase === 'task_pressure' ||
      meetingPhase === 'task_snapshot';

    return (
      <div className="h-screen w-screen bg-[#0b0c12] text-white flex flex-col font-sans overflow-hidden select-none">
        {/* Meeting Header Bar */}
        <header className="h-14 border-b border-white/10 px-4 sm:px-6 flex items-center justify-between bg-[#12141f] shrink-0 z-30">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-mono font-bold">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              <span>REC {formatSeconds(recordedDuration)}</span>
            </div>
            <div className="hidden sm:block">
              <span className="text-xs font-semibold text-white block">
                Hana Interview Session • Room #{interviewId}
              </span>
              <span className="text-[10px] text-neutral-400 block">{targetRole}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleEndMeetingAndReview}
              className="px-3.5 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-xs font-semibold transition-colors cursor-pointer"
            >
              End Interview
            </button>
          </div>
        </header>

        {/* Video Conference Layout */}
        <main className="flex-1 p-3 sm:p-4 overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 grid gap-4 min-h-0 h-full overflow-hidden">
            {/* Standard Conversational Layout (Two large tiles) */}
            {!isSpotlightActive && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full min-h-0">
                {/* Tile 1: Hana (AI Interviewer) */}
                <div className="relative rounded-3xl bg-[#141624] border border-white/10 shadow-2xl overflow-hidden flex flex-col items-center justify-center">
                  {!hanaEntered ? (
                    <div className="flex flex-col items-center gap-4 text-center p-6 animate-pulse">
                      <div className="w-20 h-20 rounded-full bg-[#55d2f6]/20 border border-[#55d2f6]/40 flex items-center justify-center text-[#55d2f6]">
                        <UserCheck className="w-10 h-10" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg text-white font-heading">
                          Hana is entering the meeting...
                        </h3>
                        <p className="text-xs text-neutral-400 mt-1">Connecting 3D neural stream</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Live 3D VRM Canvas (Subtitles disabled as requested) */}
                      <div className="w-full h-full relative">
                        <VRMCanvas
                          isSpeaking={hanaIsSpeaking}
                          emotion={hanaEmotion}
                          modelFileName="hana_v1.2_vrm1.vrm"
                        />
                      </div>

                      {/* Speaking Glow Halo */}
                      {hanaIsSpeaking && (
                        <div className="absolute inset-0 pointer-events-none ring-2 ring-[#55d2f6]/50 rounded-3xl animate-pulse" />
                      )}

                      {/* Reaction Tag (Nods, "hmm", "I see", etc.) */}
                      {hanaReactionText && !hanaIsSpeaking && (
                        <div className="absolute top-4 left-4 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-xs text-[#55d2f6] font-mono animate-in fade-in">
                          {hanaReactionText}
                        </div>
                      )}
                    </>
                  )}

                  {/* Tile Label */}
                  <div className="absolute bottom-4 left-4 px-3.5 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/10 flex items-center gap-2 z-10">
                    <span className={`w-2 h-2 rounded-full ${hanaIsSpeaking ? 'bg-[#55d2f6] animate-pulse' : 'bg-emerald-400'}`} />
                    <span className="text-xs font-semibold text-white">Hana (AI Talent Partner)</span>
                  </div>
                </div>

                {/* Tile 2: Candidate Video Feed */}
                <div className="relative rounded-3xl bg-black border border-white/10 shadow-2xl overflow-hidden flex items-center justify-center">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover transform -scale-x-100 ${!isCameraActive ? 'hidden' : ''}`}
                  />

                  {!isCameraActive && (
                    <div className="flex flex-col items-center gap-2 text-neutral-400">
                      <VideoOff className="w-10 h-10" />
                      <span className="text-xs">Camera Turned Off</span>
                    </div>
                  )}

                  {/* Candidate Tile Label & Controls */}
                  <div className="absolute bottom-4 inset-x-4 flex items-center justify-between z-10">
                    <div className="px-3.5 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/10 flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${isCandidateSpeaking ? 'bg-[#55d2f6] animate-ping' : 'bg-emerald-400'}`} />
                      <span className="text-xs font-semibold text-white">{candidateName} (You)</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={toggleCamera}
                        className={`p-2.5 rounded-full backdrop-blur-md border transition-all cursor-pointer ${
                          isCameraActive ? 'bg-white/10 border-white/15 text-white' : 'bg-red-500/30 border-red-500 text-red-200'
                        }`}
                      >
                        {isCameraActive ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={toggleMic}
                        className={`p-2.5 rounded-full backdrop-blur-md border transition-all cursor-pointer ${
                          isMicActive ? 'bg-white/10 border-white/15 text-white' : 'bg-red-500/30 border-red-500 text-red-200'
                        }`}
                      >
                        {isMicActive ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Spotlight Dynamic Layout (Tasks: Written, Pressure, Snapshots) */}
            {isSpotlightActive && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full min-h-0">
                {/* Left 4 cols: Compact Participant Video Tiles */}
                <div className="lg:col-span-4 flex flex-col gap-3 min-h-0">
                  {/* Hana Mini Tile */}
                  <div className="relative rounded-2xl bg-[#141624] border border-white/10 overflow-hidden flex-1 min-h-[160px]">
                    <div className="w-full h-full relative">
                      <VRMCanvas
                        isSpeaking={hanaIsSpeaking}
                        emotion={hanaEmotion}
                        modelFileName="hana_v1.2_vrm1.vrm"
                      />
                    </div>
                    <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-[11px] font-semibold text-white z-10">
                      Hana (AI Recruiter)
                    </div>
                  </div>

                  {/* Candidate Mini Tile */}
                  <div className="relative rounded-2xl bg-black border border-white/10 overflow-hidden flex-1 min-h-[160px]">
                    <video
                      autoPlay
                      playsInline
                      muted
                      ref={(el) => {
                        if (el && mediaStreamRef.current) el.srcObject = mediaStreamRef.current;
                      }}
                      className="w-full h-full object-cover transform -scale-x-100"
                    />
                    <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-[11px] font-semibold text-white z-10">
                      {candidateName}
                    </div>
                  </div>
                </div>

                {/* Right 8 cols: Spotlight Frame */}
                <div className="lg:col-span-8 rounded-3xl bg-[#141624] border border-white/15 p-6 shadow-2xl flex flex-col justify-between overflow-y-auto">
                  {/* 1. SPOTLIGHT: Written Assessment (Must be >= 100 chars) */}
                  {meetingPhase === 'task_written' && (
                    <div className="space-y-4 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#55d2f6]/10 text-[#55d2f6] text-xs font-semibold mb-2">
                          <FileText className="w-3.5 h-3.5" />
                          <span>Interactive Written Assessment</span>
                        </div>
                        <h3 className="text-xl sm:text-2xl font-bold font-heading text-white">
                          Write down 3 things you like about yourself and why.
                        </h3>
                        <p className="text-xs sm:text-sm text-neutral-400 mt-1">
                          Reflect on your personal strengths, values, or technical curiosity. Minimum 100 characters required.
                        </p>
                      </div>

                      <div className="space-y-2 flex-1 flex flex-col">
                        <textarea
                          rows={6}
                          value={writtenText}
                          onChange={(e) => setWrittenText(e.target.value)}
                          placeholder="1. I love diving deep into architectural puzzles because...&#10;2. I value empathetic communication with team members...&#10;3. I am resilient and relentless when debugging critical edge cases..."
                          className="w-full flex-1 p-4 rounded-2xl bg-black/40 border border-white/15 text-white text-sm focus:outline-none focus:border-[#55d2f6] resize-none leading-relaxed"
                        />
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span
                            className={
                              writtenText.trim().length >= 100
                                ? 'text-emerald-400 font-bold'
                                : 'text-amber-400'
                            }
                          >
                            {writtenText.trim().length} / 100 characters minimum
                          </span>
                          {writtenText.trim().length >= 100 && (
                            <span className="text-emerald-400 flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" /> Ready to submit
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="pt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={handleSubmitWrittenTask}
                          disabled={writtenText.trim().length < 100 || writtenSubmitted}
                          className="px-6 py-3 rounded-2xl text-xs sm:text-sm font-bold bg-[#55d2f6] text-neutral-950 hover:bg-[#8ce0fa] active:scale-95 transition-all shadow-md cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
                        >
                          Confirm &amp; Submit Written Task
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 2. SPOTLIGHT: Situational Pressure Rating */}
                  {meetingPhase === 'task_pressure' && (
                    <div className="space-y-6 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#55d2f6]/10 text-[#55d2f6] text-xs font-semibold mb-2">
                          <Award className="w-3.5 h-3.5" />
                          <span>Situational Behavior Check</span>
                        </div>
                        <h3 className="text-xl sm:text-2xl font-bold font-heading text-white">
                          How well do you perform under pressure?
                        </h3>
                        <p className="text-xs sm:text-sm text-neutral-400 mt-1">
                          Select the answer that most genuinely reflects your reaction to challenging constraints.
                        </p>
                      </div>

                      <div className="space-y-3">
                        {[
                          'Not at all - I avoid such situations',
                          'Moderate - I can work as long as the team does, too',
                          'Comfortable - I find challenging situations very exciting for me',
                          'HELL YEAH - I do not fear pressure; pressure fears me',
                        ].map((opt) => (
                          <label
                            key={opt}
                            className={`flex items-center gap-3.5 p-4 rounded-2xl border transition-all cursor-pointer ${
                              pressureRating === opt
                                ? 'bg-[#55d2f6]/15 border-[#55d2f6] text-white shadow-md'
                                : 'bg-black/30 border-white/10 hover:border-white/20 text-neutral-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name="pressure"
                              checked={pressureRating === opt}
                              onChange={() => setPressureRating(opt)}
                              className="accent-[#55d2f6] w-4 h-4"
                            />
                            <span className="text-sm font-medium">{opt}</span>
                          </label>
                        ))}
                      </div>

                      <div className="pt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={handleSubmitPressureRating}
                          disabled={!pressureRating || pressureSubmitted}
                          className="px-6 py-3 rounded-2xl text-xs sm:text-sm font-bold bg-[#55d2f6] text-neutral-950 hover:bg-[#8ce0fa] active:scale-95 transition-all shadow-md cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
                        >
                          Confirm Pressure Assessment
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 3. SPOTLIGHT: Visual Verification Snapshots (Voice Trigger: "click", "do it", "okay", "ready") */}
                  {meetingPhase === 'task_snapshot' && (
                    <div className="space-y-4 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#55d2f6]/10 text-[#55d2f6] text-xs font-semibold mb-2">
                          <Camera className="w-3.5 h-3.5" />
                          <span>Candidate Visual Verification</span>
                        </div>
                        <h3 className="text-xl sm:text-2xl font-bold font-heading text-white">
                          Hold your phone number on paper &amp; pose for 3 angles
                        </h3>
                        <p className="text-xs sm:text-sm text-neutral-400 mt-1">
                          Say aloud <strong className="text-[#55d2f6]">&quot;click&quot;</strong>,{' '}
                          <strong className="text-[#55d2f6]">&quot;do it&quot;</strong>,{' '}
                          <strong className="text-[#55d2f6]">&quot;okay&quot;</strong>, or{' '}
                          <strong className="text-[#55d2f6]">&quot;ready&quot;</strong> to capture each shot!
                        </p>
                      </div>

                      {/* Current Angle Guide */}
                      <div className="p-4 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-[#55d2f6]/20 border border-[#55d2f6]/40 flex items-center justify-center text-[#55d2f6] font-bold">
                            {snapshotStep}/3
                          </div>
                          <div>
                            <span className="text-xs text-neutral-400 block font-medium">Target Angle:</span>
                            <span className="text-sm font-bold text-white block">
                              {snapshotStep === 1
                                ? '1. Look Forward (Holding Paper)'
                                : snapshotStep === 2
                                ? '2. Look Left (Holding Paper)'
                                : '3. Look Right (Holding Paper)'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {lastDetectedTrigger && (
                            <span className="text-xs font-mono text-emerald-400 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30">
                              Heard &quot;{lastDetectedTrigger}&quot;!
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={handleTakeSnapshotTrigger}
                            className="px-4 py-2 rounded-xl text-xs font-bold bg-[#55d2f6] text-neutral-950 hover:bg-[#8ce0fa] active:scale-95 transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>Capture Now</span>
                          </button>
                        </div>
                      </div>

                      {/* Snapshot Previews */}
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { angle: 'forward', label: '1. Forward' },
                          { angle: 'left', label: '2. Looking Left' },
                          { angle: 'right', label: '3. Looking Right' },
                        ].map((slot, sIdx) => {
                          const existing = snapshots.find((s) => s.angle === slot.angle);
                          return (
                            <div
                              key={slot.angle}
                              className="aspect-video rounded-2xl bg-black/50 border border-white/10 overflow-hidden relative flex flex-col items-center justify-center"
                            >
                              {existing ? (
                                <>
                                  <img
                                    src={existing.dataUrl}
                                    alt={existing.label}
                                    className="w-full h-full object-cover transform -scale-x-100"
                                  />
                                  <div className="absolute top-2 right-2 p-1 rounded-full bg-emerald-500 text-white">
                                    <Check className="w-3 h-3 stroke-[3]" />
                                  </div>
                                </>
                              ) : (
                                <div className="text-center p-2">
                                  <span className="text-[11px] text-neutral-500 block font-medium">
                                    {slot.label}
                                  </span>
                                  {snapshotStep === sIdx + 1 && (
                                    <span className="text-[10px] text-[#55d2f6] block mt-1 animate-pulse">
                                      Ready for Pose
                                    </span>
                                  )}
                                </div>
                              )}
                              <span className="absolute bottom-1.5 left-2 text-[10px] bg-black/60 px-2 py-0.5 rounded-full text-white/80">
                                {slot.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Conversational Controls (When in Q1, Q2, QA) */}
          {(meetingPhase === 'question_1' || meetingPhase === 'question_2' || meetingPhase === 'candidate_qa') && (
            <div className="mt-3 p-3.5 rounded-2xl bg-[#141624] border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-neutral-300 block truncate">
                    {meetingPhase === 'candidate_qa'
                      ? 'Candidate Q&A: Ask questions about MuxAI'
                      : 'Live Mic Transcription:'}
                  </span>
                  <p className="text-xs text-white truncate max-w-lg">
                    {candidateLiveTranscript || (isCandidateSpeaking ? 'Speaking...' : 'Listening to your microphone...')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                {meetingPhase === 'question_1' && (
                  <button
                    type="button"
                    onClick={() => handleConfirmAnswer('question_1')}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-[#55d2f6] text-neutral-950 hover:bg-[#8ce0fa] active:scale-95 transition-all cursor-pointer"
                  >
                    Confirm Answer &amp; Proceed
                  </button>
                )}

                {meetingPhase === 'question_2' && (
                  <button
                    type="button"
                    onClick={() => handleConfirmAnswer('question_2')}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-[#55d2f6] text-neutral-950 hover:bg-[#8ce0fa] active:scale-95 transition-all cursor-pointer"
                  >
                    Confirm Answer &amp; Proceed
                  </button>
                )}

                {meetingPhase === 'candidate_qa' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={candidateQuestionInput}
                      onChange={(e) => setCandidateQuestionInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendCandidateQuestion()}
                      placeholder="Type question for Hana..."
                      className="px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-[#55d2f6] w-52"
                    />
                    <button
                      type="button"
                      onClick={handleSendCandidateQuestion}
                      className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                      title="Send question"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleFinishQaNoQuestions}
                      className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#55d2f6] text-neutral-950 hover:bg-[#8ce0fa] cursor-pointer"
                    >
                      No Further Questions
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ----------------------------------------------------
  // STAGE 3: RECRUITER POV DOSSIER & RECORDING REVIEW
  // ----------------------------------------------------
  return (
    <div className="min-h-screen bg-[#0e1017] text-white flex flex-col font-sans select-none">
      {/* Top Header */}
      <header className="h-16 border-b border-white/10 px-6 flex items-center justify-between bg-[#141622]/90 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onNavigateHome}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="font-bold text-sm sm:text-base font-heading text-white">
              Recruiter Evaluation Dossier
            </h1>
            <span className="text-[11px] text-neutral-400">
              Autonomous AI Hiring Assessment • MuxAI Talent Suite
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setStage('meeting');
              setActivePov('candidate');
            }}
            className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-neutral-200 transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Return to Candidate Meeting</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setStage('lobby');
              setMeetingPhase('joining');
              setHanaEntered(false);
              recordedChunksRef.current = [];
              setRecordedVideoUrl(null);
            }}
            className="px-3.5 py-1.5 rounded-xl bg-[#55d2f6] text-neutral-950 hover:bg-[#8ce0fa] text-xs font-bold transition-colors cursor-pointer"
          >
            New Interview Session
          </button>
        </div>
      </header>

      {/* Main Dossier Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Candidate Profile Header Card */}
        <div className="p-6 rounded-3xl bg-[#141624] border border-white/10 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#55d2f6] to-[#0f9bc7] text-neutral-950 flex items-center justify-center font-bold text-2xl font-heading shadow-lg shadow-[#55d2f6]/20">
              {candidateName.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-bold font-heading text-white">
                  {candidateName}
                </h2>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-semibold capitalize ${
                    candidateStatus === 'shortlisted'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : candidateStatus === 'rejected'
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  {candidateStatus.replace('_', ' ')}
                </span>
              </div>
              <p className="text-sm text-neutral-400 mt-0.5">{targetRole}</p>
              <div className="flex items-center gap-3 text-xs text-neutral-500 mt-2">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Session Length: {formatSeconds(recordedDuration)}</span>
                </span>
                <span>•</span>
                <span>Interviewer: Hana (AI Agent)</span>
              </div>
            </div>
          </div>

          {/* Action Buttons: Shortlist / Reject */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleRejectCandidate}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                candidateStatus === 'rejected'
                  ? 'bg-red-500/30 border-red-500 text-white'
                  : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              Reject Candidate
            </button>
            <button
              type="button"
              onClick={handleShortlistCandidate}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-md ${
                candidateStatus === 'shortlisted'
                  ? 'bg-emerald-500 text-white shadow-emerald-500/20'
                  : 'bg-emerald-500/90 hover:bg-emerald-500 text-white'
              }`}
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Shortlist for Round 2</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-3">
          {[
            { id: 'recording', label: 'Video & Audio Recording', icon: Video },
            { id: 'responses', label: 'Assessment Answers & Verification', icon: FileText },
            { id: 'resume', label: 'Candidate Resume / CV', icon: UserCheck },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = recruiterActiveTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRecruiterActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  active
                    ? 'bg-[#55d2f6] text-neutral-950 shadow-sm'
                    : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: Real Session Video & Audio Recording Playback */}
        {recruiterActiveTab === 'recording' && (
          <div className="space-y-4">
            <div className="aspect-video max-w-4xl mx-auto rounded-3xl bg-black border border-white/15 overflow-hidden shadow-2xl relative flex flex-col justify-end group">
              {recordedVideoUrl ? (
                <video
                  ref={reviewVideoPlayerRef}
                  src={recordedVideoUrl}
                  playsInline
                  onTimeUpdate={() => {
                    if (reviewVideoPlayerRef.current) {
                      setReviewCurrentTime(reviewVideoPlayerRef.current.currentTime);
                    }
                  }}
                  onEnded={() => setIsReviewPlaying(false)}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-neutral-500">
                  <VideoOff className="w-12 h-12 mb-3" />
                  <p className="text-sm">No recorded video found for this session</p>
                </div>
              )}

              {/* Custom Playback Controls Overlay */}
              {recordedVideoUrl && (
                <div className="p-4 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-col gap-2">
                  <input
                    type="range"
                    min={0}
                    max={reviewVideoPlayerRef.current?.duration || 100}
                    value={reviewCurrentTime}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (reviewVideoPlayerRef.current) {
                        reviewVideoPlayerRef.current.currentTime = val;
                        setReviewCurrentTime(val);
                      }
                    }}
                    className="w-full accent-[#55d2f6] cursor-pointer"
                  />

                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          if (!reviewVideoPlayerRef.current) return;
                          if (isReviewPlaying) {
                            reviewVideoPlayerRef.current.pause();
                            setIsReviewPlaying(false);
                          } else {
                            reviewVideoPlayerRef.current.play();
                            setIsReviewPlaying(true);
                          }
                        }}
                        className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white cursor-pointer"
                      >
                        {isReviewPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>
                      <span className="font-mono text-neutral-300">
                        {formatSeconds(Math.floor(reviewCurrentTime))} / {formatSeconds(recordedDuration)}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Playback Speed */}
                      <div className="flex items-center gap-1 bg-white/10 rounded-xl p-1">
                        {[1, 1.25, 1.5, 2].map((sp) => (
                          <button
                            key={sp}
                            type="button"
                            onClick={() => {
                              setRecordingPlaybackSpeed(sp);
                              if (reviewVideoPlayerRef.current) reviewVideoPlayerRef.current.playbackRate = sp;
                            }}
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-mono cursor-pointer ${
                              recordingPlaybackSpeed === sp ? 'bg-[#55d2f6] text-black font-bold' : 'text-neutral-400'
                            }`}
                          >
                            {sp}x
                          </button>
                        ))}
                      </div>

                      {/* Download Recording */}
                      <a
                        href={recordedVideoUrl}
                        download={`interview-recording-${candidateName.toLowerCase().replace(/\s+/g, '-')}.webm`}
                        className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                        title="Download Recording (.webm)"
                      >
                        <Download className="w-4 h-4" />
                      </a>

                      <button
                        type="button"
                        onClick={handleDiscardRecording}
                        className="p-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 cursor-pointer"
                        title="Discard Recording"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: Candidate Responses & Verification Photos */}
        {recruiterActiveTab === 'responses' && (
          <div className="space-y-6">
            {/* Visual Identity Snapshots */}
            <div className="p-6 rounded-3xl bg-[#141624] border border-white/10 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold font-heading text-white">Visual Identity Verification</h3>
                  <p className="text-xs text-neutral-400">Captured camera feed holding written phone number</p>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold">
                  3/3 Angles Approved
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {snapshots.length > 0 ? (
                  snapshots.map((snap) => (
                    <div
                      key={snap.id}
                      onClick={() => setSelectedSnapshotModal(snap.dataUrl)}
                      className="rounded-2xl bg-black/40 border border-white/10 overflow-hidden group cursor-pointer hover:border-[#55d2f6]/50 transition-all shadow-md"
                    >
                      <div className="aspect-video relative overflow-hidden">
                        <img
                          src={snap.dataUrl}
                          alt={snap.label}
                          className="w-full h-full object-cover transform -scale-x-100 group-hover:scale-105 transition-transform"
                        />
                        <div className="absolute top-2 right-2 p-1 rounded-full bg-black/60 text-emerald-400">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      </div>
                      <div className="p-3 bg-[#171a29] flex items-center justify-between text-xs">
                        <span className="font-semibold text-white">{snap.label}</span>
                        <span className="text-neutral-500 font-mono text-[10px]">{snap.timestamp}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-3 p-6 text-center text-neutral-500 text-xs">
                    No static snapshot captures were submitted during this session.
                  </div>
                )}
              </div>
            </div>

            {/* Questions & Assessment Submissions Timeline */}
            <div className="p-6 rounded-3xl bg-[#141624] border border-white/10 shadow-xl space-y-4">
              <h3 className="text-base font-bold font-heading text-white">Assessment Responses</h3>

              <div className="space-y-4">
                {/* Written Task */}
                <div className="p-4 rounded-2xl bg-black/30 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[#55d2f6]">Written Assessment: Self-Reflection</span>
                    <span className="text-neutral-400 font-mono text-[11px]">
                      {writtenText.trim().length} characters
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 font-medium">
                    &quot;Write down 3 things you like about yourself and why.&quot;
                  </p>
                  <p className="text-xs text-white leading-relaxed bg-white/5 p-3 rounded-xl whitespace-pre-line border border-white/5">
                    {writtenText || 'No written submission recorded.'}
                  </p>
                </div>

                {/* Pressure Rating */}
                <div className="p-4 rounded-2xl bg-black/30 border border-white/10 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[#55d2f6]">Situational Behavior Rating</span>
                    <span className="text-emerald-400 font-semibold">Verified</span>
                  </div>
                  <p className="text-xs text-neutral-400">
                    &quot;How well do you perform under pressure?&quot;
                  </p>
                  <p className="text-xs text-white font-semibold bg-white/5 p-2.5 rounded-xl border border-white/5">
                    {pressureRating || 'Not answered'}
                  </p>
                </div>

                {/* All Audio / Recorded Q&A items */}
                {recordedResponses.map((item, idx) => (
                  <div key={idx} className="p-4 rounded-2xl bg-black/30 border border-white/10 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-white">{item.question}</span>
                      <span className="text-neutral-500 font-mono text-[11px]">{item.timestamp}</span>
                    </div>
                    <p className="text-xs text-neutral-300 leading-relaxed bg-white/5 p-3 rounded-xl border border-white/5">
                      {item.answer}
                    </p>
                    {item.aiNotes && (
                      <div className="text-[11px] text-neutral-400 flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-[#55d2f6]" />
                        <span>AI Notes: {item.aiNotes}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Candidate Resume & CV Viewer */}
        {recruiterActiveTab === 'resume' && (
          <div className="max-w-4xl mx-auto p-8 rounded-3xl bg-white text-neutral-900 shadow-2xl space-y-6 font-sans">
            <div className="border-b border-black/10 pb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold font-heading text-black">{candidateName}</h2>
                <p className="text-sm font-semibold text-[#0f9bc7] mt-0.5">{targetRole}</p>
                <p className="text-xs text-neutral-600 mt-1">
                  alex.rivera@example.com • +1 (555) 234-5678 • San Francisco, CA
                </p>
              </div>
              <div className="text-xs text-neutral-500 font-mono">Verified Candidate Dossier</div>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-bold font-heading uppercase tracking-wider text-neutral-500 mb-1.5">
                  Professional Summary
                </h4>
                <p className="text-xs leading-relaxed text-neutral-700">
                  Full Stack Engineer with 6+ years specializing in distributed systems, real-time WebSockets, WebGL / Three.js 3D pipelines, and multi-agent AI architectures. Passionate about autonomous workflows and intuitive interactive experiences.
                </p>
              </div>

              <div>
                <h4 className="text-xs font-bold font-heading uppercase tracking-wider text-neutral-500 mb-2">
                  Core Technical Skills
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'TypeScript',
                    'React 19',
                    'Node.js & Express',
                    'Three.js / WebGL',
                    'Web Speech API',
                    'MediaRecorder API',
                    'PostgreSQL / NeonDB',
                    'Gemini API & LLMs',
                    'WebSockets / WebRTC',
                    'Tailwind CSS',
                  ].map((s) => (
                    <span key={s} className="px-2.5 py-1 rounded-md bg-neutral-100 text-neutral-800 text-xs font-medium">
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold font-heading uppercase tracking-wider text-neutral-500 mb-3">
                  Experience History
                </h4>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-black">Staff Engineer • Autonomous Interactive Systems</span>
                      <span className="text-neutral-500">2022 - Present</span>
                    </div>
                    <p className="text-xs text-neutral-600 mt-1">
                      Architected high-throughput AI companion runtime with sub-200ms latency, handling multimodal vision, voice synthesis, and low-latency browser streaming.
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-black">Senior Software Engineer • Realtime Cloud Labs</span>
                      <span className="text-neutral-500">2019 - 2022</span>
                    </div>
                    <p className="text-xs text-neutral-600 mt-1">
                      Built video conferencing infrastructure, client media recording pipelines, and reactive canvas interaction systems.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold font-heading uppercase tracking-wider text-neutral-500 mb-1.5">
                  Education &amp; Credentials
                </h4>
                <p className="text-xs text-neutral-700">
                  B.S. in Computer Science • University of California, Berkeley (2019)
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Snapshot Zoom Lightbox Modal */}
      {selectedSnapshotModal && (
        <div
          className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setSelectedSnapshotModal(null)}
        >
          <div className="max-w-3xl w-full rounded-2xl overflow-hidden shadow-2xl border border-white/20 bg-black">
            <img
              src={selectedSnapshotModal}
              alt="Snapshot Zoom"
              className="w-full h-auto object-contain transform -scale-x-100"
            />
          </div>
        </div>
      )}
    </div>
  );
};
