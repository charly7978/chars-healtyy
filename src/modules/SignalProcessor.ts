import { ProcessedSignal, ProcessingError, SignalProcessor } from '../types/signal';

class KalmanFilter {
  private R: number = 0.01;
  private Q: number = 0.1;
  private P: number = 1;
  private X: number = 0;
  private K: number = 0;

  filter(measurement: number): number {
    this.P = this.P + this.Q;
    this.K = this.P / (this.P + this.R);
    this.X = this.X + this.K * (measurement - this.X);
    this.P = (1 - this.K) * this.P;
    return this.X;
  }

  reset() {
    this.X = 0;
    this.P = 1;
  }
}

export class PPGSignalProcessor implements SignalProcessor {
  private isProcessing: boolean = false;
  private kalmanFilter: KalmanFilter;
  private lastValues: number[] = [];
  private readonly DEFAULT_CONFIG = {
    BUFFER_SIZE: 15,
    MIN_RED_THRESHOLD: 95,
    MAX_RED_THRESHOLD: 235,
    STABILITY_WINDOW: 8,
    MIN_STABILITY_COUNT: 6
  };
  private currentConfig: typeof this.DEFAULT_CONFIG;
  private readonly BUFFER_SIZE = 15;
  private readonly MIN_RED_THRESHOLD = 95;
  private readonly MAX_RED_THRESHOLD = 235;
  private readonly STABILITY_WINDOW = 8;
  private readonly MIN_STABILITY_COUNT = 6;
  private stableFrameCount: number = 0;
  private lastStableValue: number = 0;
  private readonly PERFUSION_INDEX_THRESHOLD = 0.06;
  private consecutiveStableFrames: number = 0;
  private lastDetectionTime: number = 0;
  private readonly MIN_DETECTION_INTERVAL = 500;

  constructor(
    public onSignalReady?: (signal: ProcessedSignal) => void,
    public onError?: (error: ProcessingError) => void
  ) {
    this.kalmanFilter = new KalmanFilter();
    this.currentConfig = { ...this.DEFAULT_CONFIG };
    console.log("PPGSignalProcessor: Instancia creada con nueva configuración");
  }

  async initialize(): Promise<void> {
    try {
      this.lastValues = [];
      this.stableFrameCount = 0;
      this.lastStableValue = 0;
      this.kalmanFilter.reset();
      console.log("PPGSignalProcessor: Inicializado");
    } catch (error) {
      console.error("PPGSignalProcessor: Error de inicialización", error);
      this.handleError("INIT_ERROR", "Error al inicializar el procesador");
    }
  }

  start(): void {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.initialize();
    console.log("PPGSignalProcessor: Iniciado");
  }

  stop(): void {
    this.isProcessing = false;
    this.lastValues = [];
    this.stableFrameCount = 0;
    this.lastStableValue = 0;
    this.kalmanFilter.reset();
    console.log("PPGSignalProcessor: Detenido");
  }

  async calibrate(): Promise<boolean> {
    try {
      console.log("PPGSignalProcessor: Iniciando calibración");
      await this.initialize();

      await new Promise(resolve => setTimeout(resolve, 2000));

      this.currentConfig = {
        ...this.DEFAULT_CONFIG,
        MIN_RED_THRESHOLD: Math.max(25, this.MIN_RED_THRESHOLD - 5),
        MAX_RED_THRESHOLD: Math.min(255, this.MAX_RED_THRESHOLD + 5),
        STABILITY_WINDOW: this.STABILITY_WINDOW,
        MIN_STABILITY_COUNT: this.MIN_STABILITY_COUNT
      };

      console.log("PPGSignalProcessor: Calibración completada", this.currentConfig);
      return true;
    } catch (error) {
      console.error("PPGSignalProcessor: Error de calibración", error);
      this.handleError("CALIBRATION_ERROR", "Error durante la calibración");
      return false;
    }
  }

  resetToDefault(): void {
    this.currentConfig = { ...this.DEFAULT_CONFIG };
    this.initialize();
    console.log("PPGSignalProcessor: Configuración restaurada a valores por defecto");
  }

  processFrame(imageData: ImageData): void {
    if (!this.isProcessing) {
      console.log("PPGSignalProcessor: No está procesando");
      return;
    }

    try {
      const redValue = this.extractRedChannel(imageData);
      const filtered = this.kalmanFilter.filter(redValue);
      this.lastValues.push(filtered);
      
      if (this.lastValues.length > this.BUFFER_SIZE) {
        this.lastValues.shift();
      }

      const { isFingerDetected, quality } = this.analyzeSignal(filtered, redValue);

      console.log("PPGSignalProcessor: Análisis", {
        redValue,
        filtered,
        isFingerDetected,
        quality,
        stableFrames: this.stableFrameCount
      });

      const processedSignal: ProcessedSignal = {
        timestamp: Date.now(),
        rawValue: redValue,
        filteredValue: filtered,
        quality: quality,
        fingerDetected: isFingerDetected,
        roi: this.detectROI(redValue)
      };

      this.onSignalReady?.(processedSignal);

    } catch (error) {
      console.error("PPGSignalProcessor: Error procesando frame", error);
      this.handleError("PROCESSING_ERROR", "Error al procesar frame");
    }
  }

