# AI Smash - 3D Interactive Companion Platform

> A private, responsive conversational platform combining in-browser Small Language Models (SLMs), cloud AI endpoints, and an interactive 3D humanoid avatar with full-body physics.

![](https://muxai.vercel.app/aismash_banner.png)

based on a derivative of the [MuxAI](https://github.com/muxai/muxai-platform) platform.

---

## 🏷️ Tech Stack & Concepts

`React 19` `TypeScript` `Vite` `Tailwind CSS` `Three.js` `@pixiv/three-vrm` `@pixiv/three-vrm-springbone` `GLTFLoader` `Mixamo Retargeting` `Hugging Face Transformers.js` `ONNX Runtime Web` `WebGPU API` `WebAssembly (WASM)` `FP16 Half-Precision Quantization` `Q4 Quantization` `SpeechSynthesis API` `Web Audio API` `Phoneme-to-Viseme Lip Sync` `Damped Harmonic Spring Physics` `Verlet Integration` `Centrifugal & Rotational Inertia Dynamics` `Raycasting Interaction` `Ollama REST API` `Server-Sent Events (SSE)` `Express.js` `Google GenAI SDK` `IndexedDB API` `Cache API` `LocalStorage API` `Origin Private File System (OPFS)` `Responsive UI` `Offline-First Architecture` `Edge Computing`

---

## 🌟 Overview

This platform is a full-stack conversational application uniting persona-driven dialogue with on-device client-side Small Language Models (SLMs) and server-side LLMs. Built with React 19, TypeScript, Vite, Tailwind CSS, Three.js, `@pixiv/three-vrm`, and Hugging Face Transformers.js ONNX Web Runtime, the application can run entirely within your web browser with zero server dependency, or optionally connect to local/remote Ollama backend instances and cloud AI APIs.

The integrated 3D view features a humanoid VRM 1.0 avatar with retargeted Mixamo idle motions, real-time audio viseme lip-synchronization, procedural gaze and saccade tracking, full-body physical inertial dynamics when rotating, and physical impact absorption on user interactions.

---

## ✨ Key Features

- **In-Browser Edge SLM Neural Inference**: Execute lightweight Small Language Models (SmolLM2-135M, SmolLM2-360M, Qwen2.5-0.5B, MiniCPM5-2B, Llama-3.2-1B) directly in the client browser using Hugging Face Transformers.js and ONNX Runtime Web.
- **WebGPU & WASM Hardware Acceleration**: Automatic device detection prioritizing WebGPU execution, graceful fallback to multi-threaded WebAssembly with FP16/Q4 quantization, and persistent model weight caching in browser storage.
- **Interactive 3D Avatar with Full-Body Physics**: Three.js-rendered VRM 1.0 humanoid avatar featuring Mixamo idle motion retargeting, 3D look-at cursor tracking with ocular alignment, procedural eye blinks and micro-saccades, physical recoil impulses on pointer tap (spine/chest recoil, arm jolt, hip absorption, spring bone flutter), and full-body rotational inertia (spine torsional lag, arm centrifugal swing, and boosted secondary physics).
- **Real-Time Phonetic Lip Synchronization**: Centralized viseme analyzer processing voice synthesis audio to actuate VRM mouth shapes (`aa`, `oh`, `ou`, `ih`, `ee`) in direct sync with spoken voice synthesis and contextual facial expressions.
- **High-Quality Voice Bank Selection**: Automatic prioritizer selecting the highest quality modern neural, natural, enhanced, and premium female speech synthesis voices available across operating systems.
- **Cloud & Self-Hosted Ollama Support**: Connect to cloud Ollama servers or private local endpoints (e.g., `http://localhost:11434`), featuring live auto-ping, model tag enumeration, and CORS-friendly streaming.
- **Continuous Health Check & Auto-Failover**: Automated 5-second health checks continuously monitor remote servers; if a connected server goes offline, the app seamlessly switches to a local in-browser model and alerts the user with an auto-dismissing notice.
- **Comprehensive Session Management**: Complete client-side conversation storage, full-text dialogue search, message audio playback, editable user prompts, customizable token budgets, and granular cache/storage management.

---

## 🧠 Architecture

```
edge-ai-platform/
├── server.ts                    # Express backend (VRM proxy, animation proxy, Ollama & Gemini streaming)
├── src/
│   ├── App.tsx                  # Main application orchestrator & chat interface
│   ├── components/
│   │   ├── ChatInput.tsx        # Message input, model selector trigger, token budget, and send controls
│   │   ├── Header.tsx           # Navigation bar, profile access, 3D mode switch, and modal triggers
│   │   ├── MaxTokensSelector.tsx # Configurable token budget dropdown
│   │   ├── MessageItem.tsx      # Individual message card, speech synthesis, and token metrics
│   │   ├── MessageList.tsx      # Conversation scrollable feed with starter prompts
│   │   ├── ModelSelector.tsx    # Drop-up menu for in-browser SLMs and cloud/local Ollama models
│   │   ├── SearchBar.tsx        # In-conversation search and message filter modal
│   │   ├── SettingsModal.tsx    # Hardware acceleration preferences & browser storage manager
│   │   ├── Sidebar.tsx          # Conversation session management, search, and delete drawer
│   │   ├── SplashScreen.tsx     # Startup brand intro screen with auto-dismiss
│   │   ├── TelemetryBar.tsx     # Real-time hardware compute, speed, and latency status bar
│   │   ├── TwitterProfileModal.tsx # Persona social profile modal with banner crossfade
│   │   └── VRMCanvas.tsx        # Three.js 3D VRM humanoid avatar, Mixamo idle, look-at & full-body physics
│   ├── constants/
│   │   └── index.ts             # Central single configuration file (prompts, models, endpoints, constants)
│   ├── lib/
│   │   ├── audio.ts             # Web Audio API acoustic effects and high-quality voice resolution
│   │   ├── lipSync.ts           # SpeechSynthesis phoneme-to-viseme mapping & facial articulation
│   │   ├── models.ts            # Local SLM specifications, VRAM budgets, and model catalog
│   │   ├── ollama.ts            # Ollama connectivity ping, tags enumeration, and streaming client
│   │   ├── prompts.ts           # System prompt sanitization and text output cleanup
│   │   ├── slmEngine.ts         # Transformers.js ONNX Web pipeline, device detection, and token streaming
│   │   └── storage.ts           # Storage persistence, cache cleanup, and state management
│   ├── types/
│   │   └── index.ts             # Core TypeScript interfaces for models, messages, and telemetry
│   ├── index.css                # Tailwind CSS styling and custom animations
│   └── main.tsx                 # React DOM root entry point
├── index.html                   # HTML entry point with metadata & OpenGraph tags
├── package.json                 # Project dependencies, scripts, and runtime engines
├── tsconfig.json                # TypeScript compiler configuration
└── vite.config.ts               # Vite bundler configuration
```

---

## 🔒 Privacy & Offline Capability

- No conversational data, prompts, or images are transmitted to external tracking servers.
- After the initial download, in-browser models run **100% offline** without an active internet connection.
- All conversational history and preferences are preserved client-side in localStorage and IndexedDB.
- Model weights remain cached directly within browser storage with zero external telemetry.
- Client-side execution ensures your conversations remain confidential on your device.

---

## 📄 License

Distributed under the [MIT License](LICENSE).
