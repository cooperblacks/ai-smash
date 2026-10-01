# Serafina Web

> An intelligent, reserved romanticist AI companion and conversational platform

![](https://serafina-ai.vercel.app/og-image.png)
---

### [🌐 [Visit the website]](https://serafina-ai.vercel.app)    [:octocat: [Visit the company repo]](https://github.com/muxai/muxai-platform)

Previously, the main project started off from [this repository](https://github.com/dwmk/seraphina-web).

## 🌟 Overview

**Serafina Web** is a full-stack AI conversation application combining sophisticated persona-driven dialogue with both server-side LLMs and client-side on-device SLMs. Built with React 19, TypeScript, Vite, Tailwind CSS, Three.js, @pixiv/three-vrm, and Hugging Face Transformers.js ONNX Web Runtime, Serafina can run entirely within your web browser with zero server dependency or connect to local/remote Ollama backend instances.

---

## ✨ Key Features

- **In-Browser Edge SLM Neural Inference**: Execute lightweight Small Language Models (SmolLM2-135M, SmolLM2-360M, Qwen2.5-0.5B, MiniCPM5-2B, Llama-3.2-1B) directly in the user's browser via Hugging Face Transformers.js and ONNX Runtime Web.
- **WebGPU & WASM Hardware Acceleration**: Automatic device detection with WebGPU priority, fallback to multi-threaded WebAssembly with FP16/Q4 quantization, and persistent weight caching in browser IndexedDB/OPFS.
- **Interactive 3D VRM 1.0 Avatar**: Three.js-rendered 3D humanoid avatar featuring Mixamo idle motion retargeting, dynamic look-at mouse cursor tracking with ocular alignment, procedural eye blinks and micro-saccades, physical recoil impulses on pointer tap, and 360° drag rotation.
- **Real-Time Phonetic Lip Synchronization**: Centralized viseme analyzer processing Web Speech API audio to actuate VRM mouth shapes (`aa`, `oh`, `ou`, `ih`, `ee`) in sync with spoken voice synthesis and contextual facial expressions.
- **Cloud & Self-Hosted Ollama Support**: Connect to high-capacity cloud Ollama servers (MuxAI) or private local Ollama endpoints (e.g., `http://localhost:11434`), featuring live auto-ping, model tag discovery, and CORS-friendly streaming.
- **Continuous Server Ping & Auto-Failover**: Automated 5-second health checks continuously monitor Ollama servers; if a connected server goes offline, Serafina instantly switches to the local SmolLM2 135M browser model and alerts the user with an auto-dismissing notice.
- **Rich Character Persona & Anti-AI Prompting**: Distinctive human persona directives, deliberate speech cadence, simple vocabulary constraints, and strict formatting rules without artificial robotic tropes.
- **Comprehensive Session Management**: Client-side conversation storage in localStorage, full-text dialogue search, message audio playback, editable user prompts, customizable max token budgets, and granular model storage manager.

---

## 🧠 Architecture

```
serafina-web/
├── server.ts                    # Express backend (VRM proxy, idle motion proxy, Ollama & Gemini streaming)
├── src/
│   ├── App.tsx                  # Main application orchestrator & chat interface
│   ├── components/
│   │   ├── ChatInput.tsx        # Message input, model selector trigger, token budget, and send controls
│   │   ├── Header.tsx           # Navigation bar, persona avatar, view mode switch, and modal triggers
│   │   ├── MaxTokensSelector.tsx # Configurable token budget dropdown
│   │   ├── MessageItem.tsx      # Individual message card, speech synthesis, and token metrics
│   │   ├── MessageList.tsx      # Conversation scrollable feed with starter prompts
│   │   ├── ModelSelector.tsx    # Drop-up menu for in-browser SLMs and cloud/local Ollama models
│   │   ├── SearchBar.tsx        # In-conversation search and message filter modal
│   │   ├── SettingsModal.tsx    # Hardware acceleration preferences & IndexedDB SLM storage manager
│   │   ├── Sidebar.tsx          # Conversation session management, search, and delete drawer
│   │   ├── SplashScreen.tsx     # Startup brand intro screen with auto-dismiss
│   │   ├── TelemetryBar.tsx     # Real-time hardware compute, speed, and latency status bar
│   │   ├── TwitterProfileModal.tsx # Serafina's social profile modal with banner crossfade
│   │   └── VRMCanvas.tsx        # Three.js 3D VRM humanoid avatar, Mixamo idle, look-at & physics
│   ├── constants/
│   │   └── index.ts             # System persona prompts, default models, and app constants
│   ├── lib/
│   │   ├── audio.ts             # Web Audio API sound effects and UI acoustic feedback
│   │   ├── lipSync.ts           # SpeechSynthesis phoneme-to-viseme mapping & facial articulation
│   │   ├── models.ts            # Local SLM specifications, VRAM budgets, and model catalog
│   │   ├── ollama.ts            # Ollama connectivity ping, tags enumeration, and streaming client
│   │   ├── prompts.ts           # System prompt sanitization and text output cleanup
│   │   ├── slmEngine.ts         # Transformers.js ONNX Web pipeline, device detection, and token streaming
│   │   └── storage.ts           # LocalStorage conversation history and configuration persistence
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

- No conversational data, prompts, or images are transmitted to external AI servers.
- After the initial download, browser models can run **100% offline** without an internet connection.
- All conversational history and settings are stored locally in your browser's IndexedDB and localStorage.
- Model weights remain cached directly within your device's Origin Private File System (OPFS), with no telemetry or third-party tracking.
- Client-side execution ensures your conversations remain confidential and private on your device.

---

## 📄 License & Intellectual Property Notice

- **Project License**: The source code and software implementation of **Serafina AI** are distributed under the [MIT License](LICENSE).
- **Original Character & Intellectual Property (IP)**: **Serafina / Seraphina**, including her name, character identity, persona directives, backstory, speech patterns, visual aesthetics, and associated creative lore, is an **Original Character (OC)** and the exclusive **Intellectual Property (IP)** of the creator. This project license applies solely to the software codebase, tools, and technical implementation. It does not grant ownership, trademark, or commercial character rights over Serafina/Seraphina as an intellectual property.
