
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import HeartShape from "@/components/HeartShape";
import VitalSign from "@/components/VitalSign";
import { useVitalMeasurement } from "@/hooks/useVitalMeasurement";

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [signalQuality, setSignalQuality] = useState(0);
  const { heartRate, spo2, pressure, arrhythmiaCount } = useVitalMeasurement(isMonitoring);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current && isMonitoring) {
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      // Simular el gráfico PPG
      let x = 0;
      const animate = () => {
        if (!isMonitoring) return;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.fillRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
        
        ctx.beginPath();
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.moveTo(x - 1, canvasRef.current!.height / 2);
        ctx.lineTo(x, canvasRef.current!.height / 2 + Math.sin(x * 0.1) * 50);
        ctx.stroke();
        
        x = (x + 1) % canvasRef.current!.width;
        requestAnimationFrame(animate);
      };

      animate();
    }
  }, [isMonitoring]);

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-8">PPG Monitor</h1>

        <div className="grid grid-cols-1 gap-6">
          {/* Indicador de calidad de señal */}
          <div className="flex justify-between items-center bg-gray-800 p-4 rounded-lg">
            <div className="flex items-center gap-2">
              <div 
                className="w-4 h-4 rounded-full" 
                style={{
                  backgroundColor: signalQuality > 75 ? '#00ff00' : 
                                 signalQuality > 50 ? '#ffff00' : '#ff0000'
                }}
              />
              <span>Signal Quality: {signalQuality}%</span>
            </div>
          </div>

          {/* Monitor cardíaco */}
          <div className="bg-gray-800 p-4 rounded-lg">
            <canvas 
              ref={canvasRef} 
              width={800} 
              height={200} 
              className="w-full bg-black rounded"
            />
          </div>

          {/* Mediciones principales */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <VitalSign label="Heart Rate" value={heartRate} unit="BPM" />
            <VitalSign label="SpO2" value={spo2} unit="%" />
            <VitalSign label="Blood Pressure" value={pressure} unit="mmHg" />
            <VitalSign
              label="Arrhythmias"
              value={arrhythmiaCount}
              unit="events"
            />
          </div>

          {/* Controles */}
          <div className="flex justify-center gap-4">
            <Button
              onClick={() => setSignalQuality(Math.min(signalQuality + 10, 100))}
              variant="outline"
              className="bg-gray-700 text-white"
            >
              Calibrar
            </Button>
            
            <Button
              onClick={() => setIsMonitoring(!isMonitoring)}
              className={`${isMonitoring ? 'bg-medical-red' : 'bg-medical-blue'} text-white`}
            >
              {isMonitoring ? 'Detener' : 'Iniciar'}
            </Button>

            <Button
              onClick={() => {
                setIsMonitoring(false);
                setSignalQuality(0);
              }}
              variant="outline"
              className="bg-gray-700 text-white"
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
