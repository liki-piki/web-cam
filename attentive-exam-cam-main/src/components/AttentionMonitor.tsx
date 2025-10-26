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

  // Simulate head pose detection (in production, use MediaPipe)
  const detectHeadPose = (): HeadPose => {
    // This is a simplified simulation
    // In production, use @mediapipe/tasks-vision for real pose detection
    
    // Random variation for demo
    const yaw = (Math.random() - 0.5) * 60;
    const pitch = (Math.random() - 0.5) * 40;
    const roll = (Math.random() - 0.5) * 30;
    
    return { yaw, pitch, roll };
  };

  // Simulate device detection (in production, use COCO-SSD)
  const detectDevices = (): DeviceDetectionResult => {
    // This is a simplified simulation
    // In production, use @tensorflow-models/coco-ssd for real detection
    
    return {
      devicesDetected: [],
      hasPhone: false,
      hasTablet: false,
      hasOtherDevice: false,
      confidence: 0,
      timestamp: Date.now(),
    };
  };

  // Main monitoring loop
  useEffect(() => {
    if (!isActive || !videoRef.current) return;

    const monitoringInterval = setInterval(() => {
      try {
        // Detect head pose
        const headPose = detectHeadPose();
        
        // Calculate attention score
        const score = calculateAttentionScore(headPose);
        
        // Create metrics
        const metrics: AttentionMetrics = {
          focusScore: score,
          headPose,
          isLookingAtScreen: isLookingAtScreen(headPose),
          isDistracted: isDistracted(headPose),
          isLookingAway: isLookingAway(headPose),
          timestamp: Date.now(),
        };
        
        // Update state
        setFocusScore(score);
        setFocusLevel(getFocusLevel(score));
        setScoreHistory(prev => [...prev.slice(-59), score]); // Keep last 60 scores
        
        // Generate alert if needed
        const alert = generateAlert(metrics, previousScoreRef.current);
        if (alert) {
          setAlerts(prev => [alert, ...prev.slice(0, 4)]); // Keep last 5 alerts
          onAlertGenerated?.(alert);
        }
        
        // Detect devices
        const deviceResult = detectDevices();
        if (deviceResult.devicesDetected.length > 0) {
          setDeviceDetected(true);
          const alert: AlertEvent = {
            type: 'device_detected',
            severity: getDeviceSeverity(deviceResult),
            message: getDeviceMessage(deviceResult),
            timestamp: Date.now(),
          };
          setAlerts(prev => [alert, ...prev.slice(0, 4)]);
          onAlertGenerated?.(alert);
        } else {
          setDeviceDetected(false);
        }
        
        // Callback
        onMetricsUpdate?.(metrics);
        previousScoreRef.current = score;
      } catch (error) {
        console.error('Error in attention monitoring:', error);
      }
    }, 500); // Update every 500ms

    return () => clearInterval(monitoringInterval);
  }, [isActive, videoRef, onAlertGenerated, onMetricsUpdate]);

  const averageScore = calculateAverageScore(scoreHistory);
  const focusColor = getFocusColor(focusLevel);

  return (
    <div className="space-y-4">
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

      {/* Hidden Canvas for Processing */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default AttentionMonitor;

