import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import VitalSign from "@/components/VitalSign";
import { useVitalMeasurement } from "@/hooks/useVitalMeasurement";
import CameraView from "@/components/CameraView";
import { useSignalProcessor } from "@/hooks/useSignalProcessor";
import SignalQualityIndicator from "@/components/SignalQualityIndicator";
import { useHeartBeatProcessor } from "@/hooks/useHeartBeatProcessor";
import HeartRateDisplay from "@/components/HeartRateDisplay";

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [signalQuality, setSignalQuality] = useState(0);
  const { heartRate, spo2, pressure, arrhythmiaCount, elapsedTime, isComplete } = useVitalMeasurement(isMonitoring);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { startProcessing, stopProcessing, lastSignal, processFrame } = useSignalProcessor();
  const processingRef = useRef<boolean>(false);
  const { currentBPM, confidence, processSignal, reset: resetHeartBeat } = useHeartBeatProcessor();

  useEffect(() => {
    processingRef.current = isMonitoring;
  }, [isMonitoring]);

  useEffect(() => {
    const handleMeasurementComplete = (e: Event) => {
      e.preventDefault();
      handleStopMeasurement();
    };

    window.addEventListener('measurementComplete', handleMeasurementComplete);
    return () => window.removeEventListener('measurementComplete', handleMeasurementComplete);
  }, []);

  useEffect(() => {
    if (lastSignal) {
      console.log("Index: Actualizando calidad de señal:", lastSignal.quality);
      setSignalQuality(lastSignal.quality);
    }
  }, [lastSignal]);

  const handleStreamReady = (stream: MediaStream) => {
    console.log("Index: Camera stream ready", stream.getVideoTracks()[0].getSettings());
    const videoTrack = stream.getVideoTracks()[0];
    const imageCapture = new ImageCapture(videoTrack);
    
    // Intentar encender la linterna
    if (videoTrack.getCapabilities()?.torch) {
      videoTrack.applyConstraints({
        advanced: [{ torch: true }]
      }).catch(err => console.error("Error activando linterna:", err));
    }
    
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) {
      console.error("Index: No se pudo obtener el contexto 2D del canvas temporal");
      return;
    }
    
    const processImage = async () => {
      if (!processingRef.current) {
        console.log("Index: Monitoreo detenido, no se procesan más frames");
        return;
      }
      
      try {
        const frame = await imageCapture.grabFrame();
        console.log("Index: Frame capturado", {
          width: frame.width,
          height: frame.height
        });
        
        tempCanvas.width = frame.width;
        tempCanvas.height = frame.height;
        tempCtx.drawImage(frame, 0, 0);
        
        const imageData = tempCtx.getImageData(0, 0, frame.width, frame.height);
        console.log("Index: ImageData generado", {
          width: imageData.width,
          height: imageData.height,
          dataLength: imageData.data.length,
          firstPixelRed: imageData.data[0]
        });
        
        processFrame(imageData);
        
        if (processingRef.current) {
          requestAnimationFrame(processImage);
        }
      } catch (error) {
        console.error("Index: Error capturando frame:", error);
        if (processingRef.current) {
          requestAnimationFrame(processImage);
        }
      }
    };

    // Iniciar el procesamiento después de que la cámara esté lista
    setIsMonitoring(true);
    processingRef.current = true;
    processImage();
  };

  const handleStartMeasurement = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log("Index: Iniciando medición");
    startProcessing();
    setIsCameraOn(true);
  };

  const handleStopMeasurement = () => {
    console.log("Index: Deteniendo medición");
    setIsMonitoring(false);
    processingRef.current = false;
    stopProcessing();
    setSignalQuality(0);
    setIsCameraOn(false);
  };

  const handleReset = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleStopMeasurement();
    resetHeartBeat();
  };

  useEffect(() => {
    if (canvasRef.current && isMonitoring) {
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);

      let x = 0;
      let previousY = canvasRef.current.height / 2;

      const animate = () => {
        if (!isMonitoring) return;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.fillRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
        
        const signalValue = lastSignal ? -lastSignal.filteredValue * 100 : 0;
        const currentY = (canvasRef.current!.height / 2) + signalValue;
        
        const gradient = ctx.createLinearGradient(x-1, previousY, x, currentY);
        gradient.addColorStop(0, '#00ff00');
        gradient.addColorStop(1, '#39FF14');
        
        ctx.beginPath();
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;
        ctx.moveTo(x-1, previousY);
        ctx.lineTo(x, currentY);
        ctx.stroke();
        
        previousY = currentY;
        x = (x + 1) % canvasRef.current!.width;
        
        requestAnimationFrame(animate);
      };

      animate();
    }
  }, [isMonitoring, lastSignal]);

  return (
    <div className="w-screen h-screen bg-gray-900 overflow-hidden">
      <div className="relative w-full h-full">
        <div className="absolute inset-0">
          <CameraView 
            onStreamReady={handleStreamReady} 
            isMonitoring={isCameraOn}
            isFingerDetected={lastSignal?.fingerDetected}
            signalQuality={signalQuality}
          />
        </div>

        <div className="relative z-10 h-full flex flex-col justify-between p-4">
          <div className="flex justify-between items-start w-full">
            <h1 className="text-lg font-bold text-white bg-black/30 px-3 py-1 rounded">PPG Monitor</h1>
            <div className="text-base font-mono text-medical-blue bg-black/30 px-3 py-1 rounded">
              {isMonitoring ? `${Math.ceil(22 - elapsedTime)}s` : '22s'}
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center gap-2 max-w-md mx-auto w-full">
            <div className="bg-black/40 backdrop-blur-sm rounded-lg p-2">
              <canvas 
                ref={canvasRef} 
                width={400} 
                height={100}
                className="w-full h-20 rounded bg-black/60"
              />
            </div>

            <SignalQualityIndicator quality={signalQuality} />

            <div className="grid grid-cols-2 gap-2">
              <VitalSign label="Heart Rate" value={heartRate} unit="BPM" />
              <VitalSign label="SpO2" value={spo2} unit="%" />
              <VitalSign label="Blood Pressure" value={pressure} unit="mmHg" />
              <VitalSign label="Arrhythmias" value={arrhythmiaCount} unit="events" />
            </div>

            <HeartRateDisplay bpm={currentBPM} confidence={confidence} />
          </div>

          <div className="flex justify-center gap-2 w-full max-w-md mx-auto">
            <Button
              onClick={async (e) => {
                e.preventDefault();
                const processor = await import('../modules/SignalProcessor');
                const signalProcessor = new processor.PPGSignalProcessor();
                await signalProcessor.calibrate();
              }}
              size="sm"
              className="flex-1 bg-medical-blue/80 hover:bg-medical-blue text-white text-xs py-1.5"
            >
              Calibrar
            </Button>
            
            <Button
              onClick={isMonitoring ? handleStopMeasurement : handleStartMeasurement}
              size="sm"
              className={`flex-1 ${isMonitoring ? 'bg-medical-red/80 hover:bg-medical-red' : 'bg-medical-blue/80 hover:bg-medical-blue'} text-white text-xs py-1.5`}
              disabled={isComplete && !isMonitoring}
            >
              {isMonitoring ? 'Detener' : 'Iniciar'}
            </Button>

            <Button
              onClick={handleReset}
              size="sm"
              className="flex-1 bg-gray-600/80 hover:bg-gray-600 text-white text-xs py-1.5"
            >
              Reset
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
