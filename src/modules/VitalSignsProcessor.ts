
import { GlucoseEstimator } from './GlucoseEstimator';
import { BloodGlucoseData } from '../types/signal';

export class VitalSignsProcessor {
  private bpmHistory: number[] = [];
  private spo2History: number[] = [];
  private glucoseEstimator: GlucoseEstimator | null = null;
  private isFingerDetected = false;
  private lastProcessTime = 0;
  private processingInterval = 150; // Aumentado a 150ms para reducir carga de procesamiento
  private processingCount = 0;
  private initialized = false;
  private errorCount = 0;
  private initializing = false;

  constructor() {
    try {
      this.initializeEstimator();
      console.log("VitalSignsProcessor: constructor initialized");
    } catch (error) {
      console.error("VitalSignsProcessor: constructor initialization failed", error);
      this.initialized = false;
    }
  }

  private async initializeEstimator() {
    if (this.initializing) return;
    this.initializing = true;
    
    try {
      this.glucoseEstimator = new GlucoseEstimator();
      this.initialized = true;
      this.errorCount = 0;
    } catch (error) {
      console.error("VitalSignsProcessor: Failed to initialize GlucoseEstimator:", error);
      this.glucoseEstimator = null;
      this.initialized = false;
      this.errorCount++;
    } finally {
      this.initializing = false;
    }
  }

  smoothBPM(rawBPM: number): number {
    if (rawBPM <= 0) return 0;
    
    this.bpmHistory.push(rawBPM);
    if (this.bpmHistory.length > 5) {
      this.bpmHistory.shift();
    }

    // Simple moving average for smoothing
    const validBpms = this.bpmHistory.filter(bpm => bpm > 0);
    if (validBpms.length === 0) return 0;
    
    return Math.round(validBpms.reduce((a, b) => a + b, 0) / validBpms.length);
  }

