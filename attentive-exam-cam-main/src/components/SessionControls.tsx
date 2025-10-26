import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Pause, Square, Clock } from 'lucide-react';

interface SessionControlsProps {
  onStart: () => void;
  onPause: () => void;
  onStop: (reason?: string) => void;
  cameraActive?: boolean;
  // increments whenever parent requests an external stop/reset (e.g., camera covered/off/tab hidden)
  externalStopCounter?: number;
}

export const SessionControls = ({ onStart, onPause, onStop, cameraActive, externalStopCounter }: SessionControlsProps) => {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning && !isPaused) {
      interval = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning, isPaused]);

  // Pause the session automatically when the camera becomes inactive
  useEffect(() => {
    // cameraActive handling moved to parent (Index) so it can pass a reason when ending session
    }, [/* cameraActive intentionally not observed here */]);

    // React to external stop requests from parent (reset timer/UI when counter changes)
    useEffect(() => {
      if (typeof externalStopCounter !== 'undefined' && isRunning) {
        setIsRunning(false);
        setIsPaused(false);
        setElapsed(0);
        // Do NOT call onStop here; parent already initiated the stop and created alerts
      }
    }, [externalStopCounter]);

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStart = () => {
    setIsRunning(true);
    setIsPaused(false);
    onStart();
  };

  const handlePause = () => {
    setIsPaused(!isPaused);
    onPause();
  };

  const handleStop = () => {
    setIsRunning(false);
    setIsPaused(false);
    setElapsed(0);
    onStop();
  };

  return (
    <Card className="shadow-md">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Clock className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Session Duration</p>
              <p className="text-3xl font-bold font-mono tracking-tight">{formatTime(elapsed)}</p>
            </div>
          </div>
          {isRunning && !isPaused && (
            <div className="flex items-center gap-2 text-success">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-sm font-medium">Recording</span>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          {!isRunning ? (
            <Button
              onClick={handleStart}
              className="flex-1 bg-gradient-primary hover:opacity-90"
              size="lg"
            >
              <Play className="w-5 h-5 mr-2" />
              Start Session
            </Button>
          ) : (
            <>
              <Button
                onClick={handlePause}
                variant="secondary"
                size="lg"
                className="flex-1"
              >
                <Pause className="w-5 h-5 mr-2" />
                {isPaused ? 'Resume' : 'Pause'}
              </Button>
              <Button
                onClick={handleStop}
                variant="destructive"
                size="lg"
                className="flex-1"
              >
                <Square className="w-5 h-5 mr-2" />
                End Session
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
