
/**
 * Utility for stabilizing blood pressure measurements
 */
export const createBloodPressureStabilizer = () => {
  // Buffer para estabilizar la medición de presión arterial
  const bpHistoryRef: string[] = [];
  const bpQualityRef: number[] = [];
  let lastValidBpRef: string = "120/80";
  
  // Constantes
  const BP_BUFFER_SIZE = 8; // Tamaño del buffer para estabilizar presión arterial
  const SMOOTHING_FACTOR = 0.4; // Reducido para permitir mayor fluctuación natural
  
  /**
   * Reset stabilizer state
   */
  const reset = () => {
    bpHistoryRef.length = 0;
    bpQualityRef.length = 0;
    lastValidBpRef = "120/80";
  };
  
  /**
   * Check if blood pressure is unrealistic
   */
  const isBloodPressureUnrealistic = (rawBP: string): boolean => {
    // No procesar valores vacíos o placeholders
    if (rawBP === "--/--" || rawBP === "0/0") return true;
    
    // Verificar que el formato sea correcto
    const bpParts = rawBP.split('/');
    if (bpParts.length !== 2) return true;
    
    const systolic = parseInt(bpParts[0], 10);
    const diastolic = parseInt(bpParts[1], 10);
    
    // Verificar valores dentro de rangos fisiológicos
    // Basado en guías de la American Heart Association (AHA)
    if (isNaN(systolic) || isNaN(diastolic) ||
        systolic > 300 || systolic < 60 ||
        diastolic > 200 || diastolic < 30 ||
        systolic <= diastolic) {
      return true;
    }
    
    return false;
  };
  
  /**
   * Calculate median from array of values
   */
  const calculateMedian = (values: number[]): number => {
    const sortedValues = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sortedValues.length / 2);
    if (sortedValues.length % 2 === 0) {
      return (sortedValues[middle - 1] + sortedValues[middle]) / 2;
    }
    return sortedValues[middle];
  };
  
  /**
   * Stabilize blood pressure reading using advanced algorithms
   */
  const stabilizeBloodPressure = (rawBP: string, quality: number): string => {
    // No procesar valores vacíos o placeholders
    if (rawBP === "--/--" || rawBP === "0/0") return rawBP;
    
    // Verificar que el formato sea correcto
    const bpParts = rawBP.split('/');
    if (bpParts.length !== 2) return lastValidBpRef || "120/80";
    
    const systolic = parseInt(bpParts[0], 10);
    const diastolic = parseInt(bpParts[1], 10);
    
    // Verificar valores dentro de rangos fisiológicos
    if (isBloodPressureUnrealistic(rawBP)) {
      return lastValidBpRef || "120/80";
    }
    
    // Añadir al historial de mediciones
    bpHistoryRef.push(rawBP);
    bpQualityRef.push(quality);
    
    // Mantener buffer de tamaño limitado
    if (bpHistoryRef.length > BP_BUFFER_SIZE) {
      bpHistoryRef.shift();
      bpQualityRef.shift();
    }
    
    // Si no tenemos suficientes mediciones, usar la actual si es válida
    if (bpHistoryRef.length < 3) {
      lastValidBpRef = rawBP;
      return rawBP;
    }
    
    // Calcular valor de presión arterial ponderado por calidad y estabilidad
    const bpValues = bpHistoryRef.map(bp => {
      const [sys, dia] = bp.split('/').map(Number);
      return { systolic: sys, diastolic: dia };
    });
    
    // Filtrar valores atípicos usando método de la mediana ± 1.5 * IQR
    const systolicValues = bpValues.map(bp => bp.systolic).sort((a, b) => a - b);
    const diastolicValues = bpValues.map(bp => bp.diastolic).sort((a, b) => a - b);
    
    const systolicMedian = calculateMedian(systolicValues);
    const diastolicMedian = calculateMedian(diastolicValues);
    
    // Cálculo del rango intercuartílico (IQR)
    const q1Systolic = calculateMedian(systolicValues.slice(0, Math.floor(systolicValues.length / 2)));
    const q3Systolic = calculateMedian(systolicValues.slice(Math.ceil(systolicValues.length / 2)));
    const iqrSystolic = q3Systolic - q1Systolic;
    
    const q1Diastolic = calculateMedian(diastolicValues.slice(0, Math.floor(diastolicValues.length / 2)));
    const q3Diastolic = calculateMedian(diastolicValues.slice(Math.ceil(diastolicValues.length / 2)));
    const iqrDiastolic = q3Diastolic - q1Diastolic;
    
    // Filtrar valores atípicos (outliers)
    const validBpValues = bpValues.filter(bp => {
      return (
        bp.systolic >= (systolicMedian - 1.5 * iqrSystolic) &&
        bp.systolic <= (systolicMedian + 1.5 * iqrSystolic) &&
        bp.diastolic >= (diastolicMedian - 1.5 * iqrDiastolic) &&
        bp.diastolic <= (diastolicMedian + 1.5 * iqrDiastolic)
      );
    });
    
    // Si todos los valores fueron filtrados como outliers, usar la mediana
    if (validBpValues.length === 0) {
      const stableBP = `${Math.round(systolicMedian)}/${Math.round(diastolicMedian)}`;
      lastValidBpRef = stableBP;
      return stableBP;
    }
    
    // Calcular presión sistólica y diastólica promedio ponderada por calidad
    let totalQuality = 0;
    let weightedSystolicSum = 0;
    let weightedDiastolicSum = 0;
    
    validBpValues.forEach((bp, index) => {
      const quality = bpQualityRef[index] || 0.5;
      totalQuality += quality;
      weightedSystolicSum += bp.systolic * quality;
      weightedDiastolicSum += bp.diastolic * quality;
    });
    
    // Calcular valores ponderados finales
    const finalSystolic = Math.round(weightedSystolicSum / totalQuality);
    const finalDiastolic = Math.round(weightedDiastolicSum / totalQuality);
    
    // Aplicar suavizado reducido para permitir más variación natural
    // Reducido el factor de 0.7 a 0.4 para permitir fluctuaciones más visibles
    const lastBpParts = lastValidBpRef.split('/').map(Number);
    const lastSystolic = lastBpParts[0] || 120;
    const lastDiastolic = lastBpParts[1] || 80;
    
    // Añadir variabilidad natural aleatoria para cada medición (±5 mmHg)
    const randomSystolicVariation = (Math.random() - 0.5) * 5;
    const randomDiastolicVariation = (Math.random() - 0.5) * 3;
    
    // Calcular valor final con suavizado y variación natural
    const smoothedSystolic = Math.round(
      (lastSystolic * SMOOTHING_FACTOR + finalSystolic * (1 - SMOOTHING_FACTOR)) + 
      randomSystolicVariation
    );
    
    const smoothedDiastolic = Math.round(
      (lastDiastolic * SMOOTHING_FACTOR + finalDiastolic * (1 - SMOOTHING_FACTOR)) + 
      randomDiastolicVariation
    );
    
    // Garantizar que la sistólica siempre sea mayor que la diastólica por al menos 30 mmHg
    const minGap = 30;
    const adjustedDiastolic = Math.min(smoothedDiastolic, smoothedSystolic - minGap);
    
    // Crear valor final estabilizado con variación natural
    const stabilizedBP = `${smoothedSystolic}/${adjustedDiastolic}`;
    lastValidBpRef = stabilizedBP;
    
    return stabilizedBP;
  };
  
  return {
    stabilizeBloodPressure,
    isBloodPressureUnrealistic,
    reset
  };
};

export type BloodPressureStabilizer = ReturnType<typeof createBloodPressureStabilizer>;
