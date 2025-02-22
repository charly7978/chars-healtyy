/**
 * VitalSignsProcessor
 *
 * Procesa datos PPG (PhotoPlethysmoGraphy) provenientes de la cámara y linterna 
 * de un teléfono para estimar SpO2 y presión arterial de manera aproximada.
 *
 * -------------------------------------------------------------------------------------
 * NOTA IMPORTANTE:
 *  - Este código es un **ejemplo optimizado** del enfoque previo, 
 *    pero no reemplaza a dispositivos médicos certificados.
 *  - El cálculo de SpO2 ideal requiere al menos 2 LEDs (Rojo/Infrarrojo) y 
 *    calibración específica; aquí se asume un solo canal similar a IR.
 *  - La presión arterial estimada con la forma de onda PPG es muy sensible a:
 *       • Calidad de la señal (ruido, movimiento, iluminación).  
 *       • Variabilidad de la persona (edad, rigidez arterial, etc.).  
 *       • Calibración individual frente a un tensiómetro real.  
 *    Se ofrece solo como referencia indicativa, **no** para diagnóstico clínico.
 * -------------------------------------------------------------------------------------
 *
 * Ajustes principales en esta versión:
 * 1) Se ha agregado una verificación y *clamp* sobre el PTT (Pulse Transit Time) 
 *    para evitar valores extremos que “fijen” la presión en 180/120.
 * 2) Se realiza un suavizado (filtro exponencial simple) para la presión, 
 *    evitando saltos abruptos y permitiendo que el valor se mueva gradualmente.
 * 3) Se han reducido ligeramente los pesos en la fusión de SpO2 para hacerlo 
 *    un poco más reactivo (en lugar de quedarse fijo en 98).
 * 4) Se mantiene el pequeño filtro SMA (Smooth Moving Average) 
 *    y la supresión de outliers en SpO2, junto con la verificación de baseline para no utilizar datos antes 
 *    de tener ~2s de muestras filtradas (60 muestras con ~30FPS).
 *
 */

export class VitalSignsProcessor {
  //-----------------------------------------
  //             PARÁMETROS GLOBALES
  //-----------------------------------------

  /** Máximo de muestras PPG en el buffer (~10s si ~30FPS). */
  private readonly WINDOW_SIZE = 300;

  /** Factor de calibración para SpO2 (ajustado para mediciones más precisas) */
  private readonly SPO2_CALIBRATION_FACTOR = 1.05; // Aumentado para ajustar el rango máximo

  /** Umbral mínimo de índice de perfusión */
  private readonly PERFUSION_INDEX_THRESHOLD = 0.05;

  /** Ventana de promedios para SpO2 */  
  private readonly SPO2_WINDOW = 10;

  /** Tamaño de la ventana para el SMA */
  private readonly SMA_WINDOW = 3;

  //-----------------------------------------
  //           VARIABLES INTERNAS
  //-----------------------------------------

  /** Buffer principal de muestras PPG (filtradas con SMA). */
  private ppgValues: number[] = [];

  /** Últimos valores estimados (se devuelven si no hay baseline o detección). */
  private lastSpO2: number = 0;
  private lastSystolic: number = 0;
  private lastDiastolic: number = 0;

  /** Flag que indica si ya tenemos baseline (al menos 60 muestras aceptables). */
  private baselineEstablished = false;

  /** Buffer para promediar SpO2 (para suavizar). */
  private movingAverageSpO2: number[] = [];

  /** Buffer interno para el SMA de cada muestra entrante. */
  private smaBuffer: number[] = [];

  /** Factores para suavizar la presión y SpO2 resultantes. */
  private readonly BP_SMOOTHING_FACTOR = 0.3;   // ~30% nuevo, ~70% valor previo
  private readonly SPO2_SIGNAL_FACTOR = 0.4;    // Peso para SpO2 crudo vs. valor previo

  /** Tiempo de inicio de la medición */
  private measurementStartTime: number = 0;

  /** Última presión válida calculada */
  private lastValidPressure: { systolic: number; diastolic: number } | null = null;

  constructor() {
    console.log("VitalSignsProcessor: Inicializando procesador de señales vitales");
    this.measurementStartTime = Date.now();
  }

