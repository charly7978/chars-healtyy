
import { ArrhythmiaResult, ArrhythmiaType } from '../types/signal';

export class ArrhythmiaDetector {
  private rrIntervals: number[] = [];
  private amplitudes: number[] = [];
  private lastPeakTimes: number[] = [];
  private learningPhase: boolean = true;
  private learningPhaseCount: number = 0;
  private readonly LEARNING_PHASE_THRESHOLD = 20;
  private readonly MAX_INTERVALS = 50;
  private lastAnalysisTime: number = 0;
  private lastPeakTime: number | null = null;
  private readonly ANALYSIS_COOLDOWN_MS = 1000; // Prevent overanalyzing
  
  constructor() {
    console.log("ArrhythmiaDetector: Inicializado");
  }
  
  public addRRInterval(interval: number, amplitude?: number): void {
    if (interval < 300 || interval > 2000) {
      // Filtrar intervalos no fisiológicos
      return;
    }
    
    this.rrIntervals.push(interval);
    this.amplitudes.push(amplitude || 0);
    
    // Mantener los arrays dentro de un tamaño máximo
    if (this.rrIntervals.length > this.MAX_INTERVALS) {
      this.rrIntervals.shift();
      this.amplitudes.shift();
    }
    
    // Fase de aprendizaje
    if (this.learningPhase) {
      this.learningPhaseCount++;
      if (this.learningPhaseCount >= this.LEARNING_PHASE_THRESHOLD) {
        this.learningPhase = false;
        console.log("ArrhythmiaDetector: Fase de aprendizaje completada");
      }
    }
  }
  
  public setLastPeakTime(timestamp: number): void {
    this.lastPeakTime = timestamp;
    this.lastPeakTimes.push(timestamp);
    
    // Mantener el historial de tiempos de pico dentro de un límite
    if (this.lastPeakTimes.length > this.MAX_INTERVALS) {
      this.lastPeakTimes.shift();
    }
  }
  
  public isInLearningPhase(): boolean {
    return this.learningPhase;
  }
  
  public analyzeRhythm(): ArrhythmiaResult {
    const currentTime = Date.now();
    
    // Evitar análisis demasiado frecuentes
    if (currentTime - this.lastAnalysisTime < this.ANALYSIS_COOLDOWN_MS) {
      return {
        detected: false,
        severity: 0,
        confidence: 0,
        type: 'NONE',
        timestamp: currentTime
      };
    }
    
    this.lastAnalysisTime = currentTime;
    
    // Si estamos en fase de aprendizaje o no tenemos suficientes datos
    if (this.learningPhase || this.rrIntervals.length < 8) {
      return {
        detected: false,
        severity: 0,
        confidence: 0,
        type: 'NONE',
        timestamp: currentTime
      };
    }
    
    try {
      // Análisis de variabilidad RR para detectar fibrilación auricular
      const rmssd = this.calculateRMSSD();
      const rrVariation = this.calculateRRVariation();
      
      console.log(`ArrhythmiaDetector: RMSSD = ${rmssd.toFixed(2)}, RRVariation = ${rrVariation.toFixed(2)}`);
      
      // Detección de PAC (contracciones auriculares prematuras)
      const hasPAC = this.detectPAC();
      
      // Detección de PVC (contracciones ventriculares prematuras)
      const hasPVC = this.detectPVC();
      
      // Detección de AF (fibrilación auricular)
      const hasAF = this.detectAF(rmssd, rrVariation);
      
      // Determinar tipo de arritmia detectada
      let arrhythmiaType: ArrhythmiaType = 'NONE';
      let severity = 0;
      let confidence = 0;
      
      if (hasAF) {
        arrhythmiaType = 'AF';
        severity = Math.min(10, 5 + Math.floor(rmssd / 50));
        confidence = Math.min(1, rrVariation / 0.2);
      } else if (hasPVC) {
        arrhythmiaType = 'PVC';
        severity = 7;
        confidence = 0.8;
      } else if (hasPAC) {
        arrhythmiaType = 'PAC';
        severity = 5;
        confidence = 0.7;
      }
      
      const detected = arrhythmiaType !== 'NONE';
      
      if (detected) {
        console.log(`ArrhythmiaDetector: Arritmia tipo ${arrhythmiaType} detectada con severidad ${severity} y confianza ${confidence.toFixed(2)}`);
      }
      
      return {
        detected,
        severity,
        confidence,
        type: arrhythmiaType,
        timestamp: currentTime,
        rmssd,
        rrVariation
      };
    } catch (error) {
      console.error("Error en análisis de arritmias:", error);
      return {
        detected: false,
        severity: 0,
        confidence: 0,
        type: 'NONE',
        timestamp: currentTime
      };
    }
  }
  
