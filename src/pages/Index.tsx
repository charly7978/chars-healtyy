
import React, { useState, useRef, useEffect } from "react";
import VitalSign from "@/components/VitalSign";
import CameraView from "@/components/CameraView";
import { useSignalProcessor } from "@/hooks/useSignalProcessor";
import { useHeartBeatProcessor } from "@/hooks/useHeartBeatProcessor";
import { useVitalSignsProcessor } from "@/hooks/useVitalSignsProcessor";
import PPGSignalMeter from "@/components/PPGSignalMeter";
import { VitalSignsRisk } from '@/utils/vitalSignsRisk';

interface VitalSigns {
  spo2: number;
  pressure: string;
  arrhythmiaStatus: string;
}

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [signalQuality, setSignalQuality] = useState(0);
  const [vitalSigns, setVitalSigns] = useState<VitalSigns>({ 
    spo2: 0, 
    pressure: "--/--",
    arrhythmiaStatus: "--" 
  });
  const [heartRate, setHeartRate] = useState(0);
  const [arrhythmiaCount, setArrhythmiaCount] = useState<string | number>("--");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [lastArrhythmiaData, setLastArrhythmiaData] = useState<{
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  } | null>(null);
  const [measurementComplete, setMeasurementComplete] = useState(false);
  const [finalValues, setFinalValues] = useState<{
    heartRate: number,
    spo2: number,
    pressure: string
  } | null>(null);
  const measurementTimerRef = useRef<number | null>(null);
  
  // Flag para trackear si ya tenemos valores válidos que queremos preservar
  const hasValidValuesRef = useRef(false);
  
  const { startProcessing, stopProcessing, lastSignal, processFrame } = useSignalProcessor();
  const { processSignal: processHeartBeat, reset: resetHeartBeat } = useHeartBeatProcessor();
  const { processSignal: processVitalSigns, reset: resetVitalSigns } = useVitalSignsProcessor();

  // Función mejorada para calcular valores finales con protección contra errores
  const calculateFinalValues = () => {
    try {
      if (heartRate <= 0 && vitalSigns.spo2 <= 0) {
        console.log("No hay valores válidos para calcular promedios");
        return;
      }
      
      console.log("Calculando valores finales promedios...");
      
      // Calcular promedios basados en el historial reciente
      let avgBPM = 0;
      let avgSPO2 = 0;
      let avgBP = { systolic: 0, diastolic: 0 };
      
      try {
        avgBPM = VitalSignsRisk.getAverageBPM();
      } catch (err) {
        console.error("Error al calcular avgBPM:", err);
        avgBPM = 0;
      }
      
      try {
        avgSPO2 = VitalSignsRisk.getAverageSPO2();
      } catch (err) {
        console.error("Error al calcular avgSPO2:", err);
        avgSPO2 = 0;
      }
      
      try {
        avgBP = VitalSignsRisk.getAverageBP();
      } catch (err) {
        console.error("Error al calcular avgBP:", err);
        avgBP = { systolic: 0, diastolic: 0 };
      }

      const finalBPString = avgBP.systolic > 0 && avgBP.diastolic > 0 
        ? `${avgBP.systolic}/${avgBP.diastolic}` 
        : vitalSigns.pressure;

      // Solo actualizar valores finales si tenemos al menos algún valor válido
      const finalHeartRate = avgBPM > 0 ? avgBPM : heartRate;
      const finalSpo2 = avgSPO2 > 0 ? avgSPO2 : vitalSigns.spo2;
        
      setFinalValues({
        heartRate: finalHeartRate,
        spo2: finalSpo2,
        pressure: finalBPString
      });

      console.log("Valores finales calculados:", {
        heartRate: finalHeartRate,
        spo2: finalSpo2,
        pressure: finalBPString
      });
        
      // Marcar que ya tenemos valores válidos
      hasValidValuesRef.current = true;
    } catch (error) {
      console.error("Error en calculateFinalValues:", error);
      // Usar valores actuales como respaldo en caso de error
      setFinalValues({
        heartRate: heartRate,
        spo2: vitalSigns.spo2,
        pressure: vitalSigns.pressure
      });
      hasValidValuesRef.current = true;
    }
  };

  const startMonitoring = () => {
    if (isMonitoring) {
      // Si ya está monitorizando, detenemos la monitorización sin resetear valores
      stopMonitoringOnly();
    } else {
      // Iniciar procesadores de señal PERO PRESERVAR valores en pantalla
      prepareProcessorsOnly();
      
      // Activar la monitorización
      setIsMonitoring(true);
      setIsCameraOn(true);
      startProcessing();
      setElapsedTime(0);
      setMeasurementComplete(false);
      
      if (measurementTimerRef.current) {
        clearInterval(measurementTimerRef.current);
        measurementTimerRef.current = null;
      }
      
      measurementTimerRef.current = window.setInterval(() => {
        setElapsedTime(prev => {
          if (prev >= 40) {
            stopMonitoringOnly();
            return 40;
          }
          return prev + 1;
        });
      }, 1000);
    }
  };

  // Prepara SOLO los procesadores sin tocar ningún valor de display
  const prepareProcessorsOnly = () => {
    console.log("Preparando SOLO procesadores (displays intactos)");
    
    // Reiniciar el temporizador
    setElapsedTime(0);
    
    // SOLO resetear procesadores internos, nada de displays
    resetHeartBeat();
    resetVitalSigns();
    VitalSignsRisk.resetHistory();
  };

  // Detiene monitorización sin modificar ningún display
  const stopMonitoringOnly = () => {
    try {
      console.log("Deteniendo SOLO monitorización (displays intactos)");
      
      // Detener SOLO la monitorización
      setIsMonitoring(false);
      setIsCameraOn(false);
      stopProcessing();
      setMeasurementComplete(true);
      
      // Evaluar riesgos SOLO si hay valores válidos
      try {
        if (heartRate > 0) {
          VitalSignsRisk.getBPMRisk(heartRate, true);
        }
      } catch (err) {
        console.error("Error al evaluar riesgo BPM:", err);
      }
      
      try {
        if (vitalSigns.pressure !== "--/--" && vitalSigns.pressure !== "0/0") {
          VitalSignsRisk.getBPRisk(vitalSigns.pressure, true);
        }
      } catch (err) {
        console.error("Error al evaluar riesgo BP:", err);
      }
      
      try {
        if (vitalSigns.spo2 > 0) {
          VitalSignsRisk.getSPO2Risk(vitalSigns.spo2, true);
        }
      } catch (err) {
        console.error("Error al evaluar riesgo SPO2:", err);
      }
      
      // Calcular valores finales después de evaluar riesgos
      calculateFinalValues();
      
      // Limpiar solo el timer
      if (measurementTimerRef.current) {
        clearInterval(measurementTimerRef.current);
        measurementTimerRef.current = null;
      }
    } catch (error) {
      console.error("Error en stopMonitoringOnly:", error);
      // Asegurar que se limpie el timer incluso en caso de error
      if (measurementTimerRef.current) {
        clearInterval(measurementTimerRef.current);
        measurementTimerRef.current = null;
      }
      setIsMonitoring(false);
      setIsCameraOn(false);
    }
  };

  // SOLO el botón de RESET puede borrar los displays
  const handleReset = () => {
    console.log("RESET COMPLETO solicitado");
    
    // Confirmar antes de resetear si ya tenemos valores válidos
    if (hasValidValuesRef.current) {
      if (!window.confirm("¿Seguro quieres borrar TODOS los valores en pantalla?")) {
        console.log("Reset cancelado por usuario");
        return;
      }
    }
    
    // Detener monitorización
    setIsMonitoring(false);
    setIsCameraOn(false);
    stopProcessing();
    
    if (measurementTimerRef.current) {
      clearInterval(measurementTimerRef.current);
      measurementTimerRef.current = null;
    }
    
    // Resetear SOLO en caso de RESET explícito
    setHeartRate(0);
    setVitalSigns({ 
      spo2: 0, 
      pressure: "--/--",
      arrhythmiaStatus: "--" 
    });
    setArrhythmiaCount("--");
    setLastArrhythmiaData(null);
    setElapsedTime(0);
    setMeasurementComplete(false);
    setFinalValues(null);
    
    // Resetear procesadores
    resetHeartBeat();
    resetVitalSigns();
    VitalSignsRisk.resetHistory();
    
    // Marcar que ya no tenemos valores válidos
    hasValidValuesRef.current = false;
  };

  const handleStreamReady = (stream: MediaStream) => {
    if (!isMonitoring) return;
    
    const videoTrack = stream.getVideoTracks()[0];
    const imageCapture = new ImageCapture(videoTrack);
    
    if (videoTrack.getCapabilities()?.torch) {
      videoTrack.applyConstraints({
        advanced: [{ torch: true }]
      }).catch(err => console.error("Error activando linterna:", err));
    }
    
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) {
      console.error("No se pudo obtener el contexto 2D");
      return;
    }
    
    const processImage = async () => {
      if (!isMonitoring) return;
      
      try {
        const frame = await imageCapture.grabFrame();
        tempCanvas.width = frame.width;
        tempCanvas.height = frame.height;
        tempCtx.drawImage(frame, 0, 0);
        const imageData = tempCtx.getImageData(0, 0, frame.width, frame.height);
        processFrame(imageData);
        
        if (isMonitoring) {
          requestAnimationFrame(processImage);
        }
      } catch (error) {
        console.error("Error capturando frame:", error);
        if (isMonitoring) {
          requestAnimationFrame(processImage);
        }
      }
    };

    processImage();
  };

  useEffect(() => {
    const enterImmersiveMode = async () => {
      try {
        const viewport = document.querySelector('meta[name=viewport]');
        if (viewport) {
          viewport.setAttribute('content', 
            'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
          );
        }

        if (screen.orientation?.lock) {
          try {
            await screen.orientation.lock('portrait');
          } catch (e) {
            console.warn('Orientation lock failed:', e);
          }
        }

        const elem = document.documentElement;
        const methods = [
          elem.requestFullscreen?.bind(elem),
          elem.webkitRequestFullscreen?.bind(elem),
          elem.mozRequestFullScreen?.bind(elem),
          elem.msRequestFullscreen?.bind(elem)
        ];

        for (const method of methods) {
          if (method) {
            try {
              await method();
              break;
            } catch (e) {
              console.warn('Fullscreen attempt failed:', e);
              continue;
            }
          }
        }

        if (navigator.userAgent.includes("Android")) {
          if ((window as any).AndroidFullScreen?.immersiveMode) {
            try {
              await (window as any).AndroidFullScreen.immersiveMode();
            } catch (e) {
              console.warn('Android immersive mode failed:', e);
            }
          }
        }
      } catch (error) {
        console.error('Immersive mode error:', error);
      }
    };

    enterImmersiveMode();
    
    setTimeout(enterImmersiveMode, 500);
    setTimeout(enterImmersiveMode, 1500);

    const handleInteraction = () => {
      enterImmersiveMode();
    };

    document.addEventListener('touchstart', handleInteraction);
    document.addEventListener('click', handleInteraction);
    document.addEventListener('touchend', handleInteraction);

    return () => {
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('touchend', handleInteraction);
    };
  }, []);

  useEffect(() => {
    if (lastSignal && lastSignal.fingerDetected && isMonitoring) {
      try {
        const heartBeatResult = processHeartBeat(lastSignal.filteredValue);
        
        if (!measurementComplete) {
          // Solo actualizar heartRate si está monitorizando y si el valor es mayor que 0
          if (heartBeatResult.bpm > 0) {
            setHeartRate(heartBeatResult.bpm);
          }
          
          const vitals = processVitalSigns(lastSignal.filteredValue, heartBeatResult.rrData);
          if (vitals) {
            // Solo actualizar spo2 si hay un valor > 0
            if (vitals.spo2 > 0) {
              setVitalSigns(current => ({
                ...current,
                spo2: vitals.spo2
              }));
            }
            
            // Solo actualizar presión si no es "--/--" ni "0/0"
            if (vitals.pressure !== "--/--" && vitals.pressure !== "0/0") {
              setVitalSigns(current => ({
                ...current,
                pressure: vitals.pressure
              }));
            }
            
            // Siempre actualizar el estado de arritmia
            setVitalSigns(current => ({
              ...current,
              arrhythmiaStatus: vitals.arrhythmiaStatus
            }));
            
            if (vitals.lastArrhythmiaData) {
              setLastArrhythmiaData(vitals.lastArrhythmiaData);
              
              const [status, count] = vitals.arrhythmiaStatus.split('|');
              setArrhythmiaCount(count || "0");
            }
          }
        }
        
        setSignalQuality(lastSignal.quality);
      } catch (error) {
        console.error("Error procesando señal:", error);
      }
    }
  }, [lastSignal, isMonitoring, processHeartBeat, processVitalSigns, measurementComplete]);

  // Limpieza de temporizadores al desmontar el componente
  useEffect(() => {
    return () => {
      if (measurementTimerRef.current) {
        clearInterval(measurementTimerRef.current);
        measurementTimerRef.current = null;
      }
    };
  }, []);

  return (
    <div 
      className="fixed inset-0 flex flex-col bg-black" 
      style={{ 
        height: '100dvh',
        minHeight: '100vh',
        touchAction: 'none',
        overscrollBehavior: 'none',
        WebkitOverflowScrolling: 'touch',
        overflow: 'hidden'
      }}
    >
      {/* Cámara de fondo - visible en toda la pantalla */}
      <div className="absolute inset-0 z-0">
        <CameraView 
          onStreamReady={handleStreamReady}
          isMonitoring={isCameraOn}
          isFingerDetected={isMonitoring ? lastSignal?.fingerDetected : false}
          signalQuality={isMonitoring ? signalQuality : 0}
        />
      </div>

      <div 
        className="relative z-10 flex flex-col h-full"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)'
        }}
      >
        <div className="h-[50dvh]">
          <PPGSignalMeter 
            value={isMonitoring ? lastSignal?.filteredValue || 0 : 0}
            quality={isMonitoring ? lastSignal?.quality || 0 : 0}
            isFingerDetected={isMonitoring ? lastSignal?.fingerDetected || false : false}
            onStartMeasurement={startMonitoring}
            onReset={handleReset}
            arrhythmiaStatus={vitalSigns.arrhythmiaStatus}
            rawArrhythmiaData={lastArrhythmiaData}
          />
        </div>

        <div className="flex-1 mt-4" />

        {/* Displays */}
        <div className="w-full px-4 mb-24">
          <div className="bg-black rounded-xl p-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <VitalSign 
                label="FRECUENCIA CARDÍACA"
                value={finalValues ? finalValues.heartRate : heartRate || "--"}
                unit="BPM"
                isFinalReading={measurementComplete}
              />
              <VitalSign 
                label="SPO2"
                value={finalValues ? finalValues.spo2 : vitalSigns.spo2 || "--"}
                unit="%"
                isFinalReading={measurementComplete}
              />
              <VitalSign 
                label="PRESIÓN ARTERIAL"
                value={finalValues ? finalValues.pressure : vitalSigns.pressure}
                unit="mmHg"
                isFinalReading={measurementComplete}
              />
              <VitalSign 
                label="ARRITMIAS"
                value={vitalSigns.arrhythmiaStatus}
                isFinalReading={measurementComplete}
              />
            </div>
          </div>
        </div>

        {isMonitoring && (
          <div className="fixed bottom-20 left-0 right-0 text-center z-20">
            <span className="text-xl font-medium text-gray-300">{elapsedTime}s / 40s</span>
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 w-full h-[80px] grid grid-cols-2 gap-px">
          <button 
            onClick={startMonitoring}
            className={`w-full h-full text-2xl font-bold text-white transition-colors duration-200 ${
              isMonitoring
                ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 active:from-red-700 active:to-red-800'
                : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 active:from-blue-700 active:to-blue-800'
            }`}
          >
            {isMonitoring ? 'DETENER' : 'INICIAR'}
          </button>
          <button 
            onClick={handleReset}
            className="w-full h-full text-2xl font-bold text-white bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 active:from-gray-800 active:to-gray-900 transition-colors duration-200"
          >
            RESET
          </button>
        </div>
      </div>
    </div>
  );
};

export default Index;