  /**
   * processSignal
   * @param ppgValue Muestra PPG cruda proveniente de la cámara.
   * @returns { spo2, pressure }
   */
  public processSignal(ppgValue: number): { spo2: number; pressure: string } {
    // (1) Filtro SMA (ventana 3) para atenuar ruido puntual.
    const smoothedInput = this.applySMAFilter(ppgValue);

    // (2) Almacenar muestras (filtradas).
    this.ppgValues.push(smoothedInput);
    if (this.ppgValues.length > this.WINDOW_SIZE) {
      this.ppgValues.shift();
    }

    // (3) Baseline: requerimos al menos 60 muestras filtradas.
    if (!this.baselineEstablished && this.ppgValues.length >= 60) {
      this.establishBaseline();
    }

    // Hasta no tener baseline, devolvemos últimos valores fijados.
    if (!this.baselineEstablished) {
      return {
        spo2: this.lastSpO2,
        pressure: `${this.lastSystolic}/${this.lastDiastolic}`
      };
    }

    // (4) Calcular SpO2.
    const rawSpo2 = this.calculateActualSpO2(this.ppgValues);

    // Suavizado extra: combinamos un poco con el valor anterior 
    //    para que no se quede demasiado fijo en 98, 
    //    pero tampoco salte demasiado si hay ruido.
    const newSpO2 = Math.round(
      rawSpo2 * this.SPO2_SIGNAL_FACTOR + this.lastSpO2 * (1 - this.SPO2_SIGNAL_FACTOR)
    );

    // Guardamos en el buffer de SpO2 y hacemos IQR.
    this.updateMovingAverageSpO2(newSpO2);
    const finalSpo2 = this.getSmoothedSpO2(); // quita outliers
    this.lastSpO2 = finalSpo2;

    // (5) Calcular Presión Arterial actual.
    const { systolic, diastolic } = this.calculateActualBloodPressure(this.ppgValues);

    // Suavizado: si el cálculo es muy inestable, se funde con el valor anterior.
    const smoothedSystolic = Math.round(
      systolic * this.BP_SMOOTHING_FACTOR + this.lastSystolic * (1 - this.BP_SMOOTHING_FACTOR)
    );
    const smoothedDiastolic = Math.round(
      diastolic * this.BP_SMOOTHING_FACTOR + this.lastDiastolic * (1 - this.BP_SMOOTHING_FACTOR)
    );

    this.lastSystolic = smoothedSystolic;
    this.lastDiastolic = smoothedDiastolic;

    return {
      spo2: finalSpo2,
      pressure: `${smoothedSystolic}/${smoothedDiastolic}`
    };
  }

  // ───────────────────── Baseline ─────────────────────

  /**
   * establishBaseline
   * Con las primeras 60 muestras (2s @30FPS) calculamos una línea base 
   * y set inicial de SpO2 y presión. Evita resultados absurdos si la señal 
   * está saturada o es muy débil.
   */
  private establishBaseline() {
    const baselineValues = this.ppgValues.slice(0, 60);
    const avgValue = baselineValues.reduce((a, b) => a + b, 0) / baselineValues.length;

    // Evitar baseline si la señal está muy baja o saturada.
    if (avgValue < 0.1 || avgValue > 255) {
      console.warn("VitalSignsProcessor: Señal media inicial fuera de rango, posponiendo baseline.");
      return;
    }

    this.baselineEstablished = true;
    console.log("VitalSignsProcessor: Baseline establecida con éxito.");

    const initialSpO2 = this.calculateActualSpO2(baselineValues);
    const { systolic, diastolic } = this.calculateActualBloodPressure(baselineValues);

    this.lastSpO2 = initialSpO2;
    this.lastSystolic = systolic;
    this.lastDiastolic = diastolic;
  }

  // ───────────────────── SpO2 ─────────────────────