  processSignal(
    value: number, 
    rrData?: { 
      intervals: number[], 
      lastPeakTime: number | null, 
      amplitudes?: number[] 
    }
  ) {
    try {
      // Verificar valor de entrada para prevenir procesamiento de datos inválidos
      if (!Number.isFinite(value)) {
        console.warn("VitalSignsProcessor: Received invalid signal value:", value);
        return {
          spo2: 0,
          pressure: "--/--",
          glucose: null
        };
      }
      
      if (!this.initialized) {
        // Intentar reinicializar si no está inicializado
        if (!this.initializing) {
          this.initializeEstimator();
        }
        
        this.errorCount++;
        if (this.errorCount > 5) {
          console.log("VitalSignsProcessor: Too many errors, resetting");
          this.reset();
        }
        
        return {
          spo2: 0,
          pressure: "--/--",
          glucose: null
        };
      }
      
      // Throttle processing to avoid excessive calculations
      const currentTime = Date.now();
      if (currentTime - this.lastProcessTime < this.processingInterval) {
        return null; // Skip processing if called too frequently
      }
      this.lastProcessTime = currentTime;
      this.processingCount++;
      
      if (this.processingCount % 20 === 0) {
        console.log(`VitalSignsProcessor: processing signal #${this.processingCount}, value: ${value.toFixed(2)}`);
      }
      
      // Calculate if finger is detected - more reliable check
      // Only consider finger detected if signal value is significant
      this.isFingerDetected = Math.abs(value) > 0.8; // Reducido el umbral para mejorar la detección
      
      // Only process when finger is detected to avoid false readings
      if (!this.isFingerDetected) {
        if (this.processingCount % 20 === 0) {
          console.log("VitalSignsProcessor: No finger detected");
        }
        return {
          spo2: 0,
          pressure: "--/--",
          glucose: null
        };
      }
      
      // Process blood glucose estimation directly from PPG signal
      if (this.glucoseEstimator) {
        try {
          this.glucoseEstimator.processPpg(value, this.isFingerDetected);
        } catch (error) {
          console.error("VitalSignsProcessor: Error processing glucose:", error);
          // No reinicializar aquí para evitar errores en cascada
        }
        
        if (rrData?.intervals && rrData.intervals.length > 0) {
          // Calculate heart rate from RR intervals
          const validIntervals = rrData.intervals.filter(interval => interval > 0 && interval < 2000);
          if (validIntervals.length > 0) {
            const avgInterval = validIntervals.reduce((sum, val) => sum + val, 0) / validIntervals.length;
            const bpm = Math.round(60000 / avgInterval);
            if (bpm > 40 && bpm < 200) { // Validate the BPM is in physiological range
              try {
                this.glucoseEstimator.updateHeartRate(bpm);
              } catch (error) {
                console.error("VitalSignsProcessor: Error updating heart rate:", error);
              }
            }
          }
          
          // If we have RR intervals, we can calculate HRV
          if (rrData.intervals.length >= 3) {
            try {
              const rmssd = this.calculateRMSSD(rrData.intervals);
              this.glucoseEstimator.updateHrv(rmssd);
            } catch (error) {
              console.error("VitalSignsProcessor: Error calculating/updating HRV:", error);
            }
          }
        }
      }
      
      // Simplified SpO2 calculation
      let spo2 = 0;
      if (this.isFingerDetected && Math.abs(value) > 0.8) {
        spo2 = 95 + Math.min(4, Math.max(-4, value / 5));
        spo2 = Math.min(100, Math.max(80, Math.round(spo2)));
        
        this.spo2History.push(spo2);
        if (this.spo2History.length > 10) {
          this.spo2History.shift();
        }
        
        spo2 = Math.round(this.spo2History.reduce((a, b) => a + b, 0) / this.spo2History.length);
        
        if (this.glucoseEstimator) {
          try {
            this.glucoseEstimator.updateSpo2(spo2);
          } catch (error) {
            console.error("VitalSignsProcessor: Error updating SpO2:", error);
          }
        }
      }
      
      // Get blood glucose estimate if enough data is available
      let glucose: BloodGlucoseData | null = null;
      if (this.glucoseEstimator) {
        try {
          if (this.glucoseEstimator.hasValidGlucoseData()) {
            glucose = this.glucoseEstimator.estimateGlucose();
            if (this.processingCount % 20 === 0) {
              console.log("VitalSignsProcessor: estimated glucose:", glucose);
            }
          } else if (this.processingCount % 20 === 0) {
            console.log("VitalSignsProcessor: not enough data for glucose estimation");
          }
        } catch (error) {
          console.error("VitalSignsProcessor: Error estimating glucose:", error);
        }
      }
      
      // Simplified blood pressure calculation based on heart rate and signal strength
      let pressure = "--/--";
      if (rrData?.intervals && rrData.intervals.length > 0 && this.isFingerDetected) {
        try {
          const validIntervals = rrData.intervals.filter(interval => interval > 0 && interval < 2000);
          if (validIntervals.length > 0) {
            const avgInterval = validIntervals.reduce((sum, val) => sum + val, 0) / validIntervals.length;
            const hr = Math.round(60000 / avgInterval);
            
            // Very simplified BP model based on heart rate
            if (hr > 40 && hr < 200) {
              const systolic = Math.round(100 + (hr - 70) * 0.7 + value * 5);
              const diastolic = Math.round(70 + (hr - 70) * 0.4 + value * 3);
              pressure = `${systolic}/${diastolic}`;
            }
          }
        } catch (error) {
          console.error("VitalSignsProcessor: Error calculating blood pressure:", error);
        }
      }
      
      // If we reach this point, we successfully processed the signal
      this.errorCount = 0;
      
      return {
        spo2,
        pressure,
        glucose
      };
    } catch (error) {
      console.error("VitalSignsProcessor: Unhandled error in processSignal:", error);
      this.errorCount++;
      
      // If we have multiple consecutive errors, attempt to recover
      if (this.errorCount > 5) {
        console.log("VitalSignsProcessor: Too many errors, attempting to recover");
        this.reset();
      }
      
      return {
        spo2: 0,
        pressure: "--/--",
        glucose: null
      };
    }
  }
  
  private calculateRMSSD(intervals: number[]): number {
    if (intervals.length < 2) return 0;
    
    // Filter out invalid intervals
    const validIntervals = intervals.filter(i => i > 200 && i < 2000);
    if (validIntervals.length < 2) return 0;
    
    let sumSquaredDiffs = 0;
    for (let i = 0; i < validIntervals.length - 1; i++) {
      const diff = validIntervals[i + 1] - validIntervals[i];
      sumSquaredDiffs += diff * diff;
    }
    
    return Math.sqrt(sumSquaredDiffs / (validIntervals.length - 1));
  }
  
  reset(): void {
    console.log("VitalSignsProcessor: reset called");
    try {
      this.bpmHistory = [];
      this.spo2History = [];
      
      // Creamos un nuevo estimador para evitar problemas de estado inconsistente
      this.glucoseEstimator = null;
      setTimeout(() => {
        if (!this.initializing) {
          this.initializeEstimator();
        }
      }, 100);
      
      this.isFingerDetected = false;
      this.lastProcessTime = 0;
      this.processingCount = 0;
      this.errorCount = 0;
    } catch (error) {
      console.error("VitalSignsProcessor: Error during reset:", error);
      this.errorCount++;
    }
  }
}
