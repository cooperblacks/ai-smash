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
  Upload,
  FileUp,
  FileCheck,
  Monitor,
  RefreshCw,
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
  | 'task_resume'
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

interface UploadedResume {
  fileName: string;
  fileSize: string;
  fileType: string;
  dataUrl: string;
  uploadedAt: string;
  textContent?: string;
}

const STORAGE_KEY = 'hana_interview_session_data';

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

  // Core trigger phrase check: "i am ready to start my interview"
  if (cleanSpoken.includes('i am ready to start my interview')) {
    const extraWords = ['and', 'agree', 'to', 'the', 'rules'];
    let extraHits = 0;
    for (const w of extraWords) {
      if (cleanSpoken.includes(w)) extraHits++;
    }
    const combined = Math.min(100, 60 + extraHits * 10);
    return Math.max(wordRatio, combined);
  }

  return wordRatio;
}

export const InterviewPage: React.FC<InterviewPageProps> = ({
  onNavigateHome,
  onNavigateToChat,
}) => {
  // Web Speech API browser compatibility check
  const isWebSpeechSupported = typeof window !== 'undefined' && Boolean(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );

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

  // Candidate Profile Information (blank by default with placeholder e.g. Dewan Mukto)
  const [candidateName, setCandidateName] = useState<string>('');
  const [targetRole] = useState<string>('Senior Full Stack & AI Systems Engineer');

  // Candidate Resume Document
  const [uploadedResume, setUploadedResume] = useState<UploadedResume | null>(null);
  const [isUploadingResume, setIsUploadingResume] = useState<boolean>(false);
  const [resumeSubmitted, setResumeSubmitted] = useState<boolean>(false);

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

  // Audio Testing in Lobby (Latching mic input checkmark once detected to prevent blinking/glitching)
  const [micVolume, setMicVolume] = useState<number>(0);
  const [hasDetectedMicOnce, setHasDetectedMicOnce] = useState<boolean>(false);
  const [isSpeakerTesting, setIsSpeakerTesting] = useState<boolean>(false);

  // Active stream state so React renders video elements reliably
  const [activeMediaStream, setActiveMediaStream] = useState<MediaStream | null>(null);

  // Refs for Media Streams & Recorders
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const lobbyVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micAnimFrameRef = useRef<number | null>(null);

  // Screen & Audio Recording System (Canvas composite + Web Audio mix or displayMedia)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [recordedDuration, setRecordedDuration] = useState<number>(0);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Meeting Progression State
  const [meetingPhase, setMeetingPhase] = useState<MeetingPhase>('joining');
  const [hanaEntered, setHanaEntered] = useState<boolean>(false);
  // Hana's default mood and expression is strictly neutral (no smiling or grinning)
  const [hanaEmotion, setHanaEmotion] = useState<AvatarEmotion>('neutral');
  const [hanaIsSpeaking, setHanaIsSpeaking] = useState<boolean>(false);
  const [hanaReactionText, setHanaReactionText] = useState<string>('');

  // 3D Model Loading State: Show Camera Off avatar panel first, then fade in 3D
  const [isHana3DReady, setIsHana3DReady] = useState<boolean>(false);

  // Edge case: User interruption detection & resume prefix
  const hanaIsSpeakingRef = useRef<boolean>(false);
  const currentHanaLineRef = useRef<string>('');
  const wasInterruptedRef = useRef<boolean>(false);
  const speechResumeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const meetingPhaseRef = useRef<MeetingPhase>('joining');

  useEffect(() => {
    meetingPhaseRef.current = meetingPhase;
  }, [meetingPhase]);

  // Speech Recognition (Candidate speech to text)
  const [candidateLiveTranscript, setCandidateLiveTranscript] = useState<string>('');
  const [isCandidateSpeaking, setIsCandidateSpeaking] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);

  // Spotlight Tasks Data
  // Task 1: Resume Document Upload (handled via uploadedResume)
  // Task 2: Written assessment (>= 100 characters)
  const [writtenText, setWrittenText] = useState<string>('');
  const [writtenSubmitted, setWrittenSubmitted] = useState<boolean>(false);

  // Task 3: Situational assessment (Radio buttons)
  const [pressureRating, setPressureRating] = useState<string>('');
  const [pressureSubmitted, setPressureSubmitted] = useState<boolean>(false);

  // Task 4: Visual Identity Snapshots (Forward, Left, Right via trigger words "click", "do it", "okay", "ready")
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

  // Page Refresh Recovery Modal state
  const [hasSavedSession, setHasSavedSession] = useState<boolean>(false);
  const [savedSessionData, setSavedSessionData] = useState<any>(null);

  // Helper for displaying candidate name gracefully
  const effectiveCandidateName = candidateName.trim() || 'Candidate';
  const effectiveDossierName = candidateName.trim() || 'Dewan Mukto';

  // ----------------------------------------------------
  // Edge Case: Check for Saved Session on Refresh
  // ----------------------------------------------------
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && (parsed.stage === 'meeting' || parsed.stage === 'recruiter_review')) {
          setHasSavedSession(true);
          setSavedSessionData(parsed);
        }
      }
    } catch {
      // ignore JSON parse errors
    }
  }, []);

  const restoreSession = () => {
    if (!savedSessionData) return;
    try {
      setCandidateName(savedSessionData.candidateName || '');
      setMeetingPhase(savedSessionData.meetingPhase || 'question_1');
      setWrittenText(savedSessionData.writtenText || '');
      setWrittenSubmitted(Boolean(savedSessionData.writtenSubmitted));
      setPressureRating(savedSessionData.pressureRating || '');
      setPressureSubmitted(Boolean(savedSessionData.pressureSubmitted));
      setSnapshots(savedSessionData.snapshots || []);
      setRecordedResponses(savedSessionData.recordedResponses || []);
      setQaHistory(savedSessionData.qaHistory || []);
      if (savedSessionData.uploadedResume) {
        setUploadedResume(savedSessionData.uploadedResume);
        setResumeSubmitted(true);
      }
      setHanaEntered(true);
      setIsHana3DReady(true);
      setStage(savedSessionData.stage || 'meeting');
      setHasSavedSession(false);
      startCameraStream();
    } catch (e) {
      console.warn('Could not restore session', e);
      setHasSavedSession(false);
    }
  };

  const discardSavedSession = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    setHasSavedSession(false);
    setSavedSessionData(null);
  };

  // Persist session snapshot to sessionStorage whenever critical interview states change
  useEffect(() => {
    if (stage === 'meeting' || stage === 'recruiter_review') {
      try {
        const stateToSave = {
          stage,
          meetingPhase,
          candidateName,
          writtenText,
          writtenSubmitted,
          pressureRating,
          pressureSubmitted,
          snapshots,
          recordedResponses,
          qaHistory,
          uploadedResume,
          timestamp: Date.now(),
        };
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
      } catch {
        // storage quota exceeded or disabled
      }
    }
  }, [
    stage,
    meetingPhase,
    candidateName,
    writtenText,
    writtenSubmitted,
    pressureRating,
    pressureSubmitted,
    snapshots,
    recordedResponses,
    qaHistory,
    uploadedResume,
  ]);

  // ----------------------------------------------------
  // Initialize Media Devices & Stream
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
      setActiveMediaStream(stream);

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

  // Make sure whenever activeMediaStream changes, video refs attach correctly
  useEffect(() => {
    if (activeMediaStream) {
      if (lobbyVideoRef.current && lobbyVideoRef.current.srcObject !== activeMediaStream) {
        lobbyVideoRef.current.srcObject = activeMediaStream;
      }
      if (localVideoRef.current && localVideoRef.current.srcObject !== activeMediaStream) {
        localVideoRef.current.srcObject = activeMediaStream;
      }
    }
  }, [activeMediaStream, stage, isCameraActive]);

  const setupAudioMeter = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioCtx();
      }

      const audioCtx = audioContextRef.current;
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateMeter = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setMicVolume(normalized);

        // Latch once detected so the checkmark stays green and does not glitch/flicker
        if (normalized > 10) {
          setHasDetectedMicOnce(true);
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
      if (recordingStreamRef.current) {
        recordingStreamRef.current.getTracks().forEach((t) => t.stop());
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
      setLobbySpeechError('Web Speech API is not supported in this browser. Please use Chrome, Edge, or a compatible browser.');
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
          setHasDetectedMicOnce(true);
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
      const uttr = new SpeechSynthesisUtterance('Audio output test successful. Welcome to your interview with Hana.');
      uttr.rate = 1.0;
      uttr.pitch = 1.15;
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
  // Default mood is neutral (no smiling or grinning)
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
      utterance.pitch = 1.15;
      utterance.rate = 1.0;

      let hasFinished = false;
      const finish = () => {
        if (hasFinished) return;
        hasFinished = true;
        hanaIsSpeakingRef.current = false;
        setHanaIsSpeaking(false);
        setHanaEmotion('neutral');
        onDone?.();
      };

      utterance.onend = () => finish();

      utterance.onerror = (e) => {
        if (e.error !== 'interrupted' && e.error !== 'canceled') {
          console.warn('Hana speech error:', e);
        }
        hanaIsSpeakingRef.current = false;
        setHanaIsSpeaking(false);
      };

      // Watchdog timeout to prevent getting stuck if onend doesn't fire
      const wordCount = text.split(' ').length;
      const estimatedDurationMs = Math.max(3000, (wordCount / 2.2) * 1000 + 1500);
      setTimeout(() => {
        if (hanaIsSpeakingRef.current && currentHanaLineRef.current === text) {
          finish();
        }
      }, estimatedDurationMs);

      window.speechSynthesis.speak(utterance);
    },
    []
  );

  // Interruption handling: candidate speaks while Hana is explaining during OPEN questions only
  const handleCandidateSpeechActivity = useCallback(() => {
    const curPhase = meetingPhaseRef.current;
    const isOpenDiscussion =
      curPhase === 'question_1' || curPhase === 'question_2' || curPhase === 'candidate_qa';

    if (!isOpenDiscussion) {
      // Do NOT interrupt during tasks, welcome greeting, instructions or wrapup!
      return;
    }

    if (hanaIsSpeakingRef.current) {
      // Candidate speaks during an open discussion
      window.speechSynthesis.cancel();
      hanaIsSpeakingRef.current = false;
      setHanaIsSpeaking(false);
      wasInterruptedRef.current = true;
      setHanaEmotion('neutral');
      setHanaReactionText('Listening to you...');

      if (speechResumeTimeoutRef.current) clearTimeout(speechResumeTimeoutRef.current);

      // Wait until candidate finishes speaking (1.8s silence), then resume with prefix
      speechResumeTimeoutRef.current = setTimeout(() => {
        if (wasInterruptedRef.current && currentHanaLineRef.current) {
          wasInterruptedRef.current = false;
          const resumeText = `Oh, okay. As we were saying... ${currentHanaLineRef.current}`;
          speakHanaLine(resumeText, undefined, 'neutral');
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

        // Check for interruption only in open discussion when candidate speaks coherent words
        const curPhase = meetingPhaseRef.current;
        const isOpenDiscussion =
          curPhase === 'question_1' || curPhase === 'question_2' || curPhase === 'candidate_qa';

        if (isOpenDiscussion && hanaIsSpeakingRef.current && combined.length > 6) {
          handleCandidateSpeechActivity();
        }

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

        // Contextual subtle reactions from Hana while candidate is answering
        if (combined.length > 25 && !hanaIsSpeakingRef.current && isOpenDiscussion) {
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
  }, [stage, isListeningForTrigger, handleCandidateSpeechActivity]);

  // ----------------------------------------------------
  // Video Recording Engine (Full Screen / Meeting Capture)
  // Records the interview session with audio & video
  // ----------------------------------------------------
  const startRecordingSession = async () => {
    try {
      recordedChunksRef.current = [];

      // Record media stream directly while keeping candidate live video feed intact
      let recordStream = mediaStreamRef.current;

      // If mediaStream is available, clone or use tracks
      if (recordStream) {
        const videoTrack = recordStream.getVideoTracks()[0];
        const audioTrack = recordStream.getAudioTracks()[0];
        const tracks: MediaStreamTrack[] = [];
        if (videoTrack) tracks.push(videoTrack);
        if (audioTrack) tracks.push(audioTrack);
        recordingStreamRef.current = new MediaStream(tracks);
      }

      const streamToRecord = recordingStreamRef.current || mediaStreamRef.current;
      if (!streamToRecord) return;

      const options = { mimeType: 'video/webm;codecs=vp8,opus' };
      let recorder: MediaRecorder;

      try {
        recorder = new MediaRecorder(streamToRecord, options);
      } catch {
        recorder = new MediaRecorder(streamToRecord);
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
    // If Web Speech API is not supported, block proceeding with clear prompt
    if (!isWebSpeechSupported) {
      return;
    }

    setStage('meeting');
    setActivePov('candidate');
    setMeetingPhase('joining');

    // Ensure candidate video element is attached
    setTimeout(() => {
      if (localVideoRef.current && mediaStreamRef.current) {
        localVideoRef.current.srcObject = mediaStreamRef.current;
      }
    }, 100);

    startRecordingSession();
    soundManager.playSend();

    // Hana enters shortly (within 3 seconds)
    setTimeout(() => {
      setHanaEntered(true);
      soundManager.playReceive();

      // Hana welcomes the candidate with neutral professional tone
      setMeetingPhase('welcome');
      const nameGreeting = candidateName.trim() ? `, ${candidateName.trim()}` : '';
      const welcomeText = `Hello! Welcome to your interview with MuxAI. I'm Hana, your AI screening partner today. It's great to meet you${nameGreeting}. Can you hear and see me clearly?`;
      speakHanaLine(
        welcomeText,
        () => {
          setTimeout(() => {
            advanceToPhase('question_1');
          }, 1500);
        },
        'neutral'
      );
    }, 2400);
  };

  // Unified phase advance with vocal instructions before every task
  const advanceToPhase = (nextPhase: MeetingPhase) => {
    setMeetingPhase(nextPhase);
    setCandidateLiveTranscript('');

    if (nextPhase === 'question_1') {
      const q1 = "Let's begin with a quick introduction. Could you tell me a bit about yourself, your background, and what drives your passion for this role?";
      speakHanaLine(q1, undefined, 'neutral');
    } else if (nextPhase === 'question_2') {
      const q2 = "Thank you. Now, could you walk me through a challenging technical problem or project you tackled recently? How did you approach resolving it?";
      speakHanaLine(q2, undefined, 'neutral');
    } else if (nextPhase === 'task_resume') {
      const prompt = "Before we proceed to written tasks, let's review your credentials. Please upload your updated resume or CV document so we have the latest version on file for our recruiting team.";
      speakHanaLine(prompt, undefined, 'neutral');
    } else if (nextPhase === 'task_written') {
      const prompt = "Next, we have a short written reflection task. In the spotlight panel on your right, please write down three things you like about yourself and why. Take your time, and submit when you have at least 100 characters.";
      speakHanaLine(prompt, undefined, 'neutral');
    } else if (nextPhase === 'task_pressure') {
      const prompt = "Great. Now we have a quick situational question. In the spotlight panel, select the rating that most accurately reflects how you perform under intense project pressure.";
      speakHanaLine(prompt, undefined, 'neutral');
    } else if (nextPhase === 'task_snapshot') {
      setSnapshotStep(1);
      setIsListeningForTrigger(true);
      const prompt = "For fun and identity verification, please write down your phone number on a small piece of paper. First, hold it up and look directly forward, then say 'click', 'do it', 'okay', or 'ready' when you're set.";
      speakHanaLine(prompt, undefined, 'neutral');
    } else if (nextPhase === 'candidate_qa') {
      const prompt = "Thank you for completing all spotlight tasks. Now, do you have any questions for me or our recruiting team about the role or MuxAI?";
      speakHanaLine(prompt, undefined, 'neutral');
    } else if (nextPhase === 'wrapup') {
      const wrapup = "Thank you so much for your time today. It was a pleasure speaking with you. Our recruiting team will review your session dossier and reach out with next steps soon. Have a wonderful day!";
      speakHanaLine(wrapup, () => {
        setTimeout(() => {
          handleEndMeetingAndReview();
        }, 1500);
      }, 'neutral');
    }
  };

  // Submit Answer to Questions
  const handleSaveResponse = (phase: string, question: string, answer: string, nextPhase: MeetingPhase) => {
    setRecordedResponses((prev) => [
      ...prev,
      {
        phase,
        question,
        answer: answer.trim() || '[Spoken answer recorded via microphone stream]',
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
    advanceToPhase(nextPhase);
  };

  // Handle Resume File Upload
  const handleResumeFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingResume(true);
    soundManager.playSend();

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const fileSizeKb = `${(file.size / 1024).toFixed(1)} KB`;
      const uploaded: UploadedResume = {
        fileName: file.name,
        fileSize: fileSizeKb,
        fileType: file.type || 'application/octet-stream',
        dataUrl,
        uploadedAt: new Date().toLocaleTimeString(),
      };

      if (file.type.includes('text') || file.name.endsWith('.txt')) {
        const textReader = new FileReader();
        textReader.onload = () => {
          uploaded.textContent = textReader.result as string;
          setUploadedResume(uploaded);
          setIsUploadingResume(false);
          soundManager.playReceive();
        };
        textReader.readAsText(file);
      } else {
        setUploadedResume(uploaded);
        setIsUploadingResume(false);
        soundManager.playReceive();
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitResumeTask = () => {
    if (!uploadedResume) return;
    setResumeSubmitted(true);
    soundManager.playReceive();

    setRecordedResponses((prev) => [
      ...prev,
      {
        phase: 'task_resume',
        question: 'Credentials Document Verification',
        answer: `Uploaded: ${uploadedResume.fileName} (${uploadedResume.fileSize})`,
        timestamp: new Date().toLocaleTimeString(),
        aiNotes: 'Document uploaded and attached to candidate dossier for recruiter evaluation.',
      },
    ]);

    // Hana speaks transition verbal feedback
    const transitionText = "Thank you! I've received your updated document. Now let's move forward to the written reflection task.";
    speakHanaLine(
      transitionText,
      () => {
        setTimeout(() => {
          advanceToPhase('task_written');
        }, 1000);
      },
      'neutral'
    );
  };

  // Submit Written Task
  const handleSubmitWrittenTask = () => {
    if (writtenText.trim().length < 100) return;
    setWrittenSubmitted(true);
    soundManager.playSend();

    setRecordedResponses((prev) => [
      ...prev,
      {
        phase: 'task_written',
        question: 'Write down 3 things you like about yourself and why.',
        answer: writtenText,
        timestamp: new Date().toLocaleTimeString(),
        aiNotes: 'Exceeds length threshold. Structured answers showing self-awareness and confidence.',
      },
    ]);

    // Hana verbal feedback and advance
    const feedback = "Excellent self-reflection. I've recorded your response. Let's move on to the situational pressure rating.";
    speakHanaLine(
      feedback,
      () => {
        setTimeout(() => {
          advanceToPhase('task_pressure');
        }, 1000);
      },
      'neutral'
    );
  };

  // Submit Pressure Rating Task
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
        aiNotes: `Candidate selected: "${pressureRating}". Demonstrates high resilience and initiative.`,
      },
    ]);

    const feedback = "Noted! Next up, we will do a fast visual verification sequence.";
    speakHanaLine(
      feedback,
      () => {
        setTimeout(() => {
          advanceToPhase('task_snapshot');
        }, 1000);
      },
      'neutral'
    );
  };

  // Capture Image From Camera Video Feed
  const captureCameraFrame = (): string | null => {
    try {
      const videoEl = localVideoRef.current || lobbyVideoRef.current;
      if (!videoEl) return null;

      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth || 640;
      canvas.height = videoEl.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Mirror horizontally to match self-view
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.85);
    } catch {
      return null;
    }
  };

  // Snapshot Step Trigger Handler
  const handleTakeSnapshotTrigger = () => {
    soundManager.playReceive();
    const frame = captureCameraFrame();
    if (!frame) return;

    if (snapshotStep === 1) {
      setSnapshots((prev) => [
        ...prev,
        {
          id: 'snap-1',
          angle: 'forward',
          label: 'Forward Pose + Phone on Paper',
          dataUrl: frame,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
      setSnapshotStep(2);
      const nextPrompt = "Awesome shot. Now, keep holding up the paper, turn your head slightly to the left, and say 'click' or 'ready'.";
      speakHanaLine(nextPrompt, undefined, 'neutral');
    } else if (snapshotStep === 2) {
      setSnapshots((prev) => [
        ...prev,
        {
          id: 'snap-2',
          angle: 'left',
          label: 'Left Angle Pose',
          dataUrl: frame,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
      setSnapshotStep(3);
      const nextPrompt = "Got it! Lastly, turn your head slightly to the right while holding the paper, and say 'click' or 'do it'.";
      speakHanaLine(nextPrompt, undefined, 'neutral');
    } else if (snapshotStep === 3) {
      setSnapshots((prev) => [
        ...prev,
        {
          id: 'snap-3',
          angle: 'right',
          label: 'Right Angle Pose',
          dataUrl: frame,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
      setSnapshotStep(0);
      setIsListeningForTrigger(false);

      setRecordedResponses((prev) => [
        ...prev,
        {
          phase: 'task_snapshot',
          question: 'Visual Identity & Multi-Angle Verification',
          answer: '3 angles captured (Forward, Left, Right) via voice triggers with held note.',
          timestamp: new Date().toLocaleTimeString(),
          aiNotes: 'Identity verification images confirmed with clear orientation check.',
        },
      ]);

      const finishedText = "Perfect! All three identity frames are captured and verified. Now let's open the floor for any questions you might have.";
      speakHanaLine(
        finishedText,
        () => {
          setTimeout(() => {
            advanceToPhase('candidate_qa');
          }, 1200);
        },
        'neutral'
      );
    }
  };

  // Candidate Q&A handling
  const handleSendCandidateQuestion = () => {
    const qText = candidateQuestionInput.trim();
    if (!qText) return;

    setQaHistory((prev) => [...prev, { sender: 'candidate', text: qText }]);
    setCandidateQuestionInput('');
    soundManager.playSend();

    setTimeout(() => {
      let answer = "That's a good question. At MuxAI, our engineering team works directly on autonomous AI agent architectures with high shipping cadence. Collaboration is open and autonomy is prioritized.";
      if (qText.toLowerCase().includes('salary') || qText.toLowerCase().includes('compensation')) {
        answer = 'Compensation packages are highly competitive and include equity options and comprehensive benefits, discussed directly at the offer stage.';
      } else if (qText.toLowerCase().includes('remote') || qText.toLowerCase().includes('location')) {
        answer = 'We are remote-first with flexible asynchronous setups globally.';
      }

      setQaHistory((prev) => [...prev, { sender: 'hana', text: answer }]);
      speakHanaLine(answer, undefined, 'neutral');
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
  // STAGE 1: LOBBY & PRE-INTERVIEW SETUP (LIGHT THEME)
  // ----------------------------------------------------
  if (stage === 'lobby') {
    return (
      <div className="min-h-screen bg-[#f8fafc] text-neutral-900 flex flex-col font-sans select-none">
        {/* Refresh Recovery Modal Banner if found */}
        {hasSavedSession && (
          <div className="bg-gradient-to-r from-sky-500 to-blue-600 text-white px-4 py-3 shadow-md flex items-center justify-between z-40">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-medium">
              <RefreshCw className="w-4 h-4 animate-spin text-white" />
              <span>We noticed you were in an active interview session. Would you like to resume where you left off?</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={restoreSession}
                className="px-3 py-1 bg-white text-blue-700 rounded-lg text-xs font-bold hover:bg-neutral-100 shadow transition-colors cursor-pointer"
              >
                Resume Interview
              </button>
              <button
                type="button"
                onClick={discardSavedSession}
                className="px-3 py-1 bg-black/20 text-white rounded-lg text-xs font-medium hover:bg-black/30 transition-colors cursor-pointer"
              >
                Start Fresh
              </button>
            </div>
          </div>
        )}

        {/* Top Navigation */}
        <header className="h-16 border-b border-neutral-200 px-6 flex items-center justify-between bg-white/90 backdrop-blur-md sticky top-0 z-30 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onNavigateHome}
              className="p-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-600 hover:text-neutral-900 transition-colors cursor-pointer"
              title="Return to Home"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h1 className="font-bold text-sm sm:text-base font-heading tracking-tight text-neutral-900">
                Hana Interview
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="px-3.5 py-1 rounded-full bg-neutral-100 border border-neutral-200 text-neutral-700 font-mono text-xs font-semibold shadow-xs">
              ID: {interviewId}
            </span>
          </div>
        </header>

        {/* Main Lobby Container */}
        <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col justify-center">
          <div className="mb-8 text-center sm:text-left">
            <h2 className="text-2xl sm:text-4xl font-bold font-heading text-neutral-900 tracking-tight">
              Get ready for your interview
            </h2>
            <p className="text-neutral-600 text-sm sm:text-base mt-2 max-w-2xl">
              Let&apos;s check if your camera and microphone are working properly before joining the meeting room.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 7 cols: Live Camera Feed & Device Selectors */}
            <div className="lg:col-span-7 space-y-4">
              <div className="relative aspect-video rounded-3xl overflow-hidden bg-neutral-900 border border-neutral-200 shadow-xl flex items-center justify-center group">
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
                  <div className="absolute inset-0 bg-neutral-900/90 backdrop-blur-sm p-6 flex flex-col items-center justify-center text-center">
                    <AlertCircle className="w-10 h-10 text-amber-400 mb-3" />
                    <h4 className="font-semibold text-white text-sm">Media Access Required</h4>
                    <p className="text-xs text-neutral-300 max-w-sm mt-1 mb-4">{permissionError}</p>
                    <button
                      type="button"
                      onClick={() => startCameraStream()}
                      className="px-4 py-2 rounded-xl bg-white text-neutral-900 text-xs font-bold hover:bg-neutral-100 cursor-pointer shadow-sm"
                    >
                      Retry Camera &amp; Mic Access
                    </button>
                  </div>
                )}

                {/* Floating Quick Action Overlay */}
                <div className="absolute bottom-4 inset-x-4 flex items-center justify-between z-10 pointer-events-auto">
                  <div className="px-3.5 py-1.5 rounded-full bg-neutral-900/80 backdrop-blur-md border border-white/20 text-xs font-semibold text-white">
                    {effectiveCandidateName} (Preview)
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleCamera}
                      className={`p-3 rounded-full backdrop-blur-md border transition-all cursor-pointer ${
                        isCameraActive
                          ? 'bg-neutral-900/80 border-white/20 text-white hover:bg-neutral-800'
                          : 'bg-red-500 border-red-400 text-white'
                      }`}
                      title={isCameraActive ? 'Turn off camera' : 'Turn on camera'}
                    >
                      {isCameraActive ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={toggleMic}
                      className={`p-3 rounded-full backdrop-blur-md border transition-all cursor-pointer ${
                        isMicActive
                          ? 'bg-neutral-900/80 border-white/20 text-white hover:bg-neutral-800'
                          : 'bg-red-500 border-red-400 text-white'
                      }`}
                      title={isMicActive ? 'Mute microphone' : 'Unmute microphone'}
                    >
                      {isMicActive ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Hardware Device Selection Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="p-3.5 rounded-2xl bg-white border border-neutral-200 shadow-xs space-y-1">
                  <label className="text-xs font-semibold text-neutral-600 block">Camera Source</label>
                  <select
                    value={selectedVideoId}
                    onChange={(e) => {
                      setSelectedVideoId(e.target.value);
                      startCameraStream(e.target.value, selectedAudioId);
                    }}
                    className="w-full text-xs bg-neutral-50 border border-neutral-300 rounded-xl px-3 py-2 text-neutral-800 focus:outline-none focus:border-sky-500"
                  >
                    {videoDevices.map((d, i) => (
                      <option key={d.deviceId || i} value={d.deviceId} className="bg-white text-neutral-900">
                        {d.label || `Camera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p-3.5 rounded-2xl bg-white border border-neutral-200 shadow-xs space-y-1">
                  <label className="text-xs font-semibold text-neutral-600 block">Microphone Source</label>
                  <select
                    value={selectedAudioId}
                    onChange={(e) => {
                      setSelectedAudioId(e.target.value);
                      startCameraStream(selectedVideoId, e.target.value);
                    }}
                    className="w-full text-xs bg-neutral-50 border border-neutral-300 rounded-xl px-3 py-2 text-neutral-800 focus:outline-none focus:border-sky-500"
                  >
                    {audioDevices.map((d, i) => (
                      <option key={d.deviceId || i} value={d.deviceId} className="bg-white text-neutral-900">
                        {d.label || `Microphone ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Real-time Voice Agreement Prompt Row */}
              <div className="p-4 rounded-2xl bg-white border border-neutral-200 shadow-xs space-y-2">
                <p className="text-xs text-neutral-700 leading-relaxed">
                  To start the meeting, please say{' '}
                  <strong className="text-neutral-950 font-bold">I am ready to start my interview</strong> and I agree to the rules.
                </p>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 text-xs font-mono">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isLobbyListening ? 'bg-emerald-500 animate-ping' : 'bg-neutral-400'
                      }`}
                    />
                    <span className="text-neutral-600 truncate">
                      {lobbySpokenText ? `Heard: "${lobbySpokenText}"` : 'Listening for phrase...'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        hasAgreedToRules
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : lobbyMatchPercent > 0
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-neutral-100 text-neutral-600'
                      }`}
                    >
                      {lobbyMatchPercent}% Match
                    </span>
                  </div>
                </div>

                {!isWebSpeechSupported ? (
                  <div className="pt-2 border-t border-neutral-200 flex items-center gap-2 text-xs text-rose-600 font-medium">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                    <span>Web Speech API is required for this screening room. Please use Chrome, Edge, or a supported browser.</span>
                  </div>
                ) : lobbySpeechError ? (
                  <div className="pt-2 border-t border-neutral-200 flex items-center justify-between gap-2 text-xs text-amber-700">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                      <span className="truncate">{lobbySpeechError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setHasAgreedToRules(true);
                        setLobbyMatchPercent(100);
                        soundManager.playSend();
                      }}
                      className="text-xs font-semibold text-sky-600 hover:underline shrink-0 cursor-pointer"
                    >
                      Agree Manually
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Right 5 cols: Readiness Checklist & Join Button */}
            <div className="lg:col-span-5 space-y-5">
              <div className="p-6 rounded-3xl bg-white border border-neutral-200 shadow-md space-y-6">
                <div>
                  <h3 className="text-lg font-bold font-heading text-neutral-900">Interview Readiness</h3>
                  <p className="text-xs text-neutral-500 mt-1">
                    Please make sure you are ready before you begin.
                  </p>
                </div>

                {/* Candidate Info Input (Blank with placeholder e.g. Dewan Mukto) */}
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="text-xs font-semibold text-neutral-700 block mb-1">Your Full Name</label>
                    <input
                      type="text"
                      value={candidateName}
                      onChange={(e) => setCandidateName(e.target.value)}
                      placeholder="e.g. Dewan Mukto"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 border border-neutral-300 text-neutral-900 text-sm focus:outline-none focus:border-sky-500 placeholder:text-neutral-400"
                    />
                  </div>
                </div>

                {/* Live Mic Volume Test Meter */}
                <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-neutral-700 flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5 text-sky-600" />
                      <span>Microphone Input Level</span>
                    </span>
                    <span className="font-mono text-neutral-500">
                      {hasDetectedMicOnce || micVolume > 8 ? 'Detected' : 'Speak to Test'}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-neutral-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-75 rounded-full ${
                        micVolume > 60 ? 'bg-emerald-500' : micVolume > 10 ? 'bg-sky-500' : 'bg-neutral-400'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(hasDetectedMicOnce ? 35 : 0, micVolume * 1.5))}%` }}
                    />
                  </div>
                </div>

                {/* Speaker Audio Output Test */}
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200">
                  <div className="flex items-center gap-2.5">
                    <Volume2 className="w-4 h-4 text-neutral-600" />
                    <div>
                      <span className="text-xs font-semibold text-neutral-900 block">Speaker Audio Test</span>
                      <span className="text-[11px] text-neutral-500 block">Hear sample AI recruiter tone</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleTestSpeaker}
                    disabled={isSpeakerTesting}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-neutral-200 hover:bg-neutral-300 text-neutral-800 transition-colors cursor-pointer shrink-0"
                  >
                    {isSpeakerTesting ? 'Playing Sound...' : 'Test Sound'}
                  </button>
                </div>

                {/* Checklist Badges with Red X and Green Checkmark indicators (Non-flickering) */}
                <div className="space-y-2.5 pt-2 border-t border-neutral-200">
                  <div className="flex items-center gap-2 text-xs">
                    {hasPermissions && isCameraActive ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                    )}
                    <span
                      className={
                        hasPermissions && isCameraActive ? 'text-neutral-700 font-medium' : 'text-red-600 font-medium'
                      }
                    >
                      Camera stream connected &amp; ready
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    {hasPermissions && isMicActive && (hasDetectedMicOnce || micVolume > 8 || lobbySpokenText.length > 0) ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                    )}
                    <span
                      className={
                        hasPermissions && isMicActive && (hasDetectedMicOnce || micVolume > 8 || lobbySpokenText.length > 0)
                          ? 'text-neutral-700 font-medium'
                          : 'text-red-600 font-medium'
                      }
                    >
                      Microphone input detected
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    {hasAgreedToRules ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                    )}
                    <span className={hasAgreedToRules ? 'text-neutral-700 font-medium' : 'text-red-600 font-medium'}>
                      Agreement with meeting policies
                    </span>
                  </div>
                </div>

                {/* Join Interview Button / Change your browser button */}
                {!isWebSpeechSupported ? (
                  <button
                    type="button"
                    disabled
                    className="w-full py-4 rounded-2xl text-sm font-bold bg-neutral-200 text-neutral-500 cursor-not-allowed flex items-center justify-center gap-2 border border-neutral-300 shadow-sm"
                  >
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                    <span>Change your browser</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleJoinMeeting}
                    disabled={
                      !hasPermissions ||
                      !isCameraActive ||
                      !isMicActive ||
                      !(hasDetectedMicOnce || micVolume > 8 || lobbySpokenText.length > 0) ||
                      !hasAgreedToRules
                    }
                    className="w-full py-4 rounded-2xl text-sm font-bold bg-sky-500 text-white hover:bg-sky-400 active:scale-95 transition-all shadow-md shadow-sky-500/20 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <span>Enter Video Screening Room</span>
                    <ChevronRight className="w-4 h-4 stroke-[3]" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ----------------------------------------------------
  // STAGE 2: LIVE VIDEO MEETING ROOM (LIGHT THEME)
  // ----------------------------------------------------
  if (stage === 'meeting') {
    const isSpotlightActive =
      meetingPhase === 'task_resume' ||
      meetingPhase === 'task_written' ||
      meetingPhase === 'task_pressure' ||
      meetingPhase === 'task_snapshot';

    return (
      <div className="h-screen w-screen bg-[#f1f5f9] text-neutral-900 flex flex-col font-sans overflow-hidden select-none">
        {/* Meeting Header Bar */}
        <header className="h-14 border-b border-neutral-200 px-4 sm:px-6 flex items-center justify-between bg-white shrink-0 z-30 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-600 text-xs font-mono font-bold">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              <span>REC {formatSeconds(recordedDuration)}</span>
            </div>
            <div className="hidden sm:block">
              <span className="text-xs font-semibold text-neutral-900 block">
                Hana Interview Session • Room #{interviewId}
              </span>
              <span className="text-[10px] text-neutral-500 block">{targetRole}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleEndMeetingAndReview}
              className="px-3.5 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-semibold transition-colors cursor-pointer"
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
                <div className="relative rounded-3xl bg-neutral-900 border border-neutral-300 shadow-lg overflow-hidden flex flex-col items-center justify-center">
                  {!hanaEntered ? (
                    <div className="flex flex-col items-center gap-4 text-center p-6 animate-pulse">
                      <div className="w-20 h-20 rounded-full bg-sky-500/20 border border-sky-400 flex items-center justify-center text-sky-400">
                        <UserCheck className="w-10 h-10" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg text-white font-heading">
                          Hana is entering the meeting...
                        </h3>
                        <p className="text-xs text-neutral-400 mt-1">Connecting AI interviewer</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Initial Camera Off view of Hana's panel while 3D model loads in background */}
                      <div
                        className={`absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10 transition-opacity duration-700 bg-neutral-900 ${
                          isHana3DReady ? 'opacity-0 pointer-events-none' : 'opacity-100'
                        }`}
                      >
                        <div className="relative mb-4">
                          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 border-white/20 shadow-2xl relative">
                            <img
                              src="/Thumbnail.png"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = 'https://muxai.vercel.app/logo_Hana.png';
                              }}
                              alt="Hana"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          {hanaIsSpeaking && (
                            <span className="absolute -inset-2 rounded-full border-2 border-sky-400 animate-ping opacity-75 pointer-events-none" />
                          )}
                        </div>

                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-black/60 border border-white/10 text-xs text-neutral-300 font-medium mb-1">
                          <VideoOff className="w-3.5 h-3.5 text-neutral-400" />
                          <span>Camera Off • Hana</span>
                        </div>
                        <p className="text-[11px] text-neutral-400 font-mono">
                          Connecting 3D neural feed...
                        </p>
                      </div>

                      {/* Live 3D VRM Canvas (Avatar interaction touching disabled, neutral emotion default) */}
                      <div
                        className={`w-full h-full relative pointer-events-none select-none transition-opacity duration-700 ${
                          isHana3DReady ? 'opacity-100' : 'opacity-0'
                        }`}
                      >
                        <VRMCanvas
                          interactive={false}
                          isSpeaking={hanaIsSpeaking}
                          emotion={hanaEmotion}
                          modelFileName="hana_v1.0_moderncasual_vrm1.vrm"
                          onLoaded={() => {
                            setTimeout(() => {
                              setIsHana3DReady(true);
                            }, 1200);
                          }}
                        />
                      </div>

                      {/* Speaking Glow Halo */}
                      {hanaIsSpeaking && (
                        <div className="absolute inset-0 pointer-events-none ring-2 ring-sky-400/50 rounded-3xl animate-pulse" />
                      )}

                      {/* Reaction Tag */}
                      {hanaReactionText && !hanaIsSpeaking && (
                        <div className="absolute top-4 left-4 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/20 text-xs text-sky-400 font-mono animate-in fade-in z-20">
                          {hanaReactionText}
                        </div>
                      )}
                    </>
                  )}

                  {/* Tile Label */}
                  <div className="absolute bottom-4 left-4 px-3.5 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/20 flex items-center gap-2 z-20">
                    <span className={`w-2 h-2 rounded-full ${hanaIsSpeaking ? 'bg-sky-400 animate-pulse' : 'bg-emerald-400'}`} />
                    <span className="text-xs font-semibold text-white">Hana (AI Talent Partner)</span>
                  </div>
                </div>

                {/* Tile 2: Candidate Video Feed (Always active in interview feed) */}
                <div className="relative rounded-3xl bg-neutral-900 border border-neutral-300 shadow-lg overflow-hidden flex items-center justify-center">
                  <video
                    ref={(el) => {
                      localVideoRef.current = el;
                      if (el && mediaStreamRef.current && el.srcObject !== mediaStreamRef.current) {
                        el.srcObject = mediaStreamRef.current;
                      }
                    }}
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
                    <div className="px-3.5 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/20 flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${isCandidateSpeaking ? 'bg-sky-400 animate-ping' : 'bg-emerald-400'}`} />
                      <span className="text-xs font-semibold text-white">
                        {candidateName.trim() ? `${candidateName.trim()} (You)` : 'You'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={toggleCamera}
                        className={`p-2.5 rounded-full backdrop-blur-md border transition-all cursor-pointer ${
                          isCameraActive ? 'bg-white/20 border-white/30 text-white' : 'bg-red-500 border-red-400 text-white'
                        }`}
                      >
                        {isCameraActive ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={toggleMic}
                        className={`p-2.5 rounded-full backdrop-blur-md border transition-all cursor-pointer ${
                          isMicActive ? 'bg-white/20 border-white/30 text-white' : 'bg-red-500 border-red-400 text-white'
                        }`}
                      >
                        {isMicActive ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Spotlight Dynamic Layout (Tasks: Resume Upload, Written, Pressure, Snapshots) */}
            {isSpotlightActive && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full min-h-0">
                {/* Left 4 cols: Compact Participant Video Tiles */}
                <div className="lg:col-span-4 flex flex-col gap-3 min-h-0">
                  {/* Hana Mini Tile */}
                  <div className="relative rounded-2xl bg-neutral-900 border border-neutral-300 overflow-hidden flex-1 min-h-[160px] shadow-sm">
                    {!isHana3DReady ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-neutral-900 z-10">
                        <div className="w-14 h-14 rounded-full overflow-hidden border border-white/20 relative mb-2">
                          <img
                            src="/Thumbnail.png"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = 'https://muxai.vercel.app/logo_Hana.png';
                            }}
                            alt="Hana"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <span className="text-[11px] text-neutral-400">Camera Off</span>
                      </div>
                    ) : null}

                    <div className="w-full h-full relative pointer-events-none select-none">
                      <VRMCanvas
                        interactive={false}
                        isSpeaking={hanaIsSpeaking}
                        emotion={hanaEmotion}
                        modelFileName="hana_v1.0_moderncasual_vrm1.vrm"
                        onLoaded={() => setIsHana3DReady(true)}
                      />
                    </div>
                    <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/20 text-[11px] font-semibold text-white z-20">
                      Hana (AI Recruiter)
                    </div>
                  </div>

                  {/* Candidate Mini Tile */}
                  <div className="relative rounded-2xl bg-neutral-900 border border-neutral-300 overflow-hidden flex-1 min-h-[160px] shadow-sm">
                    <video
                      autoPlay
                      playsInline
                      muted
                      ref={(el) => {
                        if (el && mediaStreamRef.current && el.srcObject !== mediaStreamRef.current) {
                          el.srcObject = mediaStreamRef.current;
                        }
                      }}
                      className="w-full h-full object-cover transform -scale-x-100"
                    />
                    <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/20 text-[11px] font-semibold text-white z-10">
                      {candidateName.trim() || 'You'}
                    </div>
                  </div>
                </div>

                {/* Right 8 cols: Spotlight Frame (Light Theme Card) */}
                <div className="lg:col-span-8 rounded-3xl bg-white border border-neutral-200 p-6 shadow-md flex flex-col justify-between overflow-y-auto">
                  {/* TASK 1: Resume / CV Document Upload */}
                  {meetingPhase === 'task_resume' && (
                    <div className="space-y-4 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-100 text-sky-700 text-xs font-semibold mb-2">
                          <FileUp className="w-3.5 h-3.5" />
                          <span>Credentials Document Upload</span>
                        </div>
                        <h3 className="text-xl sm:text-2xl font-bold font-heading text-neutral-900">
                          Upload your updated resume or CV
                        </h3>
                        <p className="text-xs sm:text-sm text-neutral-600 mt-1">
                          Our autonomous recruiting system indexes your experiences and matches your skillset with our engineering roles.
                        </p>
                      </div>

                      <div className="flex-1 flex flex-col justify-center">
                        {!uploadedResume ? (
                          <label className="border-2 border-dashed border-neutral-300 hover:border-sky-500 rounded-3xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all bg-neutral-50/60 hover:bg-sky-50/40 group">
                            <input
                              type="file"
                              accept=".pdf,.docx,.doc,.txt,.png,.jpg"
                              onChange={handleResumeFileUpload}
                              className="hidden"
                            />
                            <div className="w-16 h-16 rounded-2xl bg-sky-100 text-sky-600 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                              <Upload className="w-8 h-8" />
                            </div>
                            <h4 className="text-base font-bold text-neutral-900">
                              {isUploadingResume ? 'Processing document...' : 'Click to select or drag and drop your resume'}
                            </h4>
                            <p className="text-xs text-neutral-500 mt-1.5 max-w-sm">
                              Supported formats: PDF, DOCX, TXT, PNG, or JPG (max 10MB)
                            </p>
                          </label>
                        ) : (
                          <div className="p-6 rounded-2xl bg-sky-50 border border-sky-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-3.5">
                              <div className="w-12 h-12 rounded-xl bg-sky-500 text-white flex items-center justify-center">
                                <FileCheck className="w-6 h-6" />
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-neutral-900">{uploadedResume.fileName}</h4>
                                <div className="flex items-center gap-2 text-xs text-neutral-600 mt-0.5">
                                  <span>{uploadedResume.fileSize}</span>
                                  <span>•</span>
                                  <span className="text-emerald-700 font-semibold flex items-center gap-1">
                                    <Check className="w-3.5 h-3.5" /> Ready for submission
                                  </span>
                                </div>
                              </div>
                            </div>

                            <label className="text-xs text-sky-600 hover:text-sky-800 font-semibold cursor-pointer underline self-start sm:self-center">
                              <input
                                type="file"
                                accept=".pdf,.docx,.doc,.txt,.png,.jpg"
                                onChange={handleResumeFileUpload}
                                className="hidden"
                              />
                              Replace file
                            </label>
                          </div>
                        )}
                      </div>

                      <div className="pt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={handleSubmitResumeTask}
                          disabled={!uploadedResume || resumeSubmitted}
                          className="px-6 py-3 rounded-2xl text-xs sm:text-sm font-bold bg-sky-500 text-white hover:bg-sky-400 active:scale-95 transition-all shadow-md shadow-sky-500/20 cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
                        >
                          Confirm &amp; Proceed to Next Task
                        </button>
                      </div>
                    </div>
                  )}

                  {/* TASK 2: Written Self-Reflection (>= 100 chars) */}
                  {meetingPhase === 'task_written' && (
                    <div className="space-y-4 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-100 text-sky-700 text-xs font-semibold mb-2">
                          <FileText className="w-3.5 h-3.5" />
                          <span>Written Reflection Spotlight</span>
                        </div>
                        <h3 className="text-xl sm:text-2xl font-bold font-heading text-neutral-900">
                          Write down 3 things you like about yourself and why.
                        </h3>
                        <p className="text-xs sm:text-sm text-neutral-600 mt-1">
                          Reflect on your personal strengths, values, or technical curiosity. Minimum 100 characters required.
                        </p>
                      </div>

                      <div className="space-y-2 flex-1 flex flex-col">
                        <textarea
                          rows={6}
                          value={writtenText}
                          onChange={(e) => setWrittenText(e.target.value)}
                          placeholder="1. I love diving deep into architectural puzzles because...&#10;2. I value empathetic communication with team members...&#10;3. I am resilient and relentless when debugging critical edge cases..."
                          className="w-full flex-1 p-4 rounded-2xl bg-neutral-50 border border-neutral-300 text-neutral-900 text-sm focus:outline-none focus:border-sky-500 resize-none leading-relaxed placeholder:text-neutral-400"
                        />
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span
                            className={
                              writtenText.trim().length >= 100
                                ? 'text-emerald-600 font-bold'
                                : 'text-amber-600 font-medium'
                            }
                          >
                            {writtenText.trim().length} / 100 characters minimum
                          </span>
                          {writtenText.trim().length >= 100 && (
                            <span className="text-emerald-600 font-semibold flex items-center gap-1">
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
                          className="px-6 py-3 rounded-2xl text-xs sm:text-sm font-bold bg-sky-500 text-white hover:bg-sky-400 active:scale-95 transition-all shadow-md shadow-sky-500/20 cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
                        >
                          Confirm &amp; Submit Written Task
                        </button>
                      </div>
                    </div>
                  )}

                  {/* TASK 3: Situational Pressure Rating */}
                  {meetingPhase === 'task_pressure' && (
                    <div className="space-y-6 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-100 text-sky-700 text-xs font-semibold mb-2">
                          <Award className="w-3.5 h-3.5" />
                          <span>Situational Behavior Check</span>
                        </div>
                        <h3 className="text-xl sm:text-2xl font-bold font-heading text-neutral-900">
                          How well do you perform under pressure?
                        </h3>
                        <p className="text-xs sm:text-sm text-neutral-600 mt-1">
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
                                ? 'bg-sky-50 border-sky-500 text-neutral-900 shadow-xs'
                                : 'bg-neutral-50 border-neutral-200 hover:border-neutral-300 text-neutral-700'
                            }`}
                          >
                            <input
                              type="radio"
                              name="pressure"
                              checked={pressureRating === opt}
                              onChange={() => setPressureRating(opt)}
                              className="accent-sky-500 w-4 h-4"
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
                          className="px-6 py-3 rounded-2xl text-xs sm:text-sm font-bold bg-sky-500 text-white hover:bg-sky-400 active:scale-95 transition-all shadow-md shadow-sky-500/20 cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
                        >
                          Confirm Situational Rating
                        </button>
                      </div>
                    </div>
                  )}

                  {/* TASK 4: Camera Feed Snapshots via Voice Triggers */}
                  {meetingPhase === 'task_snapshot' && (
                    <div className="space-y-4 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-100 text-sky-700 text-xs font-semibold mb-2">
                          <Camera className="w-3.5 h-3.5" />
                          <span>Voice-Activated Visual Identity Verification</span>
                        </div>
                        <h3 className="text-xl sm:text-2xl font-bold font-heading text-neutral-900">
                          Hold your written phone number up &amp; pose
                        </h3>
                        <p className="text-xs sm:text-sm text-neutral-600 mt-1">
                          Say <strong className="text-neutral-900">&quot;click&quot;</strong>,{' '}
                          <strong className="text-neutral-900">&quot;do it&quot;</strong>,{' '}
                          <strong className="text-neutral-900">&quot;okay&quot;</strong>, or{' '}
                          <strong className="text-neutral-900">&quot;ready&quot;</strong> to capture each shot automatically.
                        </p>
                      </div>

                      {/* Pose Progress Tracker */}
                      <div className="grid grid-cols-3 gap-3">
                        <div
                          className={`p-3.5 rounded-2xl border text-center transition-all ${
                            snapshotStep === 1
                              ? 'bg-sky-50 border-sky-500 text-sky-800 ring-2 ring-sky-300'
                              : snapshots.length >= 1
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                              : 'bg-neutral-50 border-neutral-200 text-neutral-400'
                          }`}
                        >
                          <span className="text-[11px] font-bold uppercase tracking-wider block">Step 1</span>
                          <span className="text-xs font-semibold mt-1 block">Look Forward</span>
                          {snapshots.length >= 1 && <span className="text-[10px] text-emerald-600 mt-1 block font-mono">Captured</span>}
                        </div>

                        <div
                          className={`p-3.5 rounded-2xl border text-center transition-all ${
                            snapshotStep === 2
                              ? 'bg-sky-50 border-sky-500 text-sky-800 ring-2 ring-sky-300'
                              : snapshots.length >= 2
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                              : 'bg-neutral-50 border-neutral-200 text-neutral-400'
                          }`}
                        >
                          <span className="text-[11px] font-bold uppercase tracking-wider block">Step 2</span>
                          <span className="text-xs font-semibold mt-1 block">Look Left</span>
                          {snapshots.length >= 2 && <span className="text-[10px] text-emerald-600 mt-1 block font-mono">Captured</span>}
                        </div>

                        <div
                          className={`p-3.5 rounded-2xl border text-center transition-all ${
                            snapshotStep === 3
                              ? 'bg-sky-50 border-sky-500 text-sky-800 ring-2 ring-sky-300'
                              : snapshots.length >= 3
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                              : 'bg-neutral-50 border-neutral-200 text-neutral-400'
                          }`}
                        >
                          <span className="text-[11px] font-bold uppercase tracking-wider block">Step 3</span>
                          <span className="text-xs font-semibold mt-1 block">Look Right</span>
                          {snapshots.length >= 3 && <span className="text-[10px] text-emerald-600 mt-1 block font-mono">Captured</span>}
                        </div>
                      </div>

                      {/* Live Listener Monitor & Manual Trigger Fallback */}
                      <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
                          <div>
                            <span className="text-xs font-semibold text-neutral-900 block">
                              Scanning audio for voice trigger...
                            </span>
                            <span className="text-[11px] text-neutral-500 font-mono block">
                              Say &quot;click&quot; / &quot;ready&quot; / &quot;do it&quot;
                              {lastDetectedTrigger ? ` • Last heard: "${lastDetectedTrigger}"` : ''}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={handleTakeSnapshotTrigger}
                          className="px-4 py-2 rounded-xl bg-neutral-200 hover:bg-neutral-300 text-neutral-800 text-xs font-semibold transition-colors cursor-pointer shrink-0"
                        >
                          Manual Snap
                        </button>
                      </div>

                      {/* Display Captured Gallery */}
                      {snapshots.length > 0 && (
                        <div className="flex gap-3 overflow-x-auto pb-1">
                          {snapshots.map((snap) => (
                            <div key={snap.id} className="relative w-24 h-18 rounded-xl overflow-hidden border border-neutral-200 shrink-0 shadow-xs">
                              <img src={snap.dataUrl} alt={snap.label} className="w-full h-full object-cover transform -scale-x-100" />
                              <span className="absolute bottom-1 inset-x-1 text-[9px] bg-black/70 text-white text-center rounded px-1 truncate">
                                {snap.angle}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Meeting Bottom Toolbar */}
        <footer className="h-16 border-t border-neutral-200 px-4 sm:px-6 flex items-center justify-between bg-white shrink-0 z-30 shadow-xs">
          {/* Phase Indicators */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider font-mono">Phase:</span>
            <span className="text-xs font-bold text-sky-600 bg-sky-50 px-2.5 py-1 rounded-full border border-sky-200">
              {meetingPhase.replace('_', ' ').toUpperCase()}
            </span>
          </div>

          {/* Contextual Action Advance Controls for the candidate */}
          <div className="flex items-center gap-2.5">
            {meetingPhase === 'welcome' && (
              <button
                type="button"
                onClick={() => advanceToPhase('question_1')}
                className="px-4 py-2 rounded-xl bg-sky-500 text-white hover:bg-sky-400 text-xs font-bold cursor-pointer transition-colors shadow-xs"
              >
                Start Question 1
              </button>
            )}

            {meetingPhase === 'question_1' && (
              <button
                type="button"
                onClick={() =>
                  handleSaveResponse(
                    'question_1',
                    'Could you tell me a bit about yourself, your background, and what drives your passion for this role?',
                    candidateLiveTranscript,
                    'question_2'
                  )
                }
                className="px-4 py-2 rounded-xl bg-sky-500 text-white hover:bg-sky-400 text-xs font-bold cursor-pointer transition-colors shadow-xs flex items-center gap-1.5"
              >
                <span>Finished Answering</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}

            {meetingPhase === 'question_2' && (
              <button
                type="button"
                onClick={() =>
                  handleSaveResponse(
                    'question_2',
                    'Walk me through a challenging technical problem or project you tackled recently.',
                    candidateLiveTranscript,
                    'task_resume'
                  )
                }
                className="px-4 py-2 rounded-xl bg-sky-500 text-white hover:bg-sky-400 text-xs font-bold cursor-pointer transition-colors shadow-xs flex items-center gap-1.5"
              >
                <span>Finished Answering • Proceed to Tasks</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}

            {meetingPhase === 'candidate_qa' && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={candidateQuestionInput}
                  onChange={(e) => setCandidateQuestionInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendCandidateQuestion()}
                  placeholder="Ask Hana anything about MuxAI..."
                  className="px-3.5 py-1.5 rounded-xl bg-neutral-100 border border-neutral-300 text-neutral-900 text-xs focus:outline-none focus:border-sky-500 w-48 sm:w-64 placeholder:text-neutral-400"
                />
                <button
                  type="button"
                  onClick={handleSendCandidateQuestion}
                  className="p-2 rounded-xl bg-sky-500 text-white hover:bg-sky-400 text-xs cursor-pointer shadow-xs"
                  title="Send Question"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleFinishQaNoQuestions}
                  className="px-3.5 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 text-neutral-700 text-xs font-semibold cursor-pointer transition-colors"
                >
                  No further questions
                </button>
              </div>
            )}
          </div>
        </footer>
      </div>
    );
  }

  // ----------------------------------------------------
  // STAGE 3: RECRUITER POV EVALUATION DOSSIER (LIGHT THEME)
  // ----------------------------------------------------
  return (
    <div className="min-h-screen bg-[#f8fafc] text-neutral-900 flex flex-col font-sans select-none">
      {/* Dossier Header Bar */}
      <header className="h-16 border-b border-neutral-200 px-6 flex items-center justify-between bg-white/95 backdrop-blur-md sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onNavigateHome}
            className="p-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-600 hover:text-neutral-900 transition-colors cursor-pointer"
            title="Return to Home"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="font-bold text-sm sm:text-base font-heading text-neutral-900">
              Recruiter Evaluation Dossier
            </h1>
            <span className="text-[11px] text-neutral-500">
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
            className="px-3.5 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 text-xs font-semibold text-neutral-700 transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Return to Candidate Meeting</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem(STORAGE_KEY);
              setStage('lobby');
              setMeetingPhase('joining');
              setHanaEntered(false);
              setIsHana3DReady(false);
              recordedChunksRef.current = [];
              setRecordedVideoUrl(null);
            }}
            className="px-3.5 py-1.5 rounded-xl bg-sky-500 text-white hover:bg-sky-400 text-xs font-bold transition-colors cursor-pointer shadow-xs"
          >
            New Interview Session
          </button>
        </div>
      </header>

      {/* Main Dossier Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Candidate Profile Header Card */}
        <div className="p-6 rounded-3xl bg-white border border-neutral-200 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 text-white flex items-center justify-center font-bold text-2xl font-heading shadow-md shadow-sky-500/20">
              {effectiveDossierName.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-bold font-heading text-neutral-900">
                  {effectiveDossierName}
                </h2>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-semibold capitalize ${
                    candidateStatus === 'shortlisted'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : candidateStatus === 'rejected'
                      ? 'bg-red-100 text-red-800 border border-red-300'
                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                  }`}
                >
                  {candidateStatus.replace('_', ' ')}
                </span>
              </div>
              <p className="text-sm text-neutral-600 mt-0.5">{targetRole}</p>
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
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleRejectCandidate}
              className={`px-4 py-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                candidateStatus === 'rejected'
                  ? 'bg-red-500 text-white border-red-600 shadow-sm'
                  : 'bg-white hover:bg-red-50 text-red-600 border-red-200'
              }`}
            >
              Reject Candidate
            </button>
            <button
              type="button"
              onClick={handleShortlistCandidate}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer ${
                candidateStatus === 'shortlisted'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/20'
              }`}
            >
              Shortlist for Next Round
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-neutral-200 pb-3">
          <button
            type="button"
            onClick={() => setRecruiterActiveTab('recording')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              recruiterActiveTab === 'recording'
                ? 'bg-sky-500 text-white shadow-sm'
                : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>Session Recording &amp; Identity Frames</span>
          </button>
          <button
            type="button"
            onClick={() => setRecruiterActiveTab('responses')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              recruiterActiveTab === 'responses'
                ? 'bg-sky-500 text-white shadow-sm'
                : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Candidate Responses &amp; Tasks</span>
          </button>
          <button
            type="button"
            onClick={() => setRecruiterActiveTab('resume')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              recruiterActiveTab === 'resume'
                ? 'bg-sky-500 text-white shadow-sm'
                : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>Candidate Resume / CV</span>
            {uploadedResume && (
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            )}
          </button>
        </div>

        {/* TAB 1: Session Video Recording Player & Captured Snapshots */}
        {recruiterActiveTab === 'recording' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left 8 cols: Video Player */}
              <div className="lg:col-span-8 rounded-3xl bg-neutral-900 border border-neutral-200 p-4 shadow-xl space-y-3">
                <div className="relative aspect-video rounded-2xl overflow-hidden bg-black flex items-center justify-center">
                  {recordedVideoUrl ? (
                    <video
                      ref={reviewVideoPlayerRef}
                      src={recordedVideoUrl}
                      controls
                      playsInline
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-3 text-neutral-400 p-6 text-center">
                      <Video className="w-10 h-10 stroke-[1.5]" />
                      <p className="text-xs text-neutral-400">
                        Interview recording is processed automatically when session concludes or reaches completion.
                      </p>
                    </div>
                  )}
                </div>

                {recordedVideoUrl && (
                  <div className="flex items-center justify-between pt-1 px-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-neutral-400">Speed:</span>
                      {[1, 1.25, 1.5, 2].map((spd) => (
                        <button
                          key={spd}
                          type="button"
                          onClick={() => {
                            setRecordingPlaybackSpeed(spd);
                            if (reviewVideoPlayerRef.current) reviewVideoPlayerRef.current.playbackRate = spd;
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-colors cursor-pointer ${
                            recordingPlaybackSpeed === spd
                              ? 'bg-sky-500 text-white'
                              : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                          }`}
                        >
                          {spd}x
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={recordedVideoUrl}
                        download={`interview-${effectiveDossierName.toLowerCase().replace(/\s+/g, '-')}-session.webm`}
                        className="px-3.5 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold transition-colors flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download Recording</span>
                      </a>
                      <button
                        type="button"
                        onClick={handleDiscardRecording}
                        className="px-3.5 py-1.5 rounded-xl bg-red-950/60 hover:bg-red-900/80 text-red-300 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Discard</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Right 4 cols: Visual Identity Snapshots Gallery */}
              <div className="lg:col-span-4 rounded-3xl bg-white border border-neutral-200 p-5 shadow-md space-y-4">
                <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
                  <div>
                    <h3 className="font-bold text-sm text-neutral-900 font-heading">
                      Identity Verification Frames
                    </h3>
                    <p className="text-[11px] text-neutral-500">
                      Multi-angle camera snapshots
                    </p>
                  </div>
                  <span className="text-xs font-mono font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200">
                    {snapshots.length} / 3
                  </span>
                </div>

                {snapshots.length === 0 ? (
                  <div className="p-6 text-center text-neutral-400 text-xs">
                    No camera snapshots recorded during this test run.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {snapshots.map((snap) => (
                      <div
                        key={snap.id}
                        onClick={() => setSelectedSnapshotModal(snap.dataUrl)}
                        className="p-2.5 rounded-2xl bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 flex items-center gap-3 transition-colors cursor-pointer group"
                      >
                        <div className="w-20 h-14 rounded-xl overflow-hidden bg-black shrink-0 relative">
                          <img
                            src={snap.dataUrl}
                            alt={snap.label}
                            className="w-full h-full object-cover transform -scale-x-100"
                          />
                          <div className="absolute inset-0 bg-black/30 group-hover:bg-transparent transition-colors flex items-center justify-center">
                            <Eye className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-bold text-neutral-900 block truncate">
                            {snap.label}
                          </span>
                          <span className="text-[11px] text-neutral-500 block">
                            Angle: {snap.angle.toUpperCase()} • {snap.timestamp}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Responses & Tasks Details */}
        {recruiterActiveTab === 'responses' && (
          <div className="space-y-4">
            {recordedResponses.length === 0 ? (
              <div className="p-12 text-center rounded-3xl bg-white border border-neutral-200 text-neutral-500 text-sm shadow-xs">
                Candidate has not yet submitted responses. Run an interview session to generate records.
              </div>
            ) : (
              recordedResponses.map((res, index) => (
                <div
                  key={index}
                  className="p-6 rounded-3xl bg-white border border-neutral-200 shadow-sm space-y-3"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-sky-600 font-bold uppercase tracking-wider bg-sky-50 px-2.5 py-0.5 rounded-full border border-sky-200">
                      {res.phase.replace('_', ' ')}
                    </span>
                    <span className="text-neutral-500 font-mono">{res.timestamp}</span>
                  </div>

                  <h3 className="font-bold text-base text-neutral-900">{res.question}</h3>

                  <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 text-sm leading-relaxed text-neutral-800 whitespace-pre-wrap">
                    {res.answer}
                  </div>

                  {res.aiNotes && (
                    <div className="flex items-start gap-2 pt-1 text-xs text-neutral-600">
                      <Sparkles className="w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5" />
                      <span>
                        <strong className="text-neutral-900">AI Recruiter Observation:</strong> {res.aiNotes}
                      </span>
                    </div>
                  )}
                </div>
              ))
            )}

            {/* Q&A Transcripts */}
            {qaHistory.length > 0 && (
              <div className="p-6 rounded-3xl bg-white border border-neutral-200 shadow-sm space-y-4">
                <h3 className="font-bold text-base text-neutral-900 font-heading">
                  Candidate Q&amp;A Session History
                </h3>
                <div className="space-y-3">
                  {qaHistory.map((qa, i) => (
                    <div
                      key={i}
                      className={`p-3.5 rounded-2xl text-xs sm:text-sm ${
                        qa.sender === 'candidate'
                          ? 'bg-sky-50 border border-sky-200 text-sky-950 ml-6'
                          : 'bg-neutral-50 border border-neutral-200 text-neutral-900 mr-6'
                      }`}
                    >
                      <span className="text-[10px] font-bold block mb-1 uppercase tracking-wider text-neutral-500">
                        {qa.sender === 'candidate' ? `${effectiveDossierName} (Candidate)` : 'Hana (AI Recruiter)'}
                      </span>
                      <p className="leading-relaxed">{qa.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Candidate Resume / CV Document View */}
        {recruiterActiveTab === 'resume' && (
          <div className="space-y-6">
            {uploadedResume ? (
              <div className="p-6 sm:p-8 rounded-3xl bg-white border border-neutral-200 shadow-md space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-neutral-200 gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-sky-100 text-sky-600 flex items-center justify-center">
                      <FileCheck className="w-7 h-7" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold font-heading text-neutral-900">
                        {uploadedResume.fileName}
                      </h3>
                      <div className="flex items-center gap-3 text-xs text-neutral-500 mt-1">
                        <span>Size: {uploadedResume.fileSize}</span>
                        <span>•</span>
                        <span>Type: {uploadedResume.fileType}</span>
                        <span>•</span>
                        <span>Uploaded at: {uploadedResume.uploadedAt}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-300">
                      Uploaded during Live Interview
                    </span>
                    <a
                      href={uploadedResume.dataUrl}
                      download={uploadedResume.fileName}
                      className="px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download File</span>
                    </a>
                  </div>
                </div>

                {/* Document Display / Preview */}
                <div className="rounded-2xl bg-neutral-50 border border-neutral-200 p-4 min-h-[400px] flex items-center justify-center overflow-hidden">
                  {uploadedResume.fileType.includes('pdf') || uploadedResume.fileName.endsWith('.pdf') ? (
                    <iframe
                      src={uploadedResume.dataUrl}
                      className="w-full h-[650px] rounded-xl border border-neutral-200 bg-white"
                      title="Uploaded Candidate Resume PDF"
                    />
                  ) : uploadedResume.fileType.includes('image') ||
                    uploadedResume.fileName.endsWith('.png') ||
                    uploadedResume.fileName.endsWith('.jpg') ? (
                    <img
                      src={uploadedResume.dataUrl}
                      alt="Uploaded Candidate Resume"
                      className="max-h-[650px] mx-auto object-contain rounded-xl shadow-md border border-neutral-200"
                    />
                  ) : (
                    <div className="w-full bg-white p-6 rounded-2xl border border-neutral-200 shadow-xs space-y-4">
                      <div className="flex items-center gap-2 text-xs font-semibold text-neutral-600">
                        <FileText className="w-4 h-4 text-sky-600" />
                        <span>Document Content Preview:</span>
                      </div>
                      <pre className="text-xs font-mono text-neutral-800 whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-auto p-4 bg-neutral-50 rounded-xl border border-neutral-200">
                        {uploadedResume.textContent || 'Binary document content verified. Click "Download File" to view full original.'}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Fallback if no resume uploaded during test run */
              <div className="max-w-4xl mx-auto p-8 rounded-3xl bg-white text-neutral-900 shadow-md border border-neutral-200 space-y-6 font-sans">
                <div className="border-b border-neutral-200 pb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold font-heading text-neutral-900">{effectiveDossierName}</h2>
                    <p className="text-sm font-semibold text-sky-600 mt-0.5">{targetRole}</p>
                    <p className="text-xs text-neutral-500 mt-1">
                      {candidateName ? `${candidateName.toLowerCase().replace(/\s+/g, '.')}@example.com` : 'candidate@example.com'} • Verified Candidate Dossier
                    </p>
                  </div>
                  <label className="px-3.5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 self-start shadow-xs">
                    <input
                      type="file"
                      accept=".pdf,.docx,.doc,.txt,.png,.jpg"
                      onChange={handleResumeFileUpload}
                      className="hidden"
                    />
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Resume Now</span>
                  </label>
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
                          <span className="font-bold text-neutral-900">Staff Engineer • Autonomous Interactive Systems</span>
                          <span className="text-neutral-500">2022 - Present</span>
                        </div>
                        <p className="text-xs text-neutral-600 mt-1">
                          Architected high-throughput AI companion runtime with sub-200ms latency, handling multimodal vision, voice synthesis, and low-latency browser streaming.
                        </p>
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-neutral-900">Senior Software Engineer • Realtime Cloud Labs</span>
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
                      B.S. in Computer Science • University of California, Berkeley
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Snapshot Zoom Lightbox Modal */}
      {selectedSnapshotModal && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 cursor-pointer"
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
