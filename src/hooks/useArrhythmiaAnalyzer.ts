import { useState, useRef, useCallback } from 'react';
import { ArrhythmiaDetector } from '../modules/ArrhythmiaDetector';

/**
 * Hook que proporciona funcionalidad para analizar arritmias cardíacas
 * en datos de fotopletismografía (PPG).
 * 
 * Integra el detector avanzado de arritmias y maneja su ciclo de vida.
 */
export const useArrhythmiaAnalyzer = () => {
  // Estado público para comunicar el conteo de arritmias a la UI
  const [arrhythmiaCounter, setArrhythmiaCounter] = useState(0);
  
  // Referencia al detector principal para mantenerlo entre renders
  const detectorRef = useRef<ArrhythmiaDetector | null>(null);
  
  // Referencias para métricas y datos
  const lastDataRef = useRef<{
    timestamp: number;
    rmssd: number;
    rrVariation: number;
    arrhythmiaStatus: string;
  }>({
    timestamp: 0,
    rmssd: 0,
    rrVariation: 0,
    arrhythmiaStatus: 'SIN ARRITMIAS|0'
  });
  
  // Flag para evitar detecciones en los primeros segundos
  const isInitializedRef = useRef<boolean>(false);
  
  // Constantes para el análisis
  const MAX_ARRHYTHMIAS_PER_MINUTE = 30; // Límite razonable
  
  /**
   * Inicializa el detector si no existe
   */
  const getDetector = useCallback(() => {
    if (!detectorRef.current) {
      console.log("useArrhythmiaAnalyzer: Creando nueva instancia del detector");
      detectorRef.current = new ArrhythmiaDetector();
      isInitializedRef.current = false;
      
      // Marcar como inicializado después de un tiempo para evitar falsas detecciones iniciales
      setTimeout(() => {
        isInitializedRef.current = true;
      }, 2000);
    }
    return detectorRef.current;
  }, []);
  
  /**
   * Resetea el estado del detector y las métricas
   */
  const reset = useCallback(() => {
    if (detectorRef.current) {
      detectorRef.current.reset();
    }
    
    setArrhythmiaCounter(0);
    isInitializedRef.current = false;
    
    lastDataRef.current = {
      timestamp: 0,
      rmssd: 0, 
      rrVariation: 0,
      arrhythmiaStatus: 'SIN ARRITMIAS|0'
    };
    
    console.log("useArrhythmiaAnalyzer: Detector y métricas reseteados");
    
    // Re-marcar como inicializado después de un breve retraso
    setTimeout(() => {
      isInitializedRef.current = true;
    }, 2000);
  }, []);
  
  /**
   * Procesa los datos de intervalos RR para detectar arritmias
   * @param rrData - Datos de intervalos RR, tiempos de picos y amplitudes
   * @param maxArrhythmiasCount - Límite máximo de arritmias a detectar
   */
  const processArrhythmia = useCallback((
    rrData: { 
      intervals: number[]; 
      lastPeakTime: number | null; 
      amplitudes?: number[] 
    },
    maxArrhythmiasCount: number = MAX_ARRHYTHMIAS_PER_MINUTE
  ) => {
    const detector = getDetector();
    const currentTime = Date.now();
    
    // Actualizar los intervalos en el detector
    if (rrData.intervals && rrData.intervals.length > 0) {
      // Extraer la amplitud del último pico si está disponible
      const peakAmplitude = rrData.amplitudes && rrData.amplitudes.length > 0 ?
        rrData.amplitudes[rrData.amplitudes.length - 1] : undefined;
        
      detector.updateIntervals(rrData.intervals, rrData.lastPeakTime, peakAmplitude);
      
      // No analizar si estamos en fase de aprendizaje
      if (detector.isInLearningPhase()) {
        lastDataRef.current = {
          timestamp: currentTime,
          rmssd: 0,
          rrVariation: 0,
          arrhythmiaStatus: 'CALIBRANDO|0'
        };
        
        return {
          detected: false,
          arrhythmiaStatus: 'CALIBRANDO|0',
          lastArrhythmiaData: null
        };
      }
      
      // Ejecutar la detección si ya estamos inicializados
      if (isInitializedRef.current) {
        const result = detector.detect();
        
        // Si detectamos una arritmia y estamos por debajo del límite
        if (result.detected && result.count <= maxArrhythmiasCount) {
          setArrhythmiaCounter(result.count);
          
          // Guardar datos para análisis y UI
          if (result.data) {
            lastDataRef.current = {
              timestamp: currentTime,
              rmssd: result.data.rmssd,
              rrVariation: result.data.rrVariation,
              arrhythmiaStatus: result.status
            };
            
            return {
              detected: true,
              arrhythmiaStatus: result.status,
              lastArrhythmiaData: {
                timestamp: currentTime,
                rmssd: result.data.rmssd,
                rrVariation: result.data.rrVariation
              }
            };
          }
        }
        
        // Actualizar solo el estado si no hubo detección activa
        lastDataRef.current = {
          timestamp: currentTime,
          rmssd: result.data?.rmssd || 0,
          rrVariation: result.data?.rrVariation || 0,
          arrhythmiaStatus: result.status
        };
        
        return {
          detected: false,
          arrhythmiaStatus: result.status,
          lastArrhythmiaData: null
        };
      }
    }
    
    // Si no tenemos suficientes datos o no estamos inicializados
    return {
      detected: false,
      arrhythmiaStatus: lastDataRef.current.arrhythmiaStatus,
      lastArrhythmiaData: null
    };
  }, [getDetector]);
  
  /**
   * Limpieza agresiva de memoria
   */
  const cleanMemory = useCallback(() => {
    if (detectorRef.current) {
      detectorRef.current.cleanMemory();
      detectorRef.current = null;
    }
    
    console.log("useArrhythmiaAnalyzer: Memoria liberada");
  }, []);
  
  return {
    processArrhythmia,
    reset,
    cleanMemory,
    arrhythmiaCounter,
    getLastData: () => lastDataRef.current
  };
};
