
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import VitalSign from "@/components/VitalSign";
import CameraView from "@/components/CameraView";
import { useSignalProcessor } from "@/hooks/useSignalProcessor";
import PPGSignalMeter from "@/components/PPGSignalMeter";
import { useHeartBeatProcessor } from "@/hooks/useHeartBeatProcessor";
import { useVitalSignsProcessor } from "@/hooks/useVitalSignsProcessor";
import { Play, Square } from "lucide-react";

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [signalQuality, setSignalQuality] = useState(0);
  const [vitalSigns, setVitalSigns] = useState({ 
    spo2: 0, 
    pressure: "--/--",
    arrhythmiaStatus: "--" 
  });
  const [heartRate, setHeartRate] = useState(0);
  const [arrhythmiaCount, setArrhythmiaCount] = useState<string | number>("--");
  const [elapsedTime, setElapsedTime] = useState(0);
  const measurementTimerRef = useRef<number | null>(null);
  const processingRef = useRef(false);
  const imageCaptureRef = useRef<ImageCapture | null>(null);
  
  const { startProcessing, stopProcessing, lastSignal, processFrame } = useSignalProcessor();
  const { processSignal: processHeartBeat } = useHeartBeatProcessor();
  const { processSignal: processVitalSigns, reset: resetVitalSigns } = useVitalSignsProcessor();

  const startMonitoring = () => {
    console.log("Starting monitoring...");
    setIsMonitoring(true);
    setIsCameraOn(true);
    startProcessing();
    setElapsedTime(0);
    processingRef.current = true;
    
    if (measurementTimerRef.current) {
      clearInterval(measurementTimerRef.current);
    }
    
    measurementTimerRef.current = window.setInterval(() => {
      setElapsedTime(prev => {
        if (prev >= 30) {
          stopMonitoring();
          return 30;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const stopMonitoring = () => {
    console.log("Stopping monitoring...");
    processingRef.current = false;
    setIsMonitoring(false);
    setIsCameraOn(false);
    stopProcessing();
    resetVitalSigns();
    setElapsedTime(0);
    
    if (measurementTimerRef.current) {
      clearInterval(measurementTimerRef.current);
      measurementTimerRef.current = null;
    }

    imageCaptureRef.current = null;
  };

  const handleStreamReady = (stream: MediaStream) => {
    if (!isMonitoring) {
      console.log("Not monitoring, ignoring stream");
      return;
    }
    
    console.log("Camera stream ready", stream.getVideoTracks()[0].getSettings());
    const videoTrack = stream.getVideoTracks()[0];
    imageCaptureRef.current = new ImageCapture(videoTrack);
    
    if (videoTrack.getCapabilities()?.torch) {
      videoTrack.applyConstraints({
        advanced: [{ torch: true }]
      }).catch(err => console.error("Error activating torch:", err));
    }
    
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) {
      console.error("Could not get 2D context");
      return;
    }
    
    const processImage = async () => {
      if (!processingRef.current || !imageCaptureRef.current) {
        console.log("Processing stopped or no ImageCapture");
        return;
      }
      
      try {
        const frame = await imageCaptureRef.current.grabFrame();
        tempCanvas.width = frame.width;
        tempCanvas.height = frame.height;
        tempCtx.drawImage(frame, 0, 0);
        const imageData = tempCtx.getImageData(0, 0, frame.width, frame.height);
        
        processFrame(imageData);
        
        if (processingRef.current) {
          requestAnimationFrame(processImage);
        }
      } catch (error) {
        console.error("Error capturing frame:", error);
        if (processingRef.current) {
          requestAnimationFrame(processImage);
        }
      }
    };

    processImage();
  };

  useEffect(() => {
    if (lastSignal && lastSignal.fingerDetected && isMonitoring) {
      console.log("Processing signal:", lastSignal);
      const heartBeatResult = processHeartBeat(lastSignal.filteredValue);
      setHeartRate(heartBeatResult.bpm);
      
      const vitals = processVitalSigns(lastSignal.filteredValue, heartBeatResult.rrData);
      if (vitals) {
        setVitalSigns(vitals);
        setArrhythmiaCount(vitals.arrhythmiaStatus);
      }
      
      setSignalQuality(lastSignal.quality);
    }
  }, [lastSignal, isMonitoring, processHeartBeat, processVitalSigns]);

  useEffect(() => {
    return () => {
      console.log("Index cleanup");
      stopMonitoring();
    };
  }, []);

  return (
    <div className="w-screen h-screen bg-gray-900 overflow-hidden">
      <div className="relative w-full h-full">
        <div className="absolute inset-0">
          <CameraView 
            onStreamReady={handleStreamReady}
            isMonitoring={isCameraOn}
            isFingerDetected={lastSignal?.fingerDetected}
            signalQuality={signalQuality}
            buttonPosition={document.querySelector('.measure-button')?.getBoundingClientRect()}
          />
        </div>

        <div className="relative z-10 h-full flex flex-col justify-between p-4">
          <div className="flex justify-between items-start w-full">
            <h1 className="text-lg font-bold text-white bg-black/30 px-3 py-1 rounded">Monitor PPG</h1>
          </div>

          <div className="flex-1 flex flex-col justify-center gap-2 max-w-md mx-auto w-full">
            <div className="relative">
              <PPGSignalMeter 
                value={lastSignal?.filteredValue || 0}
                quality={lastSignal?.quality || 0}
                isFingerDetected={lastSignal?.fingerDetected || false}
                isComplete={elapsedTime >= 30}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <VitalSign label="Heart Rate" value={heartRate} unit="BPM" />
              <VitalSign label="SpO2" value={vitalSigns.spo2} unit="%" />
              <VitalSign label="Blood Pressure" value={vitalSigns.pressure} unit="mmHg" />
              <VitalSign label="Arrhythmias" value={arrhythmiaCount} />
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 w-full max-w-md mx-auto">
            {isMonitoring && (
              <div className="text-xs font-medium text-gray-300 mb-1">
                Tiempo: {elapsedTime}s / 30s
              </div>
            )}
            <Button
              onClick={isMonitoring ? stopMonitoring : startMonitoring}
              className={`w-full measure-button ${
                isMonitoring 
                  ? 'bg-red-600/80 hover:bg-red-600' 
                  : 'bg-green-600/80 hover:bg-green-600'
              } text-white`}
            >
              {isMonitoring ? (
                <>
                  <Square className="h-4 w-4 mr-2" />
                  Detener Medición
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Iniciar Medición
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