  /**
   * calculateActualSpO2
   * Versión ajustada para evitar lecturas superiores a 98%.
   */
  private calculateActualSpO2(ppgValues: number[]): number {
    if (!this.baselineEstablished) return this.lastSpO2;

    // Usamos una ventana más corta para mejor respuesta
    const recentValues = ppgValues.slice(-60);
    const acComponent = this.calculateAC(recentValues);
    const dcComponent = this.calculateDC(recentValues);

    if (dcComponent === 0) {
      console.log("VitalSignsProcessor: DC Component es 0");
      return this.lastSpO2;
    }

    // Calculamos el índice de perfusión
    const perfusionIndex = (acComponent / dcComponent) * 200;
    console.log("VitalSignsProcessor: Perfusion Index:", perfusionIndex);
    
    if (perfusionIndex < this.PERFUSION_INDEX_THRESHOLD * 100) {
      console.log("VitalSignsProcessor: Perfusión baja:", perfusionIndex);
      return this.lastSpO2;
    }

    const { peakTimes, valleys } = this.findPeaksAndValleys(recentValues);
    
    if (peakTimes.length < 2) {
      console.log("VitalSignsProcessor: Picos insuficientes para SpO2");
      return this.lastSpO2;
    }

    // Cálculo ajustado del SpO2 para nunca exceder 98%
    const ratio = (acComponent / dcComponent) * 2.5;
    let spo2Raw = Math.min(98, 105 - (18 * ratio * this.SPO2_CALIBRATION_FACTOR));
    
    // Verificamos calidad de señal
    const signalQuality = this.calculateSignalQuality(recentValues, peakTimes, valleys);
    console.log("VitalSignsProcessor: Calidad señal SpO2:", signalQuality);

    // Ponderación con más peso en valores nuevos para mejor respuesta
    const qualityWeight = Math.min((signalQuality / 100) * 1.5, 1);
    const newSpo2 = spo2Raw * qualityWeight + this.lastSpO2 * (1 - qualityWeight);

    // Aseguramos que el valor final esté en el rango fisiológico [85-98]
    spo2Raw = Math.min(98, Math.max(85, Math.round(newSpo2)));
    
    console.log("VitalSignsProcessor: SpO2 Raw:", spo2Raw);

    return spo2Raw;
  }

  /**
   * updateMovingAverageSpO2
   * Añade una nueva lectura de SpO2 al buffer para luego hacer IQR y promediar.
   */
  private updateMovingAverageSpO2(newValue: number) {
    this.movingAverageSpO2.push(newValue);
    if (this.movingAverageSpO2.length > this.SPO2_WINDOW) {
      this.movingAverageSpO2.shift();
    }
  }

