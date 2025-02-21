
import React, { useRef, useEffect, useState } from 'react';
import { Fingerprint } from 'lucide-react';

interface CameraViewProps {
  onStreamReady?: (stream: MediaStream) => void;
  isMonitoring: boolean;
}

const CameraView = ({ onStreamReady, isMonitoring }: CameraViewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isFingerDetected, setIsFingerDetected] = useState(false);

  const stopCamera = async () => {
    if (stream) {
      const tracks = stream.getTracks();
      tracks.forEach(track => {
        if (track.getCapabilities()?.torch) {
          track.applyConstraints({
            advanced: [{ torch: false }]
          }).catch(err => console.error("Error desactivando linterna:", err));
        }
        track.stop();
      });
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setStream(null);
    }
  };

  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("getUserMedia no está soportado");
      }

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      const videoTrack = newStream.getVideoTracks()[0];
      
      if (videoTrack.getCapabilities()?.torch) {
        await videoTrack.applyConstraints({
          advanced: [{ torch: true }]
        });
      }

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }

      setStream(newStream);
      
      if (onStreamReady) {
        onStreamReady(newStream);
      }
    } catch (err) {
      console.error("Error al iniciar la cámara:", err);
    }
  };

  useEffect(() => {
    if (isMonitoring && !stream) {
      startCamera();
    } else if (!isMonitoring && stream) {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isMonitoring]);

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ objectFit: 'cover' }}
        className="absolute top-0 left-0 min-w-full min-h-full w-auto h-auto z-0"
      />
      <canvas
        ref={canvasRef}
        width={320}
        height={240}
        className="hidden"
      />
      {isMonitoring && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20">
          <Fingerprint
            size={64}
            className={`transition-colors duration-300 ${
              isFingerDetected ? 'text-green-500' : 'text-gray-400'
            }`}
          />
        </div>
      )}
    </>
  );
};

export default CameraView;
