
import { applySMAFilter } from '../utils/signalProcessingUtils';
import { SpO2Calculator } from './SpO2Calculator';
import { BloodPressureCalculator } from './BloodPressureCalculator';
import { ArrhythmiaDetector } from './ArrhythmiaDetector';

export class VitalSignsProcessor {
  private readonly WINDOW_SIZE = 300;
  private ppgValues: number[] = [];
  private readonly SMA_WINDOW = 3;
  
  // Specialized modules for each vital sign
  private spO2Calculator: SpO2Calculator;
  private bpCalculator: BloodPressureCalculator;
  private arrhythmiaDetector: ArrhythmiaDetector;
  
  constructor() {
    this.spO2Calculator = new SpO2Calculator();
    this.bpCalculator = new BloodPressureCalculator();
    this.arrhythmiaDetector = new ArrhythmiaDetector();
  }

  /**
   * Process incoming PPG signal and calculate vital signs
   */
  public processSignal(
    ppgValue: number,
    rrData?: { intervals: number[]; lastPeakTime: number | null }
  ) {
    const currentTime = Date.now();

    // Update RR intervals if available
    if (rrData?.intervals && rrData.intervals.length > 0) {
      this.arrhythmiaDetector.updateIntervals(rrData.intervals, rrData.lastPeakTime);
    }

    // Process PPG signal
    const filtered = this.applySMAFilter(ppgValue);
    this.ppgValues.push(filtered);
    if (this.ppgValues.length > this.WINDOW_SIZE) {
      this.ppgValues.shift();
    }

    // Check learning phase
    const isLearning = this.arrhythmiaDetector.isInLearningPhase();
    
    // During learning phase, collect values for SpO2 calibration
    if (isLearning) {
      if (this.ppgValues.length >= 60) {
        const tempSpO2 = this.spO2Calculator.calculateRaw(this.ppgValues.slice(-60));
        if (tempSpO2 > 0) {
          this.spO2Calculator.addCalibrationValue(tempSpO2);
        }
      }
    } else {
      // Auto-calibrate SpO2
      this.spO2Calculator.calibrate();
    }

    // Process arrhythmia detection
    const arrhythmiaResult = this.arrhythmiaDetector.detect();

    // Calculate vital signs
    const spo2 = this.spO2Calculator.calculate(this.ppgValues.slice(-60));
    const bp = this.bpCalculator.calculate(this.ppgValues.slice(-60));
    const pressure = `${bp.systolic}/${bp.diastolic}`;

    // Prepare arrhythmia data if detected
    const lastArrhythmiaData = arrhythmiaResult.detected ? {
      timestamp: currentTime,
      rmssd: arrhythmiaResult.data?.rmssd || 0,
      rrVariation: arrhythmiaResult.data?.rrVariation || 0
    } : null;

    return {
      spo2,
      pressure,
      arrhythmiaStatus: arrhythmiaResult.status,
      lastArrhythmiaData
    };
  }

  /**
   * Reset all processors
   */
  public reset() {
    this.ppgValues = [];
    this.spO2Calculator.reset();
    this.bpCalculator.reset();
    this.arrhythmiaDetector.reset();
  }

  /**
   * Apply Simple Moving Average filter to the signal
   */
  private applySMAFilter(value: number): number {
    return applySMAFilter(this.ppgValues, value, this.SMA_WINDOW);
  }
}
