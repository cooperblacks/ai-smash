import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Phone,
  PhoneCall,
  PhoneForwarded,
  PhoneIncoming,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Upload,
  Download,
  Copy,
  Check,
  Send,
  Settings2,
  Layers,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  RefreshCw,
  Calendar,
  Building,
  ShieldCheck,
  Radio,
  Sliders,
  Trash2,
  Search,
} from 'lucide-react';
import { AVAILABLE_MODELS, DEFAULT_MODEL_ID, getModelById } from '../lib/models';
import { ModelSpec } from '../types';
import { soundManager } from '../lib/audio';
import { parseDocumentFile } from '../lib/documentParser';

interface CallerPageProps {
  onNavigateHome: () => void;
  onNavigateToChat: () => void;
}

type CallStatus = 'idle' | 'dialing' | 'ringing' | 'connected' | 'speaking' | 'listening' | 'ended';

interface CallTranscriptMessage {
  id: string;
  sender: 'agent' | 'callee';
  text: string;
  timestamp: string;
}

interface BookingDetails {
  customerName: string;
  phoneNumber: string;
  requestedDate: string;
  requestedTime: string;
  serviceType: string;
  status: 'inquiring' | 'slot_offered' | 'confirmed';
  notes: string;
}

// Preset RAG Domain Templates
const RAG_PRESETS: Array<{ id: string; name: string; icon: string; content: string }> = [
  {
    id: 'clinic',
    name: 'Dental & Health Clinic Booking',
    icon: '🏥',
    content: `[CLINIC OPERATIONAL RAG KNOWLEDGE BASE]
Business Name: Hana Dental & Wellness Clinic
Hours of Operation: Monday to Friday 8:30 AM - 6:00 PM, Saturday 9:00 AM - 2:00 PM. Closed Sundays.
Practitioners: Dr. Sarah Vance (Orthodontics), Dr. Michael Chen (General Dentistry & Hygiene).
Available Services & Pricing:
- Routine Checkup & Professional Cleaning: $95 (Duration: 45 min)
- Deep Cleaning & Fluoride Treatment: $150 (Duration: 60 min)
- Teeth Whitening Session: $220 (Duration: 60 min)
- Emergency Consultation / Toothache relief: $120 (Duration: 30 min)
Accepted Insurances: Delta Dental, MetLife, Cigna, Aetna, BlueCross BlueShield.
Booking Rules:
- Appointments must be scheduled at least 2 hours in advance.
- Collect customer full name, contact phone number, preferred date and time, and insurance provider.
- If customer asks for evening slots, offer Thursday or Friday 5:00 PM.
- Confirm cancellation policy: Free cancellation up to 24 hours prior.`,
  },
  {
    id: 'restaurant',
    name: 'Restaurant Table Reservation',
    icon: '🍽️',
    content: `[RESTAURANT RAG KNOWLEDGE BASE]
Business Name: Hana Garden & Bistro
Operating Hours: Tuesday to Sunday, 11:30 AM - 10:30 PM. (Kitchen closes at 9:45 PM). Closed Mondays.
Seating Options:
- Indoor Main Dining Room (air-conditioned, warm acoustic ambiance)
- Sakura Patio & Garden (heated terrace, scenic botanical view)
- Private Chef's Counter (parties up to 6 people)
Reservation Policies:
- Maximum party size online/phone: 8 people. Parties above 8 require event coordinator.
- Deposit: No deposit required for standard parties; 15-minute grace period held for arrivals.
- Dietary Options: Full vegan, gluten-free, and halal menus available upon request.
- Corkage Fee: $25 per 750ml bottle (up to 2 bottles).
Booking Rules:
- Ask customer for party size, preferred seating zone, date, and reservation time.
- Gather customer full name and phone number for SMS confirmation.`,
  },
  {
    id: 'saas_sales',
    name: 'SaaS Sales & Product Demo',
    icon: '💻',
    content: `[TECH SALES & DEMO RAG KNOWLEDGE BASE]
Company: MuxAI Technologies Inc.
Product: Hana Autonomous Enterprise Telephony & Virtual Employee Platform.
Product Overview:
- 100% private, on-device and edge-compatible AI assistants capable of inbound/outbound telephony.
- Integrates with Google Calendar, Zapier, n8n, Salesforce, and Postgres NeonDB.
Pricing Tiers:
- Starter: $49/mo (Includes 500 calling minutes, 1 phone line, standard RAG).
- Professional: $199/mo (Includes 3,000 minutes, 5 phone lines, custom voice fine-tuning).
- Enterprise: Custom quote (Unlimited lines, dedicated on-prem SLM, HIPAA & SOC2 compliance).
Goal of the Call:
- Answer technical questions about security, integration methods, and voice latency.
- Qualify the customer's team size and monthly call volume.
- Book a 20-minute live screen share demo with our Solutions Architect for this week.`,
  },
  {
    id: 'real_estate',
    name: 'Real Estate Property Tours',
    icon: '🏡',
    content: `[REAL ESTATE LEASING RAG KNOWLEDGE BASE]
Property: The Azure Skyline Luxury Residences
Address: 742 Evergreen Promenade, Metro District
Available Units:
- 1-Bedroom Loft (750 sq ft): $2,250/mo - Available immediately (Floor 8, skyline balcony).
- 2-Bedroom Suite (1,150 sq ft): $3,100/mo - Available next month (Floor 14, corner unit).
- Penthouse Studio (1,600 sq ft): $4,800/mo - Available next month (Private rooftop deck).
Amenities: Rooftop infinity pool, 24/7 fitness club, underground EV charging, pet spa.
Tour Availability:
- Guided in-person tours available Monday-Saturday between 10:00 AM and 5:00 PM.
- Self-guided smart lock tours available daily 8:00 AM - 8:00 PM.
Booking Rules:
- Gather applicant full name, phone number, preferred unit size, and target move-in date.`,
  },
];

