
import { HeartBeatProcessor } from '../modules/HeartBeatProcessor';

export interface ProcessedSignal {
  timestamp: number;
  rawValue: number;
  filteredValue: number;
  quality: number;
  fingerDetected: boolean;
  roi: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ProcessingError {
  code: string;
  message: string;
  timestamp: number;
}

export interface SignalProcessor {
  initialize: () => Promise<void>;
  start: () => void;
  stop: () => void;
  calibrate: () => Promise<boolean>;
  onSignalReady?: (signal: ProcessedSignal) => void;
  onError?: (error: ProcessingError) => void;
}

export interface RespirationData {
  rate: number;      // Respiraciones por minuto
  depth: number;     // Profundidad (0-100)
  regularity: number; // Regularidad (0-100)
}

declare global {
  interface Window {
    heartBeatProcessor: HeartBeatProcessor;
    gc?: () => void; // Añadir definición para garbage collector
  }
}
