
import React, { useEffect, useRef, useCallback } from 'react';
import { Fingerprint } from 'lucide-react';
import { CircularBuffer, PPGDataPoint } from '../utils/CircularBuffer';

interface PPGSignalMeterProps {
  value: number;
  quality: number;
  isFingerDetected: boolean;
  onStartMeasurement: () => void;
  onReset: () => void;
  arrhythmiaStatus?: string;
  rawArrhythmiaData?: {
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  } | null;
}

const PPGSignalMeter = ({ 
  value, 
  quality, 
  isFingerDetected,
  onStartMeasurement,
  onReset,
  arrhythmiaStatus,
  rawArrhythmiaData
}: PPGSignalMeterProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataBufferRef = useRef<CircularBuffer | null>(null);
  const baselineRef = useRef<number | null>(null);
  const lastValueRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number>();
  const lastRenderTimeRef = useRef<number>(0);
  const lastArrhythmiaTime = useRef<number>(0);
  const arrhythmiaCountRef = useRef<number>(0);
  
  // Optimized constants for better visualization
  const WINDOW_WIDTH_MS = 5000; // Increased from 4500ms to 5000ms for better wave visualization
  const CANVAS_WIDTH = 600; // Increased from 400px to 600px for higher resolution
  const CANVAS_HEIGHT = 800; // Increased from 650px to 800px for better vertical detail
  const GRID_SIZE_X = 100; // Reduced from 125px to 100px for more precise grid
  const GRID_SIZE_Y = 25; // Reduced from 30px to 25px for more vertical grid lines
  const VERTICAL_SCALE = 42.0; // Increased from 35.0 to 42.0 for better wave amplification
  const SMOOTHING_FACTOR = 1.8; // Increased from 1.6 to 1.8 for smoother waves
  const TARGET_FPS = 60;
  const FRAME_TIME = 1000 / TARGET_FPS; // Optimized frame time calculation
  const BUFFER_SIZE = 650; // Increased from 500 to 650 for longer signal history
  const INVERT_SIGNAL = false;
  const PEAK_MIN_VALUE = 8.0; // Increased from 7.0 to 8.0 for more accurate peak detection
  const PEAK_DISTANCE_MS = 200; // Minimum time between peaks in milliseconds

  useEffect(() => {
    if (!dataBufferRef.current) {
      dataBufferRef.current = new CircularBuffer(BUFFER_SIZE);
    }
  }, []);

  const getQualityColor = useCallback((q: number) => {
    if (!isFingerDetected) return 'from-gray-400 to-gray-500';
    if (q > 75) return 'from-green-500 to-emerald-500';
    if (q > 50) return 'from-yellow-500 to-orange-500';
    if (q > 30) return 'from-orange-500 to-red-500';
    return 'from-red-500 to-rose-500';
  }, [isFingerDetected]);

  const getQualityText = useCallback((q: number) => {
    if (!isFingerDetected) return 'Sin detección';
    if (q > 75) return 'Señal óptima';
    if (q > 50) return 'Señal aceptable';
    if (q > 30) return 'Señal débil';
    return 'Señal muy débil';
  }, [isFingerDetected]);

  const smoothValue = useCallback((currentValue: number, previousValue: number | null): number => {
    if (previousValue === null) return currentValue;
    return previousValue + SMOOTHING_FACTOR * (currentValue - previousValue);
  }, []);

  // Optimized grid drawing with high-quality rendering
  const drawGrid = useCallback((ctx: CanvasRenderingContext2D) => {
    // Use clearRect for better performance than fillRect+fill
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Use a higher quality background with subtle gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, '#f8f9fa');
    gradient.addColorStop(1, '#f1f3f5');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw the main horizontal axis line (zero line)
    const zeroY = CANVAS_HEIGHT * 0.6;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 150, 100, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.moveTo(0, zeroY);
    ctx.lineTo(CANVAS_WIDTH, zeroY);
    ctx.stroke();

    // Draw minor grid lines
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 180, 120, 0.08)';
    ctx.lineWidth = 0.5;

    // Vertical grid lines (time axis)
    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE_X) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
    }

    // Horizontal grid lines (amplitude axis)
    for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE_Y) {
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
    }
    ctx.stroke();

    // Draw major grid lines
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 150, 100, 0.2)';
    ctx.lineWidth = 1;

    // Major vertical grid lines
    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE_X * 4) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      
      // Add time labels with better formatting
      if (x >= 0) {
        const timeMs = (x / CANVAS_WIDTH) * WINDOW_WIDTH_MS;
        ctx.fillStyle = 'rgba(0, 120, 80, 0.9)';
        ctx.font = '10px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(timeMs)}ms`, x, CANVAS_HEIGHT - 5);
      }
    }

    // Major horizontal grid lines
    for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE_Y * 4) {
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      
      // Add amplitude labels with better formatting
      if (y % (GRID_SIZE_Y * 4) === 0) {
        const amplitude = ((zeroY - y) / VERTICAL_SCALE).toFixed(1);
        ctx.fillStyle = 'rgba(0, 120, 80, 0.9)';
        ctx.font = '10px "Inter", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(amplitude, 25, y + 4);
      }
    }
    ctx.stroke();

    // Draw axis labels
    ctx.fillStyle = 'rgba(0, 120, 80, 0.9)';
    ctx.font = 'bold 12px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Tiempo (ms)', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 20);
    
    ctx.save();
    ctx.translate(10, CANVAS_HEIGHT / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Amplitud', 0, 0);
    ctx.restore();
  }, []);

  // Optimized signal rendering with improved performance
  const renderSignal = useCallback(() => {
    if (!canvasRef.current || !dataBufferRef.current) {
      animationFrameRef.current = requestAnimationFrame(renderSignal);
      return;
    }

    const currentTime = performance.now();
    const timeSinceLastRender = currentTime - lastRenderTimeRef.current;

    // Skip frames for performance optimization if needed
    if (timeSinceLastRender < FRAME_TIME) {
      animationFrameRef.current = requestAnimationFrame(renderSignal);
      return;
    }

    const canvas = canvasRef.current;
    // Use desynchronized: true for better performance with high frame rates
    const ctx = canvas.getContext('2d', { 
      alpha: false, // Disable alpha for performance
      desynchronized: true // Enable desynchronized mode for better performance
    });
    
    if (!ctx) {
      animationFrameRef.current = requestAnimationFrame(renderSignal);
      return;
    }

    const now = Date.now();
    
    // Dynamic baseline calculation with adaptive rate
    if (baselineRef.current === null) {
      baselineRef.current = value;
    } else {
      const adaptiveRate = isFingerDetected ? 0.95 : 0.8;
      baselineRef.current = baselineRef.current * adaptiveRate + value * (1 - adaptiveRate);
    }

    // Apply enhanced smoothing for cleaner signal
    const smoothedValue = smoothValue(value, lastValueRef.current);
    lastValueRef.current = smoothedValue;

    // Calculate normalized and scaled value
    const normalizedValue = smoothedValue - (baselineRef.current || 0);
    const scaledValue = normalizedValue * VERTICAL_SCALE;
    
    // Detect arrhythmia
    let isArrhythmia = false;
    if (rawArrhythmiaData && 
        arrhythmiaStatus?.includes("ARRITMIA") && 
        now - rawArrhythmiaData.timestamp < 1000) {
      isArrhythmia = true;
      lastArrhythmiaTime.current = now;
      arrhythmiaCountRef.current++;
    }

    // Store the data point in the buffer
    const dataPoint: PPGDataPoint = {
      time: now,
      value: scaledValue,
      isArrhythmia
    };
    
    dataBufferRef.current.push(dataPoint);

    // Draw the grid first
    drawGrid(ctx);

    const points = dataBufferRef.current.getPoints();
    if (points.length > 1) {
      // Filter only visible points for better performance
      const visiblePoints = points.filter(
        point => (now - point.time) <= WINDOW_WIDTH_MS
      );
      
      if (visiblePoints.length > 1) {
        // Draw the main PPG signal with optimized rendering
        ctx.beginPath();
        ctx.strokeStyle = '#0EA5E9';
        ctx.lineWidth = 2.5; // Increased line width for better visibility
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        
        // Use path optimization to reduce redrawing
        let firstPoint = true;
        
        for (let i = 0; i < visiblePoints.length; i++) {
          const point = visiblePoints[i];
          const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
          // More accurate positioning relative to zero line
          const y = canvas.height * 0.6 - point.value;
          
          if (firstPoint) {
            ctx.moveTo(x, y);
            firstPoint = false;
          } else {
            ctx.lineTo(x, y);
          }
          
          // Draw arrhythmia segments with distinct styling
          if (point.isArrhythmia && i < visiblePoints.length - 1) {
            ctx.stroke();
            ctx.beginPath();
            ctx.strokeStyle = '#DC2626';
            ctx.lineWidth = 3;
            ctx.setLineDash([3, 2]);
            ctx.moveTo(x, y);
            
            const nextPoint = visiblePoints[i + 1];
            const nextX = canvas.width - ((now - nextPoint.time) * canvas.width / WINDOW_WIDTH_MS);
            const nextY = canvas.height * 0.6 - nextPoint.value;
            ctx.lineTo(nextX, nextY);
            ctx.stroke();
            
            // Reset for continuing normal signal
            ctx.beginPath();
            ctx.strokeStyle = '#0EA5E9';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([]);
            ctx.moveTo(nextX, nextY);
            firstPoint = false;
          }
        }
        
        ctx.stroke();
      }

      // Improved peak detection with more precise algorithm
      const maxPeakIndices: number[] = [];
      
      for (let i = 2; i < visiblePoints.length - 2; i++) {
        const point = visiblePoints[i];
        const prevPoint1 = visiblePoints[i - 1];
        const prevPoint2 = visiblePoints[i - 2];
        const nextPoint1 = visiblePoints[i + 1];
        const nextPoint2 = visiblePoints[i + 2];
        
        // Enhanced peak detection criteria
        if (point.value > prevPoint1.value && 
            point.value > prevPoint2.value && 
            point.value > nextPoint1.value && 
            point.value > nextPoint2.value) {
          
          const peakAmplitude = point.value;
          
          // Only significant peaks with minimum amplitude
          if (peakAmplitude > PEAK_MIN_VALUE) {
            const peakTime = point.time;
            
            // Avoid closely spaced peaks for cleaner visualization
            const hasPeakNearby = maxPeakIndices.some(idx => {
              const existingPeakTime = visiblePoints[idx].time;
              return Math.abs(existingPeakTime - peakTime) < PEAK_DISTANCE_MS;
            });
            
            if (!hasPeakNearby) {
              maxPeakIndices.push(i);
            }
          }
        }
      }
      
      // Draw peaks with enhanced visualization
      for (const idx of maxPeakIndices) {
        const point = visiblePoints[idx];
        const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
        const y = canvas.height * 0.6 - point.value;
        
        // Draw peak markers with improved visual cues
        ctx.beginPath();
        
        // Draw peak point with glow effect
        const isArrhythmiaPeak = point.isArrhythmia;
        const peakColor = isArrhythmiaPeak ? '#DC2626' : '#0EA5E9';
        const glowColor = isArrhythmiaPeak ? 'rgba(220, 38, 38, 0.3)' : 'rgba(14, 165, 233, 0.3)';
        
        // Add glow effect
        const gradient = ctx.createRadialGradient(x, y, 2, x, y, 10);
        gradient.addColorStop(0, peakColor);
        gradient.addColorStop(1, glowColor);
        
        ctx.fillStyle = gradient;
        ctx.arc(x, y, isArrhythmiaPeak ? 6 : 5, 0, Math.PI * 2);
        ctx.fill();
        
        // Add stroke for better definition
        ctx.strokeStyle = isArrhythmiaPeak ? '#FF4D4D' : '#38BDF8';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Draw peak value with improved styling
        ctx.font = 'bold 12px "Inter", sans-serif';
        ctx.fillStyle = isArrhythmiaPeak ? '#B91C1C' : '#0369A1';
        ctx.textAlign = 'center';
        ctx.fillText(Math.abs(point.value / VERTICAL_SCALE).toFixed(2), x, y - 20);
        
        // Enhanced arrhythmia visualization
        if (isArrhythmiaPeak) {
          // Outer highlight ring
          ctx.beginPath();
          ctx.arc(x, y, 12, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
          ctx.lineWidth = 2;
          ctx.stroke();
          
          // Warning indicator
          ctx.beginPath();
          ctx.arc(x, y, 18, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(248, 113, 113, 0.6)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
          
          // Warning label
          ctx.font = 'bold 11px "Inter", sans-serif';
          ctx.fillStyle = '#EF4444';
          ctx.fillText("LATIDO PREMATURO", x, y - 35);
          
          // Connect with previous and next peaks for better visualization
          ctx.beginPath();
          ctx.setLineDash([2, 2]);
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
          ctx.lineWidth = 1;
          
          if (idx > 0) {
            const prevIdx = maxPeakIndices.findIndex(i => i < idx);
            if (prevIdx !== -1) {
              const prevPeakIdx = maxPeakIndices[prevIdx];
              const prevPoint = visiblePoints[prevPeakIdx];
              const prevX = canvas.width - ((now - prevPoint.time) * canvas.width / WINDOW_WIDTH_MS);
              const prevY = canvas.height * 0.6 - prevPoint.value;
              
              ctx.moveTo(prevX, prevY - 15);
              ctx.lineTo(x, y - 15);
              ctx.stroke();
            }
          }
          
          if (idx < visiblePoints.length - 1) {
            const nextIdx = maxPeakIndices.findIndex(i => i > idx);
            if (nextIdx !== -1) {
              const nextPeakIdx = maxPeakIndices[nextIdx];
              const nextPoint = visiblePoints[nextPeakIdx];
              const nextX = canvas.width - ((now - nextPoint.time) * canvas.width / WINDOW_WIDTH_MS);
              const nextY = canvas.height * 0.6 - nextPoint.value;
              
              ctx.moveTo(x, y - 15);
              ctx.lineTo(nextX, nextY - 15);
              ctx.stroke();
            }
          }
          
          ctx.setLineDash([]);
        }
      }
    }

    lastRenderTimeRef.current = currentTime;
    animationFrameRef.current = requestAnimationFrame(renderSignal);
  }, [value, quality, isFingerDetected, rawArrhythmiaData, arrhythmiaStatus, drawGrid, smoothValue]);

  // Setup and cleanup rendering loop
  useEffect(() => {
    renderSignal();
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [renderSignal]);

  return (
    <>
      <div className="absolute top-0 right-1 z-30 flex items-center gap-2 rounded-lg p-2"
           style={{ top: '5px', right: '5px' }}>
        <div className="w-[190px]">
          <div className={`h-1.5 w-full rounded-full bg-gradient-to-r ${getQualityColor(quality)} transition-all duration-1000 ease-in-out`}>
            <div
              className="h-full rounded-full bg-white/20 animate-pulse transition-all duration-1000"
              style={{ width: `${isFingerDetected ? quality : 0}%` }}
            />
          </div>
          <span className="text-[9px] text-center mt-0.5 font-medium transition-colors duration-700 block text-white" 
                style={{ 
                  color: quality > 75 ? '#0EA5E9' : 
                         quality > 50 ? '#F59E0B' : 
                         quality > 30 ? '#DC2626' : '#FF4136' 
                }}>
            {getQualityText(quality)}
          </span>
        </div>

        <div className="flex flex-col items-center">
          <Fingerprint
            className={`h-12 w-12 transition-colors duration-300 ${
              !isFingerDetected ? 'text-gray-400' :
              quality > 75 ? 'text-green-500' :
              quality > 50 ? 'text-yellow-500' :
              quality > 30 ? 'text-orange-500' :
              'text-red-500'
            }`}
            strokeWidth={1.5}
          />
          <span className={`text-[9px] text-center mt-0.5 font-medium ${
            !isFingerDetected ? 'text-gray-400' : 
            quality > 50 ? 'text-green-500' : 'text-yellow-500'
          }`}>
            {isFingerDetected ? "Dedo detectado" : "Ubique su dedo en la Lente"}
          </span>
        </div>
      </div>

      <div className="absolute inset-0 w-full" style={{ height: '50vh', top: 0 }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-full h-full"
          style={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            right: 0, 
            zIndex: 10,
            imageRendering: 'crisp-edges', // Optimize rendering quality
            transform: 'translateZ(0)', // Hardware acceleration
          }}
        />
      </div>
      
      <div className="absolute" style={{ top: 'calc(50vh + 5px)', left: 0, right: 0, textAlign: 'center', zIndex: 30 }}>
        <h1 className="text-xl font-bold">
          <span className="text-white">Chars</span>
          <span className="text-[#ea384c]">Healt</span>
        </h1>
      </div>
    </>
  );
};

export default PPGSignalMeter;