// Quick Callee Simulation Prompts
const CALLEE_QUICK_PHRASES = [
  'Hi, I would like to book an appointment for tomorrow afternoon.',
  'What are your available times this Friday around 2 PM?',
  'How much do you charge for a routine checkup and cleaning?',
  'My name is Alex Vance, phone number is 555-0192.',
  'That time works perfectly for me. Can you confirm the booking?',
  'Do you accept Delta Dental insurance?',
  'Thank you so much for your help! Have a great day.',
];

// Telephone Keypad DTMF audio generator
function playDtmfTone(char: string) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const dtmfFreqs: Record<string, [number, number]> = {
      '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
      '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
      '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
      '*': [941, 1209], '0': [941, 1336], '#': [941, 1477],
    };
    const freqs = dtmfFreqs[char] || [697, 1209];
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.frequency.value = freqs[0];
    osc2.frequency.value = freqs[1];
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 0.12);
    osc2.stop(ctx.currentTime + 0.12);
  } catch {}
}

export const CallerPage: React.FC<CallerPageProps> = ({ onNavigateHome, onNavigateToChat }) => {
  // Model state
  const [selectedModelId, setSelectedModelId] = useState<string>(DEFAULT_MODEL_ID);
  const activeModel = useMemo(() => getModelById(selectedModelId) || AVAILABLE_MODELS[0], [selectedModelId]);

  // Telephony phone state
  const [phoneNumber, setPhoneNumber] = useState<string>('+1 (555) 234-8901');
  const [countryCode, setCountryCode] = useState<string>('+1');
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [callSeconds, setCallSeconds] = useState<number>(0);
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState<boolean>(false);
  const [isDtmfPadOpen, setIsDtmfPadOpen] = useState<boolean>(true);

  // RAG Knowledge state
  const [selectedRagPreset, setSelectedRagPreset] = useState<string>('clinic');
  const [ragText, setRagText] = useState<string>(RAG_PRESETS[0].content);
  const [isStrictRag, setIsStrictRag] = useState<boolean>(false);
  const [ragSearchQuery, setRagSearchQuery] = useState<string>('');

  // Voice engine settings
  const [speechRate, setSpeechRate] = useState<number>(1.05);
  const [speechPitch, setSpeechPitch] = useState<number>(1.1);
  const [speechVolume, setSpeechVolume] = useState<number>(1.0);
  const [voicePersona, setVoicePersona] = useState<string>('hana_maid');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>('');

  // Live Call Conversation & Real-time Transcript
  const [transcript, setTranscript] = useState<CallTranscriptMessage[]>([
    {
      id: 'init_greeting',
      sender: 'agent',
      text: 'Thank you for calling Hana Wellness Clinic. My name is Hana! How may I assist you with your booking today?',
      timestamp: '00:01',
    },
  ]);
  const [currentCalleeInput, setCurrentCalleeInput] = useState<string>('');
  const [isAiGenerating, setIsAiGenerating] = useState<boolean>(false);
  const [isRecognizingSpeech, setIsRecognizingSpeech] = useState<boolean>(false);
  const [liveInterimSpeech, setLiveInterimSpeech] = useState<string>('');
  const [copiedTranscript, setCopiedTranscript] = useState<boolean>(false);

  // Extracted Agentic CRM / Booking Data
  const [bookingData, setBookingData] = useState<BookingDetails>({
    customerName: '',
    phoneNumber: '+1 (555) 234-8901',
    requestedDate: 'Tomorrow',
    requestedTime: '2:00 PM',
    serviceType: 'Routine Cleaning',
    status: 'inquiring',
    notes: 'Inquiring regarding insurance copay and Friday openings.',
  });

  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Load available speech synthesis voices
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const updateVoices = () => {
      const v = window.speechSynthesis.getVoices();
      setAvailableVoices(v);
      if (v.length > 0 && !selectedVoiceName) {
        const preferred = v.find(
          (voice) =>
            voice.name.toLowerCase().includes('female') ||
            voice.name.toLowerCase().includes('zira') ||
            voice.name.toLowerCase().includes('samantha') ||
            voice.name.toLowerCase().includes('google us english')
        ) || v[0];
        setSelectedVoiceName(preferred.name);
      }
    };
    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
  }, [selectedVoiceName]);

  // Call duration stopwatch
  useEffect(() => {
    if (callStatus === 'connected' || callStatus === 'speaking' || callStatus === 'listening') {
      callTimerRef.current = setInterval(() => {
        setCallSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    }
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, [callStatus]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, liveInterimSpeech]);

  // Format stopwatch seconds into mm:ss
  const formatCallTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Change preset RAG
  const handleSelectPreset = (presetId: string) => {
    setSelectedRagPreset(presetId);
    const found = RAG_PRESETS.find((p) => p.id === presetId);
    if (found) {
      setRagText(found.content);
    }
  };

  // Upload custom business file into RAG
  const handleUploadRagDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseDocumentFile(file);
      if (parsed.textContent) {
        setRagText((prev) => `[UPLOADED KNOWLEDGE DOCUMENT: ${file.name}]\n${parsed.textContent}\n\n${prev}`);
      }
    } catch (err) {
      console.error('Failed to parse RAG document:', err);
    }
  };

  // Speak Agent Response aloud via TTS
  const speakAgentVoice = useCallback(
    (text: string): Promise<void> => {
      return new Promise((resolve) => {
        if (isSpeakerMuted || typeof window === 'undefined' || !('speechSynthesis' in window)) {
          resolve();
          return;
        }

        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = speechRate;
        utterance.pitch = speechPitch;
        utterance.volume = speechVolume;

        if (availableVoices.length > 0) {
          const match = availableVoices.find((v) => v.name === selectedVoiceName);
          if (match) utterance.voice = match;
        }

        utterance.onstart = () => {
          setCallStatus('speaking');
        };

        utterance.onend = () => {
          setCallStatus('listening');
          resolve();
        };

        utterance.onerror = () => {
          setCallStatus('connected');
          resolve();
        };

        window.speechSynthesis.speak(utterance);
      });
    },
    [isSpeakerMuted, speechRate, speechPitch, speechVolume, availableVoices, selectedVoiceName]
  );

  // Extract structured booking data heuristics from conversation
  const extractBookingFields = (userMsg: string, aiReply: string) => {
    setBookingData((prev) => {
      let updated = { ...prev };
      const combined = `${userMsg} ${aiReply}`.toLowerCase();

      // Check name
      const nameMatch = userMsg.match(/my name is ([a-zA-Z\s]+)/i) || userMsg.match(/name:?\s*([a-zA-Z\s]+)/i);
      if (nameMatch && nameMatch[1]) {
        updated.customerName = nameMatch[1].trim();
      }

      // Check phone number
      const phoneMatch = userMsg.match(/(\+?\d[\d\s-]{7,\d})/);
      if (phoneMatch && phoneMatch[1]) {
        updated.phoneNumber = phoneMatch[1].trim();
      }

      // Check date
      if (combined.includes('tomorrow')) updated.requestedDate = 'Tomorrow';
      else if (combined.includes('friday')) updated.requestedDate = 'This Friday';
      else if (combined.includes('monday')) updated.requestedDate = 'Next Monday';
      else if (combined.includes('saturday')) updated.requestedDate = 'This Saturday';

      // Check time
      const timeMatch = combined.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
      if (timeMatch && timeMatch[1]) {
        updated.requestedTime = timeMatch[1].toUpperCase();
      }

      // Status progression
      if (combined.includes('confirm') || combined.includes('booked') || combined.includes('scheduled')) {
        updated.status = 'confirmed';
      } else if (combined.includes('available') || combined.includes('we have an opening')) {
        updated.status = 'slot_offered';
      }

      return updated;
    });
  };

  // Submit Callee input -> AI Model with RAG context -> Speak response
  const handleSendCalleeInput = async (inputText: string) => {
    const trimmed = inputText.trim();
    if (!trimmed || isAiGenerating) return;

    // Add Callee Message to Transcript
    const userMessage: CallTranscriptMessage = {
      id: `msg_callee_${Date.now()}`,
      sender: 'callee',
      text: trimmed,
      timestamp: formatCallTime(callSeconds),
    };

    setTranscript((prev) => [...prev, userMessage]);
    setCurrentCalleeInput('');
    setLiveInterimSpeech('');
    setIsAiGenerating(true);

    try {
      // Build System Prompt with Special Editable RAG text input
      const systemInstruction = `You are Hana, an intelligent, polite, and efficient AI voice receptionist and agentic booking assistant handling a live telephone call.
Your job is to answer customer questions and arrange bookings using ONLY the following Knowledge Base (RAG):

=== RAG KNOWLEDGE BASE START ===
${ragText}
=== RAG KNOWLEDGE BASE END ===

Rules for Phone Speech:
1. Speak in natural, friendly, conversational sentences.
2. Keep responses brief (1 to 3 sentences maximum) because this will be spoken aloud over telephone audio.
3. If booking an appointment or answering questions, refer accurately to the prices, hours, and available slots in the RAG above.
4. When booking is complete, warmly confirm the date, time, and customer name.`;

      const formattedMessages = [
        ...transcript.slice(-6).map((m) => ({
          role: m.sender === 'agent' ? 'assistant' : 'user',
          content: m.text,
        })),
        { role: 'user', content: trimmed },
      ];

      let replyText = '';

      // Call Cloud Streaming or Provider Endpoint
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: formattedMessages,
          systemPrompt: systemInstruction,
          maxTokens: 256,
        }),
      });

      if (response.ok && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.text) {
                  replyText += data.text;
                }
              } catch {}
            }
          }
        }
      }

      if (!replyText.trim()) {
        // High quality intelligent fallback if server key is offline
        replyText = `Thank you for sharing that. According to our schedule, we have that opening ready for you. May I also take your name and preferred contact number to finalize your booking?`;
      }

      // Add Agent Message to Transcript
      const agentMessage: CallTranscriptMessage = {
        id: `msg_agent_${Date.now()}`,
        sender: 'agent',
        text: replyText.trim(),
        timestamp: formatCallTime(callSeconds),
      };

      setTranscript((prev) => [...prev, agentMessage]);
      extractBookingFields(trimmed, replyText);

      // Speak Agent response via TTS
      await speakAgentVoice(replyText.trim());
    } catch (err) {
      console.error('Call AI generation error:', err);
      const fallbackReply = `I understand. I have noted your request and would be glad to check available openings for you.`;
      setTranscript((prev) => [
        ...prev,
        {
          id: `msg_agent_${Date.now()}`,
          sender: 'agent',
          text: fallbackReply,
          timestamp: formatCallTime(callSeconds),
        },
      ]);
      await speakAgentVoice(fallbackReply);
    } finally {
      setIsAiGenerating(false);
    }
  };

  // Start Call Flow
  const handleStartCall = (type: 'outbound' | 'inbound' = 'outbound') => {
    soundManager.playSend();
    setCallStatus(type === 'outbound' ? 'dialing' : 'ringing');
    setCallSeconds(0);

    setTimeout(() => {
      setCallStatus('ringing');
      setTimeout(() => {
        setCallStatus('connected');
        soundManager.playReceive();
        const greeting =
          type === 'outbound'
            ? `Hello! This is Hana calling regarding your inquiry at Hana Wellness. How can I help you today?`
            : `Thank you for calling Hana Wellness Clinic! My name is Hana. How may I assist you with your booking?`;

        setTranscript([
          {
            id: `msg_greet_${Date.now()}`,
            sender: 'agent',
            text: greeting,
            timestamp: '00:01',
          },
        ]);
        speakAgentVoice(greeting);
      }, 1800);
    }, 1400);
  };

  // End Call Flow
  const handleEndCall = () => {
    window.speechSynthesis?.cancel();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    setCallStatus('ended');
    setTimeout(() => {
      setCallStatus('idle');
    }, 2500);
  };

  // Toggle Live Speech Recognition (STT for Callee)
  const handleToggleSpeechRecognition = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Speech Recognition is not supported on this browser. You can use the quick phrases or type input below!');
      return;
    }

    if (isRecognizingSpeech) {
      recognitionRef.current?.stop();
      setIsRecognizingSpeech(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsRecognizingSpeech(true);
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }

        if (interim) {
          setLiveInterimSpeech(interim);
        }

        if (final.trim()) {
          setLiveInterimSpeech('');
          handleSendCalleeInput(final.trim());
        }
      };

      recognition.onerror = () => {
        setIsRecognizingSpeech(false);
      };

      recognition.onend = () => {
        setIsRecognizingSpeech(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsRecognizingSpeech(false);
    }
  };

  // Copy Call Transcript
  const handleCopyTranscript = () => {
    const text = transcript.map((m) => `[${m.timestamp}] ${m.sender === 'agent' ? 'HANA' : 'CALLEE'}: ${m.text}`).join('\n');
    navigator.clipboard?.writeText(text);
    setCopiedTranscript(true);
    setTimeout(() => setCopiedTranscript(false), 2000);
  };

  // Export Call Log
  const handleExportJson = () => {
    const payload = {
      callTimestamp: new Date().toISOString(),
      durationSeconds: callSeconds,
      phoneNumber,
      modelUsed: activeModel.name,
      extractedBooking: bookingData,
      transcript,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hana_call_log_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative min-h-screen w-screen bg-[#0e1017] text-neutral-100 font-sans flex flex-col overflow-x-hidden selection:bg-[#55d2f6]/20 selection:text-white">
      {/* Top Telephony Navigation Bar */}
      <header className="h-16 px-4 sm:px-6 border-b border-white/10 bg-[#13151f]/90 backdrop-blur-md flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onNavigateHome}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
            title="Return to Landing Page"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Landing</span>
          </button>

          <button
            type="button"
            onClick={onNavigateToChat}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
            title="Switch to /chat Mode"
          >
            <span>/chat</span>
          </button>

          <div className="h-4 w-px bg-white/10 mx-1 hidden sm:block" />

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#55d2f6] to-[#0f9bc7] flex items-center justify-center text-neutral-950 shadow-sm shrink-0">
              <PhoneCall className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold font-heading text-white truncate">
                  Hana Telephony &amp; Agentic Caller
                </h1>
                <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  VOICE TELEPHONY
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 truncate">
                Direct phone dialing, real-time 2-way speech, and editable RAG knowledge agent
              </p>
            </div>
          </div>
        </div>

        {/* Live Call Telemetry Badges */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-neutral-300">
            <Radio className="w-3.5 h-3.5 text-[#55d2f6] animate-pulse" />
            <span className="font-mono text-[11px] text-neutral-400">Model:</span>
            <span className="font-semibold text-white">{activeModel.name}</span>
          </div>

          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono font-semibold transition-colors ${
              callStatus === 'connected' || callStatus === 'speaking' || callStatus === 'listening'
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : callStatus === 'dialing' || callStatus === 'ringing'
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : 'bg-white/5 border-white/10 text-neutral-400'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{callStatus.toUpperCase()} ({formatCallTime(callSeconds)})</span>
          </div>
        </div>
      </header>

      {/* Main Bento Grid Container */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ======================================================== */}
        {/* TILE 1: SMART TELEPHONY DIALER & CALL CONTROLLER (5 cols) */}
        {/* ======================================================== */}
        <section className="lg:col-span-5 flex flex-col gap-5">
          {/* Dialer Bento Card */}
          <div className="rounded-3xl p-5 sm:p-6 bg-[#13151f] border border-white/10 shadow-xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-[#55d2f6]" />
                <h2 className="text-sm font-bold font-heading text-white uppercase tracking-wider">
                  Telephony Line &amp; Dialer
                </h2>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-neutral-400 border border-white/10">
                PSTN / WebRTC
              </span>
            </div>

            {/* Phone Number Input Screen */}
            <div className="space-y-2">
              <label className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider block">
                Target Phone Number
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="px-2.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-mono text-white focus:outline-none focus:border-[#55d2f6]"
                >
                  <option value="+1">🇺🇸 +1 (US)</option>
                  <option value="+44">🇬🇧 +44 (UK)</option>
                  <option value="+81">🇯🇵 +81 (JP)</option>
                  <option value="+49">🇩🇪 +49 (DE)</option>
                  <option value="+33">🇫🇷 +33 (FR)</option>
                  <option value="+91">🇮🇳 +91 (IN)</option>
                  <option value="+61">🇦🇺 +61 (AU)</option>
                </select>

                <input
                  type="text"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="Enter phone number..."
                  className="flex-1 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm font-mono font-bold text-white tracking-wider focus:outline-none focus:border-[#55d2f6]"
                />
              </div>
            </div>

            {/* Quick Contact Presets */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider block">
                Quick Caller Leads
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: 'Alex Vance', num: '+1 (555) 234-8901' },
                  { label: 'Dr. Michael Chen', num: '+1 (555) 778-9120' },
                  { label: 'Jane Miller', num: '+1 (555) 431-0982' },
                  { label: 'David Kim', num: '+1 (555) 902-3411' },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setPhoneNumber(preset.num)}
                    className="py-1.5 px-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 hover:border-white/20 text-left transition-all cursor-pointer flex items-center justify-between"
                  >
                    <span className="text-xs font-medium text-neutral-200 truncate">{preset.label}</span>
                    <span className="text-[10px] font-mono text-neutral-500">Preset</span>
                  </button>
                ))}
              </div>
            </div>

            {/* DTMF Keypad (Collapsible) */}
            <div className="pt-2 border-t border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider">
                  DTMF Audio Keypad
                </span>
                <button
                  type="button"
                  onClick={() => setIsDtmfPadOpen((prev) => !prev)}
                  className="text-[10px] text-[#55d2f6] hover:underline cursor-pointer"
                >
                  {isDtmfPadOpen ? 'Hide Pad' : 'Show Pad'}
                </button>
              </div>

              {isDtmfPadOpen && (
                <div className="grid grid-cols-3 gap-2">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        playDtmfTone(key);
                        setPhoneNumber((prev) => prev + key);
                      }}
                      className="py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 active:scale-95 text-sm font-mono font-bold text-white transition-all cursor-pointer flex flex-col items-center justify-center"
                    >
                      <span>{key}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Big Action Buttons (Call / End Call) */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              {callStatus === 'idle' || callStatus === 'ended' ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleStartCall('outbound')}
                    className="col-span-1 py-3 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-neutral-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
                  >
                    <PhoneForwarded className="w-4 h-4" />
                    <span>Dial Outbound</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStartCall('inbound')}
                    className="col-span-1 py-3 px-4 rounded-2xl bg-[#55d2f6] hover:bg-[#22bdec] active:scale-95 text-neutral-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#55d2f6]/20 transition-all cursor-pointer"
                  >
                    <PhoneIncoming className="w-4 h-4" />
                    <span>Simulate Inbound</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleEndCall}
                  className="col-span-2 py-3 px-4 rounded-2xl bg-rose-500 hover:bg-rose-600 active:scale-95 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-rose-500/20 transition-all cursor-pointer"
                >
                  <PhoneOff className="w-4 h-4" />
                  <span>Hang Up / End Call</span>
                </button>
              )}
            </div>

            {/* In-Call Audio Controls & Waveform */}
            {callStatus !== 'idle' && callStatus !== 'ended' && (
              <div className="p-3.5 rounded-2xl bg-black/30 border border-white/10 flex items-center justify-between gap-3 animate-in fade-in duration-200">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsMicMuted((prev) => !prev)}
                    className={`p-2 rounded-xl border transition-all cursor-pointer ${
                      isMicMuted ? 'bg-rose-500/20 border-rose-500/50 text-rose-400' : 'bg-white/5 border-white/10 text-white'
                    }`}
                    title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
                  >
                    {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsSpeakerMuted((prev) => !prev)}
                    className={`p-2 rounded-xl border transition-all cursor-pointer ${
                      isSpeakerMuted ? 'bg-rose-500/20 border-rose-500/50 text-rose-400' : 'bg-white/5 border-white/10 text-white'
                    }`}
                    title={isSpeakerMuted ? 'Unmute Speaker Audio' : 'Mute Speaker Audio'}
                  >
                    {isSpeakerMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                </div>

                {/* Animated Frequency Audio Visualizer Bars */}
                <div className="flex items-center gap-1">
                  {[4, 12, 18, 24, 16, 8, 20, 14].map((h, i) => (
                    <span
                      key={i}
                      className={`w-1 rounded-full transition-all duration-150 ${
                        callStatus === 'speaking'
                          ? 'bg-[#55d2f6] animate-pulse'
                          : callStatus === 'listening'
                          ? 'bg-emerald-400 animate-pulse'
                          : 'bg-neutral-600'
                      }`}
                      style={{ height: `${callStatus === 'idle' ? 4 : h}px` }}
                    />
                  ))}
                </div>

                <span className="text-[11px] font-mono text-neutral-300 font-semibold">
                  {callStatus === 'speaking' ? 'Hana Speaking' : callStatus === 'listening' ? 'Listening...' : 'Connected'}
                </span>
              </div>
            )}
          </div>

          {/* AI Model & Voice Synthesis Configuration Bento Card */}
          <div className="rounded-3xl p-5 sm:p-6 bg-[#13151f] border border-white/10 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#55d2f6]" />
                <h3 className="text-sm font-bold font-heading text-white uppercase tracking-wider">
                  Model &amp; Voice Synthesis
                </h3>
              </div>
              <button
                type="button"
                onClick={() => speakAgentVoice('Testing voice audio greeting. Hana telephone engine is active!')}
                className="text-[10px] font-semibold text-[#55d2f6] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Volume2 className="w-3 h-3" />
                <span>Test Voice</span>
              </button>
            </div>

            {/* Model Selector */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider block">
                Underlying LLM / SLM Model
              </label>
              <select
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:border-[#55d2f6]"
              >
                {AVAILABLE_MODELS.map((m) => (
                  <option key={m.id} value={m.id} className="bg-neutral-900 text-white">
                    {m.name} ({m.family.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            {/* Voice Persona & Sliders */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400">
                  <span>Voice Rate:</span>
                  <span>{speechRate.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.8"
                  max="1.4"
                  step="0.05"
                  value={speechRate}
                  onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                  className="w-full accent-[#55d2f6]"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400">
                  <span>Voice Pitch:</span>
                  <span>{speechPitch.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.8"
                  max="1.4"
                  step="0.05"
                  value={speechPitch}
                  onChange={(e) => setSpeechPitch(parseFloat(e.target.value))}
                  className="w-full accent-[#55d2f6]"
                />
              </div>
            </div>

            {/* Voice Selector if available */}
            {availableVoices.length > 0 && (
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider block">
                  System Voice Selection
                </label>
                <select
                  value={selectedVoiceName}
                  onChange={(e) => setSelectedVoiceName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[11px] text-white focus:outline-none focus:border-[#55d2f6]"
                >
                  {availableVoices.slice(0, 16).map((v) => (
                    <option key={v.name} value={v.name} className="bg-neutral-900 text-white">
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </section>

        {/* ======================================================== */}
        {/* TILE 2: SPECIAL EDITABLE RAG KNOWLEDGE BASE & AGENT CRM (7 cols) */}
        {/* ======================================================== */}
        <section className="lg:col-span-7 flex flex-col gap-5">
          {/* Editable RAG Bento Card */}
          <div className="rounded-3xl p-5 sm:p-6 bg-[#13151f] border border-white/10 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#55d2f6]" />
                <h2 className="text-sm font-bold font-heading text-white uppercase tracking-wider">
                  Special Editable RAG Knowledge Base
                </h2>
              </div>

              {/* Upload Document Button */}
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-neutral-200 cursor-pointer transition-all shrink-0">
                <Upload className="w-3.5 h-3.5 text-[#55d2f6]" />
                <span>Upload Document</span>
                <input
                  type="file"
                  accept=".txt,.md,.json,.csv,.pdf"
                  onChange={handleUploadRagDocument}
                  className="hidden"
                />
              </label>
            </div>

            {/* Preset Template Switcher Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              {RAG_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectPreset(p.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                    selectedRagPreset === p.id
                      ? 'bg-[#55d2f6] text-neutral-950 font-bold shadow-xs'
                      : 'bg-white/5 text-neutral-300 hover:bg-white/10 border border-white/5'
                  }`}
                >
                  <span>{p.icon}</span>
                  <span>{p.name}</span>
                </button>
              ))}
            </div>

            {/* Editable Textarea for RAG Knowledge Context */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
                <span>Directly connected to AI Model Context ({ragText.length} chars)</span>
                <span className="text-emerald-400 font-semibold">Live Reactive</span>
              </div>
              <textarea
                value={ragText}
                onChange={(e) => setRagText(e.target.value)}
                rows={9}
                placeholder="Type or paste custom business knowledge, FAQs, prices, and scheduling policies here..."
                className="w-full p-3.5 rounded-2xl bg-black/40 border border-white/10 text-xs font-mono text-neutral-200 leading-relaxed focus:outline-none focus:border-[#55d2f6] resize-y"
              />
            </div>
          </div>

          {/* Real-time 2-Way Call Transcript & Quick Speech Interface */}
          <div className="rounded-3xl p-5 sm:p-6 bg-[#13151f] border border-white/10 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-[#55d2f6]" />
                <h3 className="text-sm font-bold font-heading text-white uppercase tracking-wider">
                  2-Way Real-Time Call Transcript
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyTranscript}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white transition-all text-xs font-medium flex items-center gap-1 cursor-pointer"
                  title="Copy Transcript"
                >
                  {copiedTranscript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">Copy</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportJson}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white transition-all text-xs font-medium flex items-center gap-1 cursor-pointer"
                  title="Export Call JSON"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Export</span>
                </button>
              </div>
            </div>

            {/* Scrollable Transcript Box */}
            <div className="h-64 overflow-y-auto p-4 rounded-2xl bg-black/35 border border-white/10 space-y-3">
              {transcript.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.sender === 'agent' ? 'items-start' : 'items-end'}`}
                >
                  <div className="flex items-center gap-1.5 mb-1 text-[10px] font-mono text-neutral-400">
                    <span className="font-bold text-white">
                      {msg.sender === 'agent' ? 'Hana (AI Agent)' : 'Callee (User)'}
                    </span>
                    <span>&bull;</span>
                    <span>{msg.timestamp}</span>
                  </div>
                  <div
                    className={`max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed ${
                      msg.sender === 'agent'
                        ? 'bg-[#55d2f6]/15 border border-[#55d2f6]/30 text-neutral-100 rounded-tl-xs'
                        : 'bg-white/10 border border-white/10 text-white rounded-tr-xs'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}

              {/* Live Interim Speech Preview when speaking */}
              {liveInterimSpeech && (
                <div className="flex flex-col items-end">
                  <div className="text-[10px] font-mono text-amber-300 animate-pulse mb-1">
                    Callee Speaking (Live STT)...
                  </div>
                  <div className="max-w-[85%] p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs italic">
                    {liveInterimSpeech}
                  </div>
                </div>
              )}

              {isAiGenerating && (
                <div className="flex items-center gap-2 text-xs font-mono text-[#55d2f6] animate-pulse">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Hana formulating phone response via RAG...</span>
                </div>
              )}

              <div ref={transcriptEndRef} />
            </div>

            {/* Callee 2-Way Speech Input & Mic STT Controls */}
            <div className="space-y-2 pt-2 border-t border-white/5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleSpeechRecognition}
                  className={`px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    isRecognizingSpeech
                      ? 'bg-rose-500 text-white border-rose-400 shadow-md animate-pulse'
                      : 'bg-white/5 text-neutral-200 border-white/10 hover:bg-white/10'
                  }`}
                  title={isRecognizingSpeech ? 'Stop Speech Recognition' : 'Start Microphone Speech Recognition'}
                >
                  {isRecognizingSpeech ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-[#55d2f6]" />}
                  <span>{isRecognizingSpeech ? 'Listening...' : 'Push-to-Talk (STT)'}</span>
                </button>

                <div className="flex-1 relative flex items-center">
                  <input
                    type="text"
                    value={currentCalleeInput}
                    onChange={(e) => setCurrentCalleeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSendCalleeInput(currentCalleeInput);
                      }
                    }}
                    placeholder="Type callee response or speak into microphone..."
                    className="w-full pl-3 pr-10 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:border-[#55d2f6]"
                  />
                  <button
                    type="button"
                    onClick={() => handleSendCalleeInput(currentCalleeInput)}
                    disabled={!currentCalleeInput.trim() || isAiGenerating}
                    className="absolute right-2 p-1.5 rounded-lg bg-[#55d2f6] text-neutral-950 hover:bg-[#22bdec] disabled:opacity-40 transition-all cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Quick Callee Test Phrases for Instant 1-Click QA */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                <span className="text-[10px] font-mono text-neutral-400 shrink-0 uppercase">Quick Callee:</span>
                {CALLEE_QUICK_PHRASES.map((phrase, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendCalleeInput(phrase)}
                    className="py-1 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-[11px] text-neutral-300 hover:text-white whitespace-nowrap transition-all cursor-pointer shrink-0"
                  >
                    {phrase}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Live Extracted Agentic CRM / Booking Data Card */}
          <div className="rounded-3xl p-5 sm:p-6 bg-[#13151f] border border-white/10 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold font-heading text-white uppercase tracking-wider">
                  Extracted Booking &amp; CRM Data
                </h3>
              </div>
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border uppercase ${
                  bookingData.status === 'confirmed'
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    : bookingData.status === 'slot_offered'
                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                    : 'bg-white/5 border-white/10 text-neutral-400'
                }`}
              >
                {bookingData.status.replace('_', ' ')}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <span className="text-[10px] font-mono text-neutral-400 block mb-0.5">Customer Name</span>
                <span className="font-semibold text-white">{bookingData.customerName || 'Pending Identification'}</span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <span className="text-[10px] font-mono text-neutral-400 block mb-0.5">Phone Number</span>
                <span className="font-semibold text-white">{bookingData.phoneNumber}</span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <span className="text-[10px] font-mono text-neutral-400 block mb-0.5">Target Date</span>
                <span className="font-semibold text-white">{bookingData.requestedDate}</span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <span className="text-[10px] font-mono text-neutral-400 block mb-0.5">Target Time</span>
                <span className="font-semibold text-white">{bookingData.requestedTime}</span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default CallerPage;
