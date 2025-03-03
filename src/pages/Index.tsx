import React, { useState, useRef, useEffect } from "react";
import VitalSign from "@/components/VitalSign";
import CameraView from "@/components/CameraView";
import { useSignalProcessor } from "@/hooks/useSignalProcessor";
import { useHeartBeatProcessor } from "@/hooks/useHeartBeatProcessor";
import { useVitalSignsProcessor } from "@/hooks/useVitalSignsProcessor";
import PPGSignalMeter from "@/components/PPGSignalMeter";
import PermissionsHandler from "@/components/PermissionsHandler";
import { VitalSignsRisk } from '@/utils/vitalSignsRisk';
import { toast } from "sonner";

interface VitalSigns {
  spo2: number;
  pressure: string;
  arrhythmiaStatus: string;
  respiratoryRate: number;
  respiratoryPattern: string;
  respiratoryConfidence: number;
}

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [signalQuality, setSignalQuality] = useState(0);
  const [vitalSigns, setVitalSigns] = useState<VitalSigns>({ 
    spo2: 0, 
    pressure: "--/--",
    arrhythmiaStatus: "--",
    respiratoryRate: 0,
    respiratoryPattern: "unknown",
    respiratoryConfidence: 0
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
    pressure: string,
    respiratoryRate: number,
    respiratoryPattern: string,
    respiratoryConfidence: number
  } | null>(null);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const measurementTimerRef = useRef<number | null>(null);
  
  const allHeartRateValuesRef = useRef<number[]>([]);
  const allSpo2ValuesRef = useRef<number[]>([]);
  const allSystolicValuesRef = useRef<number[]>([]);
  const allDiastolicValuesRef = useRef<number[]>([]);
  
  const hasValidValuesRef = useRef(false);
  
  const { startProcessing, stopProcessing, lastSignal, processFrame } = useSignalProcessor();
  const { processSignal: processHeartBeat, reset: resetHeartBeat } = useHeartBeatProcessor();
  const { vitalSignsData, processSignal, reset, getCurrentRespiratoryData } = useVitalSignsProcessor();

  const handlePermissionsGranted = () => {
    console.log("Permisos concedidos correctamente");
    setPermissionsGranted(true);
  };

  const handlePermissionsDenied = () => {
    console.log("Permisos denegados - funcionalidad limitada");
    setPermissionsGranted(false);
  };

  const calculateFinalValues = () => {
    try {
      console.log("Calculando PROMEDIOS REALES con todos los valores capturados...");
      
      const validHeartRates = allHeartRateValuesRef.current.filter(v => v > 0);
      const validSpo2Values = allSpo2ValuesRef.current.filter(v => v > 0);
      const validSystolicValues = allSystolicValuesRef.current.filter(v => v > 0);
      const validDiastolicValues = allDiastolicValuesRef.current.filter(v => v > 0);
      
      console.log("Valores acumulados para promedios:", {
        heartRateValues: validHeartRates.length,
        spo2Values: validSpo2Values.length,
        systolicValues: validSystolicValues.length,
        diastolicValues: validDiastolicValues.length
      });
      
      let avgHeartRate = 0;
      let avgSpo2 = 0;
      let avgSystolic = 0;
      let avgDiastolic = 0;
      
      if (validHeartRates.length > 0) {
        avgHeartRate = Math.round(validHeartRates.reduce((a, b) => a + b, 0) / validHeartRates.length);
      } else {
        avgHeartRate = heartRate;
      }
      
      if (validSpo2Values.length > 0) {
        avgSpo2 = Math.round(validSpo2Values.reduce((a, b) => a + b, 0) / validSpo2Values.length);
      } else {
        avgSpo2 = vitalSigns.spo2;
      }
      
      let finalBPString = vitalSigns.pressure;
      if (validSystolicValues.length > 0 && validDiastolicValues.length > 0) {
        avgSystolic = Math.round(validSystolicValues.reduce((a, b) => a + b, 0) / validSystolicValues.length);
        avgDiastolic = Math.round(validDiastolicValues.reduce((a, b) => a + b, 0) / validDiastolicValues.length);
        finalBPString = `${avgSystolic}/${avgDiastolic}`;
      }
      
      console.log("PROMEDIOS REALES calculados:", {
        heartRate: avgHeartRate,
        spo2: avgSpo2,
        pressure: finalBPString
      });
      
      const respiratoryRate = getCurrentRespiratoryData?.() 
        ? getCurrentRespiratoryData().rate || 0
        : 0;
      
      const respiratoryPattern = getCurrentRespiratoryData?.()
        ? getCurrentRespiratoryData().pattern || 'unknown'
        : 'unknown';
        
      const respiratoryConfidence = getCurrentRespiratoryData?.()
        ? getCurrentRespiratoryData().confidence || 0
        : 0;

      setFinalValues({
        heartRate: avgHeartRate > 0 ? avgHeartRate : heartRate,
        spo2: avgSpo2 > 0 ? avgSpo2 : vitalSigns.spo2,
        pressure: finalBPString,
        respiratoryRate,
        respiratoryPattern,
        respiratoryConfidence
      });
        
      hasValidValuesRef.current = true;
      
      allHeartRateValuesRef.current = [];
      allSpo2ValuesRef.current = [];
      allSystolicValuesRef.current = [];
      allDiastolicValuesRef.current = [];

      setCurrentRespiratoryPattern(respiratoryPattern);
    } catch (error) {
      console.error("Error en calculateFinalValues:", error);
      setFinalValues({
        heartRate: heartRate,
        spo2: vitalSigns.spo2,
        pressure: vitalSigns.pressure,
        respiratoryRate: 0,
        respiratoryPattern: "unknown",
        respiratoryConfidence: 0
      });
      hasValidValuesRef.current = true;
    }
  };

  const startMonitoring = () => {
    if (!permissionsGranted) {
      console.log("No se puede iniciar sin permisos");
      return;
    }
    
    if (!isMonitoring && lastSignal?.quality < 50) {
      console.log("Señal insuficiente para iniciar medición", lastSignal?.quality);
      toast.warning("Calidad de señal insuficiente. Posicione bien su dedo en la cámara.", {
        duration: 3000,
      });
      return;
    }
    
    if (isMonitoring) {
      stopMonitoringOnly();
    } else {
      prepareProcessorsOnly();
      
      setIsMonitoring(true);
      setIsCameraOn(true);
      startProcessing();
      setElapsedTime(0);
      setMeasurementComplete(false);
      
      allHeartRateValuesRef.current = [];
      allSpo2ValuesRef.current = [];
      allSystolicValuesRef.current = [];
      allDiastolicValuesRef.current = [];
      
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

  const prepareProcessorsOnly = () => {
    console.log("Preparando SOLO procesadores (displays intactos)");
    
    setElapsedTime(0);
    
    resetHeartBeat();
    reset();
    VitalSignsRisk.resetHistory();
  };

  const stopMonitoringOnly = () => {
    try {
      console.log("Deteniendo SOLO monitorización (displays intactos)");
      
      setIsMonitoring(false);
      setIsCameraOn(false);
      stopProcessing();
      setMeasurementComplete(true);
      
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
      
      calculateFinalValues();
      
      if (measurementTimerRef.current) {
        clearInterval(measurementTimerRef.current);
        measurementTimerRef.current = null;
      }
    } catch (error) {
      console.error("Error en stopMonitoringOnly:", error);
      if (measurementTimerRef.current) {
        clearInterval(measurementTimerRef.current);
        measurementTimerRef.current = null;
      }
      setIsMonitoring(false);
      setIsCameraOn(false);
    }
  };

  const handleReset = () => {
    console.log("RESET COMPLETO solicitado");
    
    setIsMonitoring(false);
    setIsCameraOn(false);
    stopProcessing();
    
    if (measurementTimerRef.current) {
      clearInterval(measurementTimerRef.current);
      measurementTimerRef.current = null;
    }
    
    setHeartRate(0);
    setVitalSigns({ 
      spo2: 0, 
      pressure: "--/--",
      arrhythmiaStatus: "--",
      respiratoryRate: 0,
      respiratoryPattern: "unknown",
      respiratoryConfidence: 0
    });
    setArrhythmiaCount("--");
    setLastArrhythmiaData(null);
    setElapsedTime(0);
    setMeasurementComplete(false);
    setFinalValues(null);
    
    resetHeartBeat();
    reset();
    VitalSignsRisk.resetHistory();
    
    hasValidValuesRef.current = false;
    
    allHeartRateValuesRef.current = [];
    allSpo2ValuesRef.current = [];
    allSystolicValuesRef.current = [];
    allDiastolicValuesRef.current = [];
  };

  const handleStreamReady = (stream: MediaStream) => {
    if (!isMonitoring) return;
    
    const videoTrack = stream.getVideoTracks()[0];
    const imageCapture = new ImageCapture(videoTrack);
    
    if (isMonitoring && videoTrack.getCapabilities()?.torch) {
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
    
    return () => {
      if (videoTrack.getCapabilities()?.torch) {
        videoTrack.applyConstraints({
          advanced: [{ torch: false }]
        }).catch(err => console.error("Error desactivando linterna:", err));
      }
    };
  };

  useEffect(() => {
    if (!isMonitoring && isCameraOn) {
      try {
        const tracks = navigator.mediaDevices
          .getUserMedia({ video: true })
          .then(stream => {
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack && videoTrack.getCapabilities()?.torch) {
              videoTrack.applyConstraints({
                advanced: [{ torch: false }]
              }).catch(err => console.error("Error desactivando linterna:", err));
            }
            stream.getTracks().forEach(track => track.stop());
          })
          .catch(err => console.error("Error al intentar apagar la linterna:", err));
      } catch (err) {
        console.error("Error al acceder a la cámara para apagar la linterna:", err);
      }
    }
  }, [isMonitoring, isCameraOn]);

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
    
    const immersiveTimeout = setTimeout(enterImmersiveMode, 1000);

    const handleInteraction = () => {
      enterImmersiveMode();
    };

    document.addEventListener('touchstart', handleInteraction, { passive: true });
    document.addEventListener('click', handleInteraction, { passive: true });

    return () => {
      clearTimeout(immersiveTimeout);
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('click', handleInteraction);
    };
  }, []);

  useEffect(() => {
    if (lastSignal && lastSignal.fingerDetected && isMonitoring) {
      try {
        const heartBeatResult = processHeartBeat(lastSignal.filteredValue);
        
        if (!measurementComplete) {
          if (heartBeatResult.bpm > 0) {
            setHeartRate(heartBeatResult.bpm);
            allHeartRateValuesRef.current.push(heartBeatResult.bpm);
          }
          
          const vitals = processSignal(lastSignal.filteredValue, heartBeatResult.rrData);
          if (vitals) {
            if (vitals.spo2 > 0) {
              setVitalSigns(current => ({
                ...current,
                spo2: vitals.spo2
              }));
              allSpo2ValuesRef.current.push(vitals.spo2);
            }
            
            if (vitals.pressure !== "--/--" && vitals.pressure !== "0/0") {
              setVitalSigns(current => ({
                ...current,
                pressure: vitals.pressure
              }));
              
              const [systolic, diastolic] = vitals.pressure.split('/').map(Number);
              if (systolic > 0 && diastolic > 0) {
                allSystolicValuesRef.current.push(systolic);
                allDiastolicValuesRef.current.push(diastolic);
              }
            }
            
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
  }, [lastSignal, isMonitoring, processHeartBeat, processSignal, measurementComplete]);

  useEffect(() => {
    return () => {
      if (measurementTimerRef.current) {
        clearInterval(measurementTimerRef.current);
        measurementTimerRef.current = null;
      }
    };
  }, []);

  const [currentRespiratoryPattern, setCurrentRespiratoryPattern] = useState<string>('normal');

  return (
    <div 
      className="fixed inset-0 flex flex-col bg-black" 
      style={{ 
        height: '100%',
        maxHeight: '100dvh',
        minHeight: '100vh',
        touchAction: 'none',
        overscrollBehavior: 'none',
        WebkitOverflowScrolling: 'touch',
        overflow: 'hidden',
        paddingTop: 'var(--sat)',
        paddingRight: 'var(--sar)',
        paddingBottom: 'var(--sab)',
        paddingLeft: 'var(--sal)',
      }}
    >
      <PermissionsHandler 
        onPermissionsGranted={handlePermissionsGranted}
        onPermissionsDenied={handlePermissionsDenied}
      />
      
      <div className="absolute inset-0 z-0">
        <CameraView 
          onStreamReady={handleStreamReady}
          isMonitoring={isCameraOn && permissionsGranted}
          isFingerDetected={isMonitoring ? lastSignal?.fingerDetected : false}
          signalQuality={isMonitoring ? signalQuality : 0}
        />
        <div 
          className="absolute inset-0" 
          style={{ 
            backgroundColor: 'rgba(0, 0, 0, 0.8)', 
            backdropFilter: 'blur(2px)' 
          }} 
        />
      </div>

      <div className="absolute inset-0 z-10">
        <PPGSignalMeter 
          value={isMonitoring ? lastSignal?.filteredValue || 0 : 0}
          quality={isMonitoring ? lastSignal?.quality || 0 : 0}
          isFingerDetected={isMonitoring ? lastSignal?.fingerDetected || false : false}
          onStartMeasurement={startMonitoring}
          onReset={handleReset}
          arrhythmiaStatus={vitalSigns.arrhythmiaStatus}
          rawArrhythmiaData={lastArrhythmiaData}
          respiratoryRate={finalValues?.respiratoryRate || vitalSigns.respiratoryRate || 0}
          respiratoryPattern={finalValues?.respiratoryPattern || vitalSigns.respiratoryPattern || 'unknown'}
        />
      </div>

      <div className="absolute z-20" style={{ bottom: '65px', left: 0, right: 0, padding: '0 12px' }}>
        <div className="p-2 rounded-lg">
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
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
            <VitalSign
              label="Respiración"
              value={finalValues?.respiratoryRate > 0 
                ? `${finalValues.respiratoryRate}` 
                : isMonitoring ? '...' : '--'}
              unit="rpm"
              isFinalReading={!measurementComplete && finalValues?.respiratoryRate > 0}
            />
          </div>
        </div>
      </div>

      <div className="absolute z-50" style={{ bottom: 0, left: 0, right: 0, height: '55px' }}>
        <div className="grid grid-cols-2 gap-px w-full h-full">
          <button 
            onClick={startMonitoring}
            className="w-full h-full text-xl font-bold text-white transition-colors duration-200"
            disabled={!permissionsGranted}
            style={{ 
              backgroundImage: !permissionsGranted 
                ? 'linear-gradient(135deg, #64748b, #475569, #334155)'
                : isMonitoring 
                  ? 'linear-gradient(135deg, #f87171, #dc2626, #b91c1c)' 
                  : 'linear-gradient(135deg, #3b82f6, #2563eb, #1d4ed8)',
              textShadow: '0px 1px 3px rgba(0, 0, 0, 0.3)',
              opacity: !permissionsGranted ? 0.7 : 1
            }}
          >
            {!permissionsGranted ? 'PERMISOS REQUERIDOS' : (isMonitoring ? 'DETENER' : 'INICIAR')}
          </button>
          <button 
            onClick={handleReset}
            className="w-full h-full text-xl font-bold text-white transition-colors duration-200"
            style={{ 
              backgroundImage: 'linear-gradient(135deg, #64748b, #475569, #334155)',
              textShadow: '0px 1px 3px rgba(0, 0, 0, 0.3)'
            }}
          >
            RESET
          </button>
        </div>
      </div>
      
      {!permissionsGranted && (
        <div className="absolute z-50 top-1/2 left-0 right-0 text-center px-4 transform -translate-y-1/2">
          <div className="bg-red-900/80 backdrop-blur-sm p-4 rounded-lg mx-auto max-w-md">
            <h3 className="text-xl font-bold text-white mb-2">Permisos necesarios</h3>
            <p className="text-white/90 mb-4">
              Esta aplicación necesita acceso a la cámara para medir tus signos vitales.
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-white text-red-900 font-bold py-2 px-4 rounded"
            >
              Reintentar
            </button>
          </div>
        </div>
      )}

      {finalValues?.respiratoryPattern && finalValues.respiratoryPattern !== 'unknown' && finalValues.respiratoryRate > 0 && (
        <div className="text-sm text-center mb-4 px-4">
          <span className="font-medium">
            Patrón respiratorio:
          </span>{' '}
          <span className={`${
            finalValues.respiratoryPattern === 'normal' ? 'text-green-500' :
            finalValues.respiratoryPattern === 'deep' ? 'text-blue-500' :
            finalValues.respiratoryPattern === 'shallow' ? 'text-yellow-500' :
            'text-red-500'
          }`}>
            {finalValues.respiratoryPattern === 'normal' ? 'Normal' :
             finalValues.respiratoryPattern === 'deep' ? 'Profunda' :
             finalValues.respiratoryPattern === 'shallow' ? 'Superficial' :
             finalValues.respiratoryPattern === 'irregular' ? 'Irregular' : 'Desconocido'}
          </span>
          {finalValues.respiratoryConfidence < 70 && (
            <span className="text-gray-400 text-xs ml-2">
              (confianza: {Math.round(finalValues.respiratoryConfidence)}%)
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default Index;
