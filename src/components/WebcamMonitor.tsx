import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Camera, CameraOff, Eye, EyeOff, Smartphone } from 'lucide-react';
import { videoRecorder } from '@/lib/videoRecorder';

interface Detection {
  status: 'focused' | 'distracted' | 'away';
  deviceDetected: boolean;
  confidence: number;
}

interface WebcamMonitorProps {
  // active: whether camera is active; reason: optional reason when becoming inactive
  onCameraChange?: (active: boolean, reason?: string) => void;
  onRecordingStart?: () => void;
  // When recording stops, the monitor will call this with the recording key (if available)
  // and a boolean indicating whether the save to IndexedDB succeeded.
  onRecordingStop?: (recordingKey?: string, saved?: boolean) => void;
  shouldRecord?: boolean;
}

export const WebcamMonitor = ({ onCameraChange, onRecordingStart, onRecordingStop, shouldRecord }: WebcamMonitorProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [detection, setDetection] = useState<Detection>({
    status: 'away',
    deviceDetected: false,
    confidence: 0,
  });
  const [stream, setStream] = useState<MediaStream | null>(null);
  const coveredCounter = useRef(0);

  useEffect(() => {
    startWebcam();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => {
          try {
            track.stop();
          } catch (e) {
            // ignore
          }
        });
  onCameraChange?.(false, 'camera_off');
      }
    };
  }, []);

  const startWebcam = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        // Try to play the video element (some browsers require an explicit play call)
        try {
          // play() returns a promise; ignore any errors but ensure playback is attempted
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          videoRef.current.play();
        } catch (e) {
          // ignore play errors
        }

        setIsActive(true);
        onCameraChange?.(true);
        // listen for track end events so we can detect when the camera is turned off
        mediaStream.getTracks().forEach((track) => {
          const onEnded = () => {
            setIsActive(false);
            setStream(null);
            onCameraChange?.(false, 'camera_off');
          };
          track.addEventListener('ended', onEnded);
          // cleanup listener when stream changes/stops
          // store a small ref on the track to remove later if needed
        });
      }
    } catch (err) {
      console.error('Error accessing webcam:', err);
      // Notify parent that camera could not be started (permission denied / no device)
      setIsActive(false);
      setErrorMsg((err && (err as any).message) ? (err as any).message : 'Unable to access camera');
      onCameraChange?.(false, 'permission_denied');
    }
  };

  // Handle video recording
  useEffect(() => {
    console.log('Recording effect triggered:', { shouldRecord, hasStream: !!stream, isRecording: videoRecorder.getIsRecording() });

    if (shouldRecord && stream && !videoRecorder.getIsRecording()) {
      // Start recording
      console.log('🎥 Starting recording...');
      const started = videoRecorder.startRecording(stream);
      if (started) {
        onRecordingStart?.();
        console.log('✅ Video recording started');
      } else {
        console.error('❌ Failed to start recording');
      }
    } else if (!shouldRecord && videoRecorder.getIsRecording()) {
      // Stop recording
      console.log('⏹️ Stopping recording...');
      videoRecorder.stopRecording().then((blob) => {
        console.log('Recording stopped, blob size:', blob?.size);
        if (blob && blob.size > 0) {
          // Save to IndexedDB and notify parent only after save completes
          console.log('💾 Saving recording to IndexedDB...');
          const recordingKey = `recording_${Date.now()}`;
          videoRecorder.saveToIndexedDB('ExamGuardDB', 'recordings', recordingKey).then((success) => {
            console.log('Recording save result:', success ? '✅ SUCCESS' : '❌ FAILED');
            try {
              onRecordingStop?.(recordingKey, success);
            } catch (e) {
              // ignore callback errors
            }
          }).catch((err) => {
            console.error('Error saving recording:', err);
            try {
              onRecordingStop?.(undefined, false);
            } catch (e) {
              // ignore
            }
          });
        } else {
          console.warn('⚠️ Recording blob is empty or null');
          try {
            onRecordingStop?.(undefined, false);
          } catch (e) {
            // ignore
          }
        }
        console.log('Video recording stopped');
      });
    }
  }, [shouldRecord, stream]);

  // detect covered camera by sampling video frames and checking brightness
  useEffect(() => {
    if (!isActive || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let sampling = true;
    const sampleInterval = 250; // ms - faster sampling for quicker detection
    const requiredConsecutive = 2; // number of bad samples before consider covered - more sensitive
    canvas.width = 160;
    canvas.height = 120;

    const sampler = async () => {
      if (!sampling) return;
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let sum = 0;
        let sumSq = 0;
        const pxCount = canvas.width * canvas.height;
        for (let i = 0; i < img.data.length; i += 4) {
          // perceived brightness formula
          const r = img.data[i];
          const g = img.data[i + 1];
          const b = img.data[i + 2];
          const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
          sum += brightness;
          sumSq += brightness * brightness;
        }
        const avg = sum / pxCount;
        const variance = Math.max(0, sumSq / pxCount - avg * avg);
        const stdDev = Math.sqrt(variance);

        // Detection heuristics:
        // - very low average brightness (dark cover)
        // - very low standard deviation (uniform color like a hand or cloth)
        const darkThreshold = 60; // increased threshold to detect darker covers or fingers over lens
        const lowStdThreshold = 18; // detect more uniform covers
        const highStdThreshold = 80; // detect sudden very high contrast (completely covered)

        const isDark = avg < darkThreshold;
        const isUniform = stdDev < lowStdThreshold || stdDev > highStdThreshold;

        if (isDark || isUniform) {
          coveredCounter.current += 1;
        } else {
          coveredCounter.current = 0;
        }

        if (coveredCounter.current >= requiredConsecutive) {
          // Treat as covered: notify parent immediately and stop the stream so session can end.
          // Log for debugging
          // eslint-disable-next-line no-console
          console.warn('WebcamMonitor: camera covered detected (avg, stdDev):', avg, stdDev, 'coveredCount:', coveredCounter.current);

          // Notify parent first so the page can act (auto-submit) immediately
          onCameraChange?.(false, 'camera_covered');

          setIsActive(false);
          try {
            // stop camera tracks to release device and trigger any 'ended' handlers
            if (stream) {
              stream.getTracks().forEach((t) => {
                try {
                  t.stop();
                } catch (e) {
                  // ignore
                }
              });
              setStream(null);
            }
          } catch (e) {
            // ignore
          }

          coveredCounter.current = 0;
          sampling = false;
          return;
        }
      } catch (e) {
        // ignore sampling errors
      }
      setTimeout(sampler, sampleInterval);
    };

    sampler();

    return () => {
      sampling = false;
    };
  }, [isActive]);

  const getStatusColor = (status: Detection['status']) => {
    switch (status) {
      case 'focused':
        return 'bg-success text-success-foreground';
      case 'distracted':
        return 'bg-warning text-warning-foreground';
      case 'away':
        return 'bg-destructive text-destructive-foreground';
    }
  };

  const getStatusIcon = (status: Detection['status']) => {
    switch (status) {
      case 'focused':
        return <Eye className="w-4 h-4" />;
      case 'distracted':
        return <EyeOff className="w-4 h-4" />;
      case 'away':
        return <CameraOff className="w-4 h-4" />;
    }
  };

  return (
    <Card className="overflow-hidden border-2 shadow-lg">
      <div className="relative bg-muted">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-auto"
        />
        <canvas ref={canvasRef} className="hidden" />
        {/* If camera failed to start, show retry UI */}
        {!isActive && errorMsg && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="bg-background/90 p-4 rounded shadow-md text-center">
              <p className="font-medium text-sm text-destructive">Camera access error</p>
              <p className="text-xs text-muted-foreground mb-3">{errorMsg}</p>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => {
                    setErrorMsg(null);
                    startWebcam();
                  }}
                  className="px-3 py-1 rounded border bg-primary/10"
                >
                  Retry
                </button>
                <button
                  onClick={() => {
                    // give a hint to the user to enable camera in site settings
                    setErrorMsg(null);
                    alert('Please check your browser site permissions to allow camera access, then retry.');
                  }}
                  className="px-3 py-1 rounded border"
                >
                  Help
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Status overlay */}
        <div className="absolute top-4 left-4 flex gap-2">
          <Badge className={getStatusColor(detection.status)}>
            {getStatusIcon(detection.status)}
            <span className="ml-2 capitalize">{detection.status}</span>
          </Badge>
          {isActive && (
            <Badge variant="secondary" className="gap-2">
              <Camera className="w-4 h-4 animate-pulse" />
              Live
            </Badge>
          )}
        </div>

        {/* Device detection alert */}
        {detection.deviceDetected && (
          <div className="absolute top-4 right-4">
            <Badge className="bg-destructive text-destructive-foreground gap-2">
              <Smartphone className="w-4 h-4" />
              Device Detected
            </Badge>
          </div>
        )}

        {/* Confidence indicator */}
        <div className="absolute bottom-4 left-4 right-4">
          <div className="bg-background/80 backdrop-blur-sm rounded-lg p-2">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-muted-foreground">Detection Confidence</span>
              <span className="font-semibold">{Math.round(detection.confidence * 100)}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-primary transition-all duration-300"
                style={{ width: `${detection.confidence * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};