  private calculateRMSSD(): number {
    if (this.rrIntervals.length < 2) return 0;
    
    let sum = 0;
    for (let i = 1; i < this.rrIntervals.length; i++) {
      const diff = this.rrIntervals[i] - this.rrIntervals[i - 1];
      sum += diff * diff;
    }
    
    return Math.sqrt(sum / (this.rrIntervals.length - 1));
  }
  
  private calculateRRVariation(): number {
    if (this.rrIntervals.length < 3) return 0;
    
    const diffs = [];
    for (let i = 1; i < this.rrIntervals.length; i++) {
      diffs.push(Math.abs(this.rrIntervals[i] - this.rrIntervals[i - 1]));
    }
    
    // Normalizar por el promedio de los intervalos RR
    const avgRR = this.rrIntervals.reduce((a, b) => a + b, 0) / this.rrIntervals.length;
    const variation = diffs.reduce((a, b) => a + b, 0) / diffs.length / avgRR;
    
    return variation;
  }
  
  private detectPAC(): boolean {
    if (this.rrIntervals.length < 4) return false;
    
    // Buscar un patrón corto-largo-normal (característico de PAC)
    for (let i = 2; i < this.rrIntervals.length; i++) {
      const prev2 = this.rrIntervals[i - 2];
      const prev1 = this.rrIntervals[i - 1];
      const current = this.rrIntervals[i];
      
      // Si hay un intervalo corto seguido de uno largo
      if (prev2 > 600 && prev1 < 0.8 * prev2 && current > 1.1 * prev1) {
        return true;
      }
    }
    
    return false;
  }
  
  private detectPVC(): boolean {
    if (this.rrIntervals.length < 4 || this.amplitudes.length < 4) return false;
    
    // PVC típicamente tienen: 
    // 1. Un latido prematuro (intervalo RR corto)
    // 2. Una pausa compensatoria después (intervalo RR largo)
    // 3. Mayor amplitud en la onda R
    
    for (let i = 2; i < this.rrIntervals.length - 1; i++) {
      const prev = this.rrIntervals[i - 1];
      const current = this.rrIntervals[i];
      const next = this.rrIntervals[i + 1];
      
      const avgNormal = (this.rrIntervals.reduce((sum, val) => sum + val, 0) - current) / 
                          (this.rrIntervals.length - 1);
      
      // Si hay un intervalo corto seguido de uno largo (pausa compensatoria)
      // Y la amplitud es significativamente mayor
      if (current < 0.8 * avgNormal && 
          next > 1.2 * avgNormal &&
          this.amplitudes[i] > 1.3 * (this.getAvgAmplitude())) {
        return true;
      }
    }
    
    return false;
  }
  
  private detectAF(rmssd: number, rrVariation: number): boolean {
    // AF se caracteriza por alta variabilidad en los intervalos RR
    // y ausencia de un patrón regular
    
    // Criterios basados en estudios clínicos
    const highRMSSD = rmssd > 100; // Alta variabilidad instantánea
    const highVariation = rrVariation > 0.1; // Alta variabilidad general
    
    // Verificar patrones irregulares consecutivos
    let irregularCount = 0;
    for (let i = 1; i < this.rrIntervals.length; i++) {
      const diff = Math.abs(this.rrIntervals[i] - this.rrIntervals[i - 1]);
      if (diff > 100) {
        irregularCount++;
      }
    }
    
    const highIrregularity = irregularCount >= this.rrIntervals.length * 0.7;
    
    return highRMSSD && highVariation && highIrregularity;
  }
  
  private getAvgAmplitude(): number {
    if (this.amplitudes.length === 0) return 0;
    
    // Filtrar valores de 0 que podrían no ser reales
    const validAmplitudes = this.amplitudes.filter(a => a > 0);
    if (validAmplitudes.length === 0) return 0;
    
    return validAmplitudes.reduce((sum, val) => sum + val, 0) / validAmplitudes.length;
  }
  
  public reset(): void {
    this.rrIntervals = [];
    this.amplitudes = [];
    this.lastPeakTimes = [];
    this.learningPhase = true;
    this.learningPhaseCount = 0;
    this.lastAnalysisTime = 0;
    this.lastPeakTime = null;
    
    console.log("ArrhythmiaDetector: Reset completo");
  }
}