  private extractRedChannel(imageData: ImageData): number {
    const data = imageData.data;
    let redSum = 0;
    let count = 0;
    
    const startX = Math.floor(imageData.width * 0.375);
    const endX = Math.floor(imageData.width * 0.625);
    const startY = Math.floor(imageData.height * 0.375);
    const endY = Math.floor(imageData.height * 0.625);
    
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const i = (y * imageData.width + x) * 4;
        redSum += data[i];  // Canal rojo
        count++;
      }
    }
    
    const avgRed = redSum / count;
    return avgRed;
  }

  private analyzeSignal(filtered: number, rawValue: number): { isFingerDetected: boolean, quality: number } {
    const currentTime = Date.now();
    const isInRange = rawValue >= this.MIN_RED_THRESHOLD && rawValue <= this.MAX_RED_THRESHOLD;
    
    const timeSinceLastDetection = currentTime - this.lastDetectionTime;
    if (timeSinceLastDetection < this.MIN_DETECTION_INTERVAL) {
      return { 
        isFingerDetected: this.consecutiveStableFrames >= this.MIN_STABILITY_COUNT, 
        quality: this.calculateQuality(rawValue, filtered) 
      };
    }

    if (!isInRange) {
      this.consecutiveStableFrames = 0;
      this.stableFrameCount = Math.max(0, this.stableFrameCount - 2);
      return { isFingerDetected: false, quality: 0 };
    }

    if (this.lastValues.length < this.STABILITY_WINDOW) {
      return { isFingerDetected: false, quality: 0 };
    }

    const recentValues = this.lastValues.slice(-this.STABILITY_WINDOW);
    const avgValue = recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length;
    
    const variations = recentValues.map((val, i, arr) => {
      if (i === 0) return 0;
      return Math.abs(val - arr[i-1]);
    });

    const maxVariation = Math.max(...variations);
    const avgVariation = variations.reduce((sum, val) => sum + val, 0) / variations.length;
    const stdDeviation = Math.sqrt(
      variations.reduce((sum, val) => sum + Math.pow(val - avgVariation, 2), 0) / variations.length
    );
    
    const adaptiveThreshold = Math.max(2.5, avgValue * 0.03);
    const isStable = maxVariation < adaptiveThreshold * 1.8 && 
                    avgVariation < adaptiveThreshold &&
                    stdDeviation < adaptiveThreshold * 0.5;

    if (isStable) {
      this.consecutiveStableFrames++;
      this.stableFrameCount = Math.min(this.stableFrameCount + 0.5, this.MIN_STABILITY_COUNT * 2);
      this.lastStableValue = filtered;
    } else {
      this.consecutiveStableFrames = Math.max(0, this.consecutiveStableFrames - 1);
      this.stableFrameCount = Math.max(0, this.stableFrameCount - 1);
    }

    const isFingerDetected = this.consecutiveStableFrames >= this.MIN_STABILITY_COUNT;
    
    if (isFingerDetected) {
      this.lastDetectionTime = currentTime;
    }

    const quality = this.calculateQuality(rawValue, filtered);
    return { isFingerDetected, quality };
  }

  private calculateQuality(rawValue: number, filtered: number): number {
    if (this.consecutiveStableFrames < this.MIN_STABILITY_COUNT) return 0;

    const stabilityScore = Math.min(this.consecutiveStableFrames / (this.MIN_STABILITY_COUNT * 2), 1);
    const intensityScore = Math.min(
      (rawValue - this.MIN_RED_THRESHOLD) / (this.MAX_RED_THRESHOLD - this.MIN_RED_THRESHOLD), 
      1
    );
    const variationScore = Math.max(0, 1 - (Math.abs(filtered - this.lastStableValue) / 10));

    return Math.round((
      stabilityScore * 0.6 + 
      intensityScore * 0.2 + 
      variationScore * 0.2
    ) * 100);
  }

  private detectROI(redValue: number): ProcessedSignal['roi'] {
    return {
      x: 0,
      y: 0,
      width: 100,
      height: 100
    };
  }

  private handleError(code: string, message: string): void {
    console.error("PPGSignalProcessor: Error", code, message);
    const error: ProcessingError = {
      code,
      message,
      timestamp: Date.now()
    };
    this.onError?.(error);
  }
}
