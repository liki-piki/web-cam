import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Eye, AlertTriangle } from 'lucide-react';
import {
  calculateAttentionScore,
  isLookingAtScreen,
  isDistracted,
  isLookingAway,
  generateAlert,
  calculateAverageScore,
  getFocusLevel,
  getFocusColor,
  AttentionMetrics,
  AlertEvent,
  HeadPose,
} from '@/lib/attentionScoring';
import {
  processDetections,
  getDeviceSeverity,
  getDeviceMessage,
  DeviceDetectionResult,
} from '@/lib/deviceDetection';

interface AttentionMonitorProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  isActive: boolean;
  onAlertGenerated?: (alert: AlertEvent) => void;
  onMetricsUpdate?: (metrics: AttentionMetrics) => void;
}

export const AttentionMonitor = ({
  videoRef,
  isActive,
  onAlertGenerated,
  onMetricsUpdate,
}: AttentionMonitorProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [focusScore, setFocusScore] = useState(100);
  const [focusLevel, setFocusLevel] = useState<'focused' | 'distracted' | 'away'>('focused');
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [deviceDetected, setDeviceDetected] = useState(false);
  const [scoreHistory, setScoreHistory] = useState<number[]>([]);
  const previousScoreRef = useRef(100);

  // Progressive enhancement: try to use real models if available
  const tfModelRef = useRef<any>(null);
  const faceDetectorRef = useRef<any>(null as any);
  const modelLoadingRef = useRef(false);
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [modelError, setModelError] = useState<string | null>(null);
  // Extremely sensitive settings for debugging — lower back after tests
  const detectionThreshold = 0.05; // confidence threshold for phone detection
  // multi-frame aggregation for transient detection noise
  const phoneWindowRef = useRef<number[]>([]);
  const phoneWindowSize = 3; // examine last N frames
  const phoneRequiredCount = 1; // require phone to appear in at least this many frames
  const debugLowConfidence = true; // when true, log lower-confidence detections for debugging
  const debugAlwaysLogPredictions = true; // log all predictions each frame to console (verbose)
  const phoneAlertEmittedRef = useRef(false);

  // Estimate head pose from face bounding box (approximation)
  const estimateHeadPoseFromBox = (box: {x: number; y: number; width: number; height: number}, canvasW: number, canvasH: number): HeadPose => {
    // center offsets normalized -1..1
    const cx = (box.x + box.width / 2) / canvasW;
    const cy = (box.y + box.height / 2) / canvasH;
    const nx = (cx - 0.5) * 2; // -1 left, 1 right
    const ny = (cy - 0.5) * 2; // -1 top, 1 bottom

    // Map to plausible angles
    const yaw = nx * 45; // left-right up to 45deg
    const pitch = ny * 30; // up-down up to 30deg
    const roll = 0; // unknown from bbox

    return { yaw, pitch, roll };
  };

  // Load optional models: coco-ssd for object detection (phone) and FaceDetector API for face bbox
  const ensureModelsLoaded = async () => {
    if (modelLoadingRef.current) return;
    modelLoadingRef.current = true;
    setModelStatus('loading');

    // Try browser FaceDetector API
    try {
      const FD = (window as any).FaceDetector;
      if (FD) {
        faceDetectorRef.current = new FD({ fastMode: true });
      }
    } catch (err) {
      // ignore
      faceDetectorRef.current = null;
    }

    // Try to load tf + coco-ssd dynamically for phone detection
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const tf = await import('@tensorflow/tfjs');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const coco = await import('@tensorflow-models/coco-ssd');
      // ensure TF ready
      await tf.ready();
      // log backend info
      try {
        // eslint-disable-next-line no-console
        console.log('tf backend before load:', tf.getBackend());
      } catch (e) {
        // ignore
      }

      // attempt to load model; if WebGL backend fails, try CPU fallback
      try {
        tfModelRef.current = await coco.load();
        setModelStatus('ready');
        setModelError(null);
        // eslint-disable-next-line no-console
        console.log('coco-ssd loaded on backend:', tf.getBackend());
      } catch (innerErr) {
        // try CPU fallback
        try {
          // eslint-disable-next-line no-console
          console.warn('coco-ssd load failed on backend, trying CPU fallback', innerErr);
          if (tf.setBackend) {
            // switch to cpu backend
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            tf.setBackend('cpu');
            await tf.ready();
          }
          tfModelRef.current = await coco.load();
          setModelStatus('ready');
          setModelError(null);
          // eslint-disable-next-line no-console
          console.log('coco-ssd loaded on CPU backend');
        } catch (cpuErr) {
          // final failure
          // eslint-disable-next-line no-console
          console.error('coco-ssd failed to load on both backends', cpuErr);
          tfModelRef.current = null;
          setModelStatus('unavailable');
          setModelError(String(cpuErr));
        }
      }
    } catch (err) {
      // model not available — we'll fallback to heuristics
      tfModelRef.current = null;
      setModelStatus('unavailable');
      setModelError(String(err));
      // eslint-disable-next-line no-console
      console.error('Error importing tf/coco:', err);
    }
  };

  // Main monitoring loop
  useEffect(() => {
    if (!isActive || !videoRef.current) return;

    let running = true;
    let timeoutId: number | null = null;

    (async () => {
      await ensureModelsLoaded();

  const canvas = canvasRef.current as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');
      const video = videoRef.current as HTMLVideoElement;
      if (!ctx || !video) return;

  // use a larger canvas for detection to improve small-object accuracy
  canvas.width = 640;
  canvas.height = 480;

  const loop = async () => {
        if (!running || !video || video.readyState < 2) {
          if (running) timeoutId = window.setTimeout(loop, 300);
          return;
        }

          try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          // 1) Face detection via FaceDetector API (fast) to get bbox
          let faceBox: {x:number;y:number;width:number;height:number} | null = null;
          try {
            if (faceDetectorRef.current) {
              const faces = await faceDetectorRef.current.detect(video);
              if (faces && faces.length > 0) {
                const f = faces[0].boundingBox || faces[0].box || faces[0];
                faceBox = { x: f.x || 0, y: f.y || 0, width: f.width || (f.right - f.left) || 0, height: f.height || (f.bottom - f.top) || 0 };
              }
            }
          } catch (e) {
            faceBox = null;
          }

          // 2) If no FaceDetector, try a cheap skin-tone detection to approximate center (best-effort)
          if (!faceBox) {
            // compute brightness centroid as fallback
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            let sumX = 0, sumY = 0, count = 0;
            for (let y = 0; y < canvas.height; y += 4) {
              for (let x = 0; x < canvas.width; x += 4) {
                const i = (y * canvas.width + x) * 4;
                const r = img.data[i], g = img.data[i+1], b = img.data[i+2];
                // simple skin-ish heuristic
                const isSkin = r > 95 && g > 40 && b > 20 && (Math.max(r,g,b) - Math.min(r,g,b)) > 15 && r > g && r > b;
                if (isSkin) {
                  sumX += x; sumY += y; count++;
                }
              }
            }
            if (count > 0) {
              const cx = sumX / count; const cy = sumY / count;
              faceBox = { x: Math.max(0, cx - 40), y: Math.max(0, cy - 60), width: 80, height: 120 };
            }
          }

          // Estimate head pose
          let headPose: HeadPose = { yaw: 0, pitch: 0, roll: 0 };
          if (faceBox) {
            headPose = estimateHeadPoseFromBox(faceBox, canvas.width, canvas.height);
          }

          // 3) Phone / object detection using coco-ssd if available
          let phoneDetected = false;
          let phoneLabels: string[] = [];
          try {
            if (tfModelRef.current) {
              // run detection on canvas
              // @ts-ignore
              const predictions: any[] = await tfModelRef.current.detect(canvas);
              if (predictions && predictions.length > 0) {
                // draw prediction boxes for debugging/visual feedback
                try {
                  ctx.lineWidth = 2;
                  ctx.font = '12px Arial';
                  ctx.fillStyle = 'red';
                  ctx.strokeStyle = 'red';
                } catch (e) {
                  // ignore canvas style errors
                }

                for (const p of predictions) {
                  const cls = (p.class || '').toString().toLowerCase();
                  // coco-ssd predictions include bbox: [x, y, width, height]
                  const bbox = p.bbox || p.boundingBox || null;
                  if (bbox && bbox.length === 4) {
                    const [x, y, w, h] = bbox;
                    try {
                      ctx.strokeRect(x, y, w, h);
                      const label = `${p.class} ${Math.round((p.score || 0) * 100)}%`;
                      ctx.fillText(label, x, Math.max(12, y - 4));
                    } catch (e) {
                      // drawing may fail on some platforms
                    }
                  }
                  const score = (p.score || 0);
                  // verbose per-prediction logging to help debug misses
                  if (debugAlwaysLogPredictions) {
                    // eslint-disable-next-line no-console
                    console.log('prediction:', { class: p.class, score });
                  }

                  if (score >= detectionThreshold && (cls.includes('cell phone') || cls.includes('phone') || cls.includes('mobile'))) {
                      // mark this frame as a phone detection
                      phoneDetected = true;
                      phoneLabels.push(`${p.class} (${Math.round(score * 100)}%)`);
                  } else if (score >= detectionThreshold) {
                    // also log other detections that might be confused with phone
                    // eslint-disable-next-line no-console
                    console.log('other detection (high confidence):', p.class, score);
                  } else if (debugLowConfidence && score >= 0.02) {
                    // helpful debug: log lower-confidence predictions so we can tune thresholds
                    // eslint-disable-next-line no-console
                    console.debug('low-confidence detection:', p.class, score);
                  }
                }
                
                // log predictions for debugging (frame)
                if (debugAlwaysLogPredictions) {
                  // eslint-disable-next-line no-console
                  console.log('coco-ssd predictions (frame):', predictions);
                }
                // also draw a compact prediction list on the canvas for quick visual debugging
                try {
                  ctx.save();
                  ctx.fillStyle = 'rgba(0,0,0,0.6)';
                  const list = predictions || [];
                  const height = Math.min(140, 18 * (Math.min(list.length, 6) + 1));
                  ctx.fillRect(8, 8, 260, height);
                  ctx.fillStyle = '#fff';
                  ctx.font = '12px Arial';
                  if (list.length > 0) {
                    const top = list.slice(0, 6);
                    for (let i = 0; i < top.length; i++) {
                      const p = top[i];
                      const text = `${p.class} ${(p.score * 100).toFixed(0)}%`;
                      ctx.fillText(text, 12, 26 + i * 18);
                    }
                  } else {
                    ctx.fillText('no predictions', 12, 26);
                  }
                  ctx.restore();
                } catch (e) {
                  // ignore canvas draw issues
                }
              }
            }
          } catch (err) {
            // ignore
          }

          // Calculate base score
          let score = calculateAttentionScore(headPose);
          // Penalize heavily if phone detected in frame
          if (phoneDetected) score = Math.max(0, score - 45);

          const metrics: AttentionMetrics = {
            focusScore: score,
            headPose,
            isLookingAtScreen: isLookingAtScreen(headPose),
            isDistracted: isDistracted(headPose),
            isLookingAway: isLookingAway(headPose),
            timestamp: Date.now(),
          };

          // Update UI
          setFocusScore(score);
          setFocusLevel(getFocusLevel(score));
          setScoreHistory(prev => [...prev.slice(-59), score]);

          // Alerts from head pose
          const alert = generateAlert(metrics, previousScoreRef.current);
          if (alert) {
            setAlerts(prev => [alert, ...prev.slice(0, 4)]);
            onAlertGenerated?.(alert);
          }

          // Multi-frame aggregation: push 1/0 into sliding window and decide
          try {
            const w = phoneWindowRef.current;
            w.push(phoneDetected ? 1 : 0);
            if (w.length > phoneWindowSize) w.shift();
            const sum = w.reduce((s, v) => s + v, 0);

            if (sum >= phoneRequiredCount && !phoneAlertEmittedRef.current) {
              // emit phone alert once until cleared
              phoneAlertEmittedRef.current = true;
              setDeviceDetected(true);
              const deviceAlert: AlertEvent = {
                type: 'device_detected',
                severity: 'high',
                message: `Phone detected in frame: ${phoneLabels.join(', ')}`,
                timestamp: Date.now(),
              };
              setAlerts(prev => [deviceAlert, ...prev.slice(0, 4)]);
              onAlertGenerated?.(deviceAlert);
            } else if (sum < 1) {
              // no phone in recent frames - clear state so future detections can re-trigger
              phoneAlertEmittedRef.current = false;
              setDeviceDetected(false);
            }
          } catch (e) {
            // fallback: previous single-frame behavior
            if (phoneDetected) {
              setDeviceDetected(true);
              const deviceAlert: AlertEvent = {
                type: 'device_detected',
                severity: 'high',
                message: `Phone detected in frame: ${phoneLabels.join(', ')}`,
                timestamp: Date.now(),
              };
              setAlerts(prev => [deviceAlert, ...prev.slice(0, 4)]);
              onAlertGenerated?.(deviceAlert);
            } else {
              setDeviceDetected(false);
            }
          }

          // Callback metrics
          onMetricsUpdate?.(metrics);
          previousScoreRef.current = score;
        } catch (err) {
          console.error('AttentionMonitor loop error:', err);
        }

        timeoutId = window.setTimeout(loop, 300);
      };

      loop();
    })();

    return () => {
      running = false;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [isActive, videoRef, onAlertGenerated, onMetricsUpdate]);

  const averageScore = calculateAverageScore(scoreHistory);
  const focusColor = getFocusColor(focusLevel);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Model: {modelStatus}</div>
        {modelStatus === 'loading' && (
          <div className="text-xs text-muted-foreground">(loading detection model...)</div>
        )}
      </div>
      {/* Focus Score Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Attention Score</CardTitle>
            <Badge
              style={{
                backgroundColor: focusColor,
                color: 'white',
              }}
            >
              {focusLevel.toUpperCase()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Score Display */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Current Score</p>
              <p className="text-3xl font-bold" style={{ color: focusColor }}>
                {focusScore}%
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Average (60s)</p>
              <p className="text-2xl font-semibold">{averageScore}%</p>
            </div>
          </div>

          {/* Score Bar */}
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all duration-300"
              style={{
                width: `${focusScore}%`,
                backgroundColor: focusColor,
              }}
            />
          </div>

          {/* Status Indicators */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="p-2 bg-muted rounded text-center">
              <p className="text-muted-foreground">Looking at Screen</p>
              <p className="font-semibold">
                {isLookingAtScreen({ yaw: 0, pitch: 0, roll: 0 }) ? '✓' : '✗'}
              </p>
            </div>
            <div className="p-2 bg-muted rounded text-center">
              <p className="text-muted-foreground">Distracted</p>
              <p className="font-semibold">
                {isDistracted({ yaw: 0, pitch: 0, roll: 0 }) ? '✓' : '✗'}
              </p>
            </div>
            <div className="p-2 bg-muted rounded text-center">
              <p className="text-muted-foreground">Device Detected</p>
              <p className="font-semibold">{deviceDetected ? '⚠️' : '✓'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alerts Card */}
      {alerts.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <CardTitle className="text-base">Recent Alerts</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {alerts.map((alert, idx) => (
                <div
                  key={idx}
                  className="p-2 bg-background rounded border border-destructive/20 text-sm"
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-destructive">{alert.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(alert.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Canvas for Processing and overlay (visible for debugging) */}
      <canvas ref={canvasRef} className="w-full h-auto border rounded" />
    </div>
  );
};

export default AttentionMonitor;

