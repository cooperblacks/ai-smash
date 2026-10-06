/**
 * Built-in Browser Device Info Tool
 * Inspects client hardware, browser capabilities, memory, cores, and display metrics.
 */

export interface DeviceInfoResult {
  userAgent: string;
  platform: string;
  language: string;
  languages: readonly string[];
  online: boolean;
  timeZone: string;
  hardwareConcurrency: number;
  deviceMemoryGb?: number | string;
  screen: {
    width: number;
    height: number;
    availWidth: number;
    availHeight: number;
    colorDepth: number;
    pixelRatio: number;
    orientation?: string;
  };
  capabilities: {
    webGpuSupported: boolean;
    webGlSupported: boolean;
    speechSynthesisSupported: boolean;
    speechRecognitionSupported: boolean;
    audioContextSupported: boolean;
    touchScreen: boolean;
  };
  battery?: {
    levelPercent: number;
    charging: boolean;
  };
}

export async function getBrowserDeviceInfo(): Promise<DeviceInfoResult> {
  const isBrowser = typeof window !== 'undefined' && typeof navigator !== 'undefined';
  if (!isBrowser) {
    return {
      userAgent: 'Node.js runtime',
      platform: process.platform,
      language: 'en',
      languages: ['en'],
      online: true,
      timeZone: 'UTC',
      hardwareConcurrency: 4,
      screen: {
        width: 1920,
        height: 1080,
        availWidth: 1920,
        availHeight: 1080,
        colorDepth: 24,
        pixelRatio: 1,
      },
      capabilities: {
        webGpuSupported: false,
        webGlSupported: false,
        speechSynthesisSupported: false,
        speechRecognitionSupported: false,
        audioContextSupported: false,
        touchScreen: false,
      },
    };
  }

  // Check WebGPU
  const webGpuSupported = 'gpu' in navigator;

  // Check WebGL
  let webGlSupported = false;
  try {
    const canvas = document.createElement('canvas');
    webGlSupported = Boolean(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch {}

  // Check Touch
  const touchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // Check Battery
  let batteryInfo: DeviceInfoResult['battery'] | undefined;
  if ('getBattery' in navigator) {
    try {
      const b = await (navigator as any).getBattery();
      if (b) {
        batteryInfo = {
          levelPercent: Math.round(b.level * 100),
          charging: Boolean(b.charging),
        };
      }
    } catch {}
  }

  // Device Memory
  const mem = (navigator as any).deviceMemory;

  return {
    userAgent: navigator.userAgent,
    platform: (navigator as any).userAgentData?.platform || navigator.platform || 'Unknown',
    language: navigator.language,
    languages: navigator.languages || [navigator.language],
    online: navigator.onLine,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    hardwareConcurrency: navigator.hardwareConcurrency || 4,
    deviceMemoryGb: mem ? `${mem} GB` : 'Not exposed by browser',
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      availWidth: window.screen.availWidth,
      availHeight: window.screen.availHeight,
      colorDepth: window.screen.colorDepth,
      pixelRatio: window.devicePixelRatio || 1,
      orientation: window.screen.orientation?.type,
    },
    capabilities: {
      webGpuSupported,
      webGlSupported,
      speechSynthesisSupported: typeof window.speechSynthesis !== 'undefined',
      speechRecognitionSupported: 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window,
      audioContextSupported: 'AudioContext' in window || 'webkitAudioContext' in window,
      touchScreen,
    },
    battery: batteryInfo,
  };
}