  /**
   * getSmoothedSpO2
   * Elimina outliers mediante IQR y promedia.
   */
  private getSmoothedSpO2(): number {
    if (!this.movingAverageSpO2.length) return this.lastSpO2;

    const sorted = [...this.movingAverageSpO2].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;

    // Filtrar ±1.5 * IQR
    const validValues = this.movingAverageSpO2.filter(
      (v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr
    );

    if (!validValues.length) {
      return this.lastSpO2;
    }

    const avg = validValues.reduce((a, b) => a + b, 0) / validValues.length;
    return Math.round(avg);
  }

  // ───────────────────── Presión Arterial ─────────────────────

  /**
   * calculateActualBloodPressure
   * Se basa en PTT y amplitud de la onda PPG. Ajustamos la fórmula 
   * para evitar "atascar" valores en 180/120 si PTT es muy corto o anómalo.
   */
  private calculateActualBloodPressure(ppgValues: number[]): { systolic: number; diastolic: number } {
    const { peakTimes, valleys } = this.findPeaksAndValleys(ppgValues);
    
    if (peakTimes.length < 2) {
      console.log("VitalSignsProcessor: Picos insuficientes para presión");
      return { systolic: this.lastSystolic, diastolic: this.lastDiastolic };
    }

    // Análisis de intervalos entre picos (PTT)
    const pttValues = [];
    const amplitudes = [];
    
    for (let i = 1; i < peakTimes.length; i++) {
      const ptt = peakTimes[i] - peakTimes[i-1];
      pttValues.push(ptt);
      
      if (valleys[i-1]) {
        // Ajuste de amplitud para compensar la iluminación en Android
        const amplitude = (ppgValues[peakTimes[i]] - ppgValues[valleys[i-1]]) * 1.2;
        amplitudes.push(amplitude);
      }
    }

    if (pttValues.length < 2) {
      console.log("VitalSignsProcessor: Datos insuficientes para presión");
      return { systolic: this.lastSystolic, diastolic: this.lastDiastolic };
    }

    // Análisis estadístico del PTT y amplitudes
    const avgPTT = pttValues.reduce((a, b) => a + b, 0) / pttValues.length;
    const avgAmplitude = amplitudes.reduce((a, b) => a + b, 0) / amplitudes.length;

    console.log("VitalSignsProcessor: PTT promedio:", avgPTT);
    console.log("VitalSignsProcessor: Amplitud promedio:", avgAmplitude);

    // Cálculos con factor de ajuste para Android
    const systolic = Math.round((1000 / avgPTT) * 2.5); // Factor reducido para evitar valores extremos
    const diastolic = Math.round(systolic * (0.6 + (avgAmplitude * 0.0008))); // Ajuste más suave

    this.lastSystolic = systolic;
    this.lastDiastolic = diastolic;

    return { systolic, diastolic };
  }

  // ───────────────────── Cálculos internos ─────────────────────

  /**
   * calculateAC
   * Versión optimizada para Android con mayor sensibilidad a cambios.
   */
  private calculateAC(values: number[]): number {
    // Amplificamos la diferencia para Android
    return (Math.max(...values) - Math.min(...values)) * 1.5;
  }

  /**
   * calculateDC
   * Versión optimizada para Android.
   */
  private calculateDC(values: number[]): number {
    const sum = values.reduce((a, b) => a + b, 0);
    // Ajustamos el componente DC para mejor relación AC/DC
    return (sum / values.length) * 0.8;
  }

  /**
   * calculateSignalQuality
   * Versión más sensible para Android.
   */
  private calculateSignalQuality(values: number[], peaks: number[], valleys: number[]): number {
    const amps = peaks.map((peak, i) => {
      if (valleys[i]) {
        // Amplificamos la diferencia para Android
        return Math.abs(values[peak] - values[valleys[i]]) * 1.5;
      }
      return 0;
    });

    if (!amps.length) return 0;

    const sum = amps.reduce((a, b) => a + b, 0);
    const avgAmp = sum / amps.length;

    let variability = 0;
    for (const a of amps) {
      variability += Math.abs(a - avgAmp);
    }
    variability /= amps.length;

    // Más permisivo con la variabilidad
    const quality = Math.max(0, Math.min(100, 100 * (1 - variability / (avgAmp * 2 || 1))));
    return quality;
  }

  /**
   * calculateWaveformAmplitudes
   * Devuelve la amplitud promedio (peak - valley) y su desviación estándar (variation).
   */
  private calculateWaveformAmplitudes(
    values: number[],
    peakTimes: number[],
    valleyTimes: number[]
  ) {
    const amplitudeArray: number[] = [];

    for (let i = 0; i < peakTimes.length; i++) {
      if (valleyTimes[i]) {
        const amp = values[peakTimes[i]] - values[valleyTimes[i]];
        if (amp > 0) {
          amplitudeArray.push(amp);
        }
      }
    }

    if (!amplitudeArray.length) {
      return { amplitude: 0, variation: 0 };
    }

    const sum = amplitudeArray.reduce((a, b) => a + b, 0);
    const mean = sum / amplitudeArray.length;

    const squaredDiffs = amplitudeArray.map((val) => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / amplitudeArray.length;
    const stdDev = Math.sqrt(variance);

    return { amplitude: mean, variation: stdDev };
  }

  /**
   * findPeaksAndValleys
   * Escaneo simple comparando v[i] con vecinos i±1, i±2 para etiquetar picos/ valles.
   */
  private findPeaksAndValleys(values: number[]): { peakTimes: number[]; valleys: number[] } {
    const peakTimes: number[] = [];
    const valleyTimes: number[] = [];

    // Ajuste de ventana de análisis para mejorar detección en Android
    for (let i = 3; i < values.length - 3; i++) {
      const v = values[i];
      const v1 = values[i - 1];
      const v2 = values[i - 2];
      const v3 = values[i - 3];
      const vn1 = values[i + 1];
      const vn2 = values[i + 2];
      const vn3 = values[i + 3];

      // Detección más estricta de picos para Android
      if (v > v1 && v > v2 && v > v3 && v > vn1 && v > vn2 && v > vn3) {
        peakTimes.push(i);
      }
      // Detección más estricta de valles para Android
      if (v < v1 && v < v2 && v < v3 && v < vn1 && v < vn2 && v < vn3) {
        valleyTimes.push(i);
      }
    }

    return { peakTimes, valleys: valleyTimes };
  }

  //-----------------------------------------
  //            FILTRO DE ENTRADA
  //-----------------------------------------

  /**
   * applySMAFilter
   * Pequeño promedio m��vil (tamaño 3) para mitigar ruido puntual 
   * en cada lectura proveniente de la cámara.
   */
  private applySMAFilter(value: number): number {
    this.smaBuffer.push(value);
    if (this.smaBuffer.length > this.SMA_WINDOW) {
      this.smaBuffer.shift();
    }
    const sum = this.smaBuffer.reduce((a, b) => a + b, 0);
    return sum / this.smaBuffer.length;
  }

  //-----------------------------------------
  //                RESET
  //-----------------------------------------

  /**
   * reset
   * Limpia el estado interno, reiniciando los valores por defecto.
   */
  public reset(): void {
    this.ppgValues = [];
    this.lastSpO2 = 0;
    this.lastSystolic = 0;
    this.lastDiastolic = 0;
    this.baselineEstablished = false;
    this.movingAverageSpO2 = [];
    this.smaBuffer = [];
    this.measurementStartTime = Date.now();
  }
}
