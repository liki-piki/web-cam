import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { createAlert, saveAlert, saveSession } from '@/lib/alertStorage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { WebcamMonitor } from '@/components/WebcamMonitor';
import { AttentionMonitor } from '@/components/AttentionMonitor';
import { cn, getTestByCode, Test } from '@/lib/utils';
import { getAllRecordings, updateRecordingMetadata, saveSubmission as saveSubmissionToStore } from '@/lib/testStorage';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, CheckCircle, Clock, LayoutGrid, Zap } from 'lucide-react';
import { AlertEvent, AttentionMetrics } from '@/lib/attentionScoring';
// Use centralized testStorage helpers so dashboard and recordings pages read the
// same storage (IndexedDB/localStorage) and get updated when tests complete.
// - getAllRecordings / updateRecordingMetadata operate on IndexedDB recordings store
// - saveSubmissionToStore writes submissions to the key the Dashboard reads

// Define StudentAnswer type
interface StudentAnswer {
  questionId: string;
  answer: string;
  isCorrect?: boolean;
  pointsEarned?: number;
}

// Add this helper function above the TakeTest component
function gradeSubmission(test: Test, answers: StudentAnswer[]): StudentAnswer[] {
  return answers.map((answer, idx) => {
    const question = test.questions[idx];
    let isCorrect = false;
    let pointsEarned = 0;

    // Ensure question.type exists, fallback to guessing type if missing
    const questionType = (question as any).type || (question.options ? 'multiple-choice' : 'text');

    if (questionType === 'multiple-choice') {
      // Use correctAnswer as string if possible, otherwise compare index
      let correctAnswer: string = '';
      if (typeof question.correctAnswer === 'string') {
        correctAnswer = (question.correctAnswer as string).trim().toLowerCase();
      } else if (
        typeof question.correctAnswer === 'number' &&
        Array.isArray(question.options) &&
        typeof question.options[question.correctAnswer] === 'string'
      ) {
        correctAnswer = question.options[question.correctAnswer].trim().toLowerCase();
      }
      isCorrect = answer.answer.trim().toLowerCase() === correctAnswer;
      pointsEarned = isCorrect ? ((question as any).points ?? 0) : 0;
    } else if (questionType === 'text') {
      isCorrect = answer.answer.trim().length > 0;
      pointsEarned = isCorrect ? ((question as any).points ?? 0) : 0;
    }

    return {
      ...answer,
      isCorrect,
      pointsEarned,
    };
  });
}

const TakeTest = () => {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [testCode, setTestCode] = useState('');
  const [test, setTest] = useState<Test | null>(null);
  const [isTestStarted, setIsTestStarted] = useState(false);
  const [isTestSubmitted, setIsTestSubmitted] = useState(false);
  const [cameraActive, setCameraActive] = useState<boolean | undefined>(undefined);
  const [studentName, setStudentName] = useState('');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [studentAnswers, setStudentAnswers] = useState<StudentAnswer[]>([]);
  const [submissionResult, setSubmissionResult] = useState<any>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [monitoringAlerts, setMonitoringAlerts] = useState<AlertEvent[]>([]);
  const [currentMetrics, setCurrentMetrics] = useState<AttentionMetrics | null>(null);
  const [lastSavedRecordingKey, setLastSavedRecordingKey] = useState<string | null>(null);

  // Pre-test setup states
  const [testCodeEntered, setTestCodeEntered] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionElapsed, setSessionElapsed] = useState(0);

  // Layout state
  const [layoutMode, setLayoutMode] = useState<'grid' | 'flow'>('grid');

  // Auto-start session when test code is entered
  useEffect(() => {
    if (testCodeEntered && !sessionStarted) {
      setSessionStarted(true);
    }
  }, [testCodeEntered, sessionStarted]);

  // Session elapsed timer
  useEffect(() => {
    if (!sessionStarted) return;

    const timer = setInterval(() => {
      setSessionElapsed(prev => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [sessionStarted]);

  // Timer effect
  useEffect(() => {
    if (!isTestStarted || isTestSubmitted || !test) return;

    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          handleSubmitTest();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isTestStarted, isTestSubmitted, test]);

  // Tab visibility change - end test if student leaves tab
  useEffect(() => {
    if (!isTestStarted || isTestSubmitted) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is hidden - end the test
        toast({
          title: "Test Ended",
          description: "You left the test tab. Your test has been automatically submitted.",
          variant: "destructive",
        });
        handleSubmitTest();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isTestStarted, isTestSubmitted]);

  const handleValidateTestCode = (e: React.FormEvent) => {
    e.preventDefault();

    if (!testCode.trim()) {
      toast({
        title: "Error",
        description: "Please enter a test code",
        variant: "destructive",
      });
      return;
    }

    if (!studentName.trim()) {
      toast({
        title: "Error",
        description: "Please enter your name",
        variant: "destructive",
      });
      return;
    }

    const foundTest = getTestByCode(testCode.toUpperCase());
    if (!foundTest) {
      toast({
        title: "Error",
        description: "Invalid test code. Please check and try again.",
        variant: "destructive",
      });
      return;
    }

    setTest(foundTest);
    setTestCodeEntered(true);
    toast({
      title: "Success",
      description: "Test code validated! Now set up your camera and session.",
    });
  };

  const handleStartTest = () => {
    // Validate camera is active
    if (cameraActive !== true) {
      toast({
        title: "Camera Required",
        description: "Please ensure your camera is active and working before starting the test.",
        variant: "destructive",
      });
      return;
    }
    
    // detect mobile/phone usage
    const userAgent = navigator.userAgent || '';
    const isMobile = /Mobi|Android|iPhone|iPad|iPod|Phone/i.test(userAgent) || (window.matchMedia && window.matchMedia('(pointer:coarse)').matches) || window.innerWidth <= 768;

    // Create and save initial session (include device info)
    saveSession({
      testCode: test!.code,
      studentName,
      startTime: new Date().toISOString(),
      alerts: [],
      attentionScore: 100,
      status: 'active',
      deviceInfo: {
        isMobile,
        userAgent,
      }
    });

    // Validate session is started
    if (!sessionStarted) {
      toast({
        title: "Session Required",
        description: "Please start the monitoring session before beginning the test.",
        variant: "destructive",
      });
      return;
    }

    setIsTestStarted(true);
    setTimeRemaining(Number(test!.duration) * 60);
    setStudentAnswers(test!.questions.map(q => ({ questionId: String(q.id), answer: '' })));
    toast({
      title: "Success",
      description: "Test started! Good luck!",
    });
  };



  const handleAnswerChange = (answer: string) => {
    const newAnswers = [...studentAnswers];
    newAnswers[currentQuestionIndex] = {
      ...newAnswers[currentQuestionIndex],
      answer,
    };
    setStudentAnswers(newAnswers);
  };

  const handleNextQuestion = () => {
    if (test && currentQuestionIndex < test.questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleSubmitTest = async () => {
    if (!test) return;

    // IMPORTANT: Stop recording FIRST before doing anything else
    console.log('Stopping recording before submission...');
    // capture previous key so we can detect new saves
    const previousKey = lastSavedRecordingKey;
    setIsTestStarted(false); // This triggers recording stop in WebcamMonitor

    // Wait up to 5 seconds for the recording to be saved and its key to appear
    const waitForSavedRecording = async (timeout = 5000) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        if (lastSavedRecordingKey && lastSavedRecordingKey !== previousKey) {
          return lastSavedRecordingKey;
        }
        // small delay
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 200));
      }
      return null;
    };

    const savedKey = await waitForSavedRecording(5000);
    if (savedKey) {
      console.log('Recorded video saved with key:', savedKey);
    } else {
      console.warn('No saved recording key detected within timeout. Falling back to scanning all recordings.');
      // small pause to give IndexedDB another chance
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    // Grade the submission
    const gradedAnswers = gradeSubmission(test, studentAnswers);
    const totalScore = gradedAnswers.reduce((sum, a) => sum + (a.pointsEarned || 0), 0);
    const totalPoints = test.questions.reduce((sum, q) => sum + ((q as any).points || 0), 0);
    const percentage = Math.round((totalScore / totalPoints) * 100);
    // Save submission to central store (or send to server)
    const submission = {
      testCode: test.code,
      studentName,
      answers: gradedAnswers,
      submittedAt: new Date().toISOString(),
      totalScore,
      totalPoints,
      percentage,
    };
    // Convert answer shape to testStorage expected types (questionId should be number)
    const submissionForStore = {
      ...submission,
      answers: submission.answers.map(a => ({
        questionId: Number(a.questionId),
        answer: a.answer,
        isCorrect: a.isCorrect,
        pointsEarned: a.pointsEarned,
      })),
    };

    // write using shared helper so Dashboard can read it
    saveSubmissionToStore(submissionForStore);

    // Update the most recent recording with test code and student name
    try {
      // If we have a savedKey from the recorder, update that one first
      if (savedKey) {
        const success = await updateRecordingMetadata(savedKey, test.code, studentName);
        if (success) {
          console.log('Recording metadata updated for key:', savedKey);
        } else {
          console.warn('Failed to update metadata for saved key, falling back to scanning all recordings');
        }
      }

      // fallback: scan all recordings and update the most recent one without metadata
      const recordings = await getAllRecordings();
      console.log('Recordings found:', recordings.length);
      if (recordings.length > 0) {
        // find the most recent recording without testCode
        const latestRecording = [...recordings].reverse().find(r => !r.testCode);
        if (latestRecording) {
          await updateRecordingMetadata(latestRecording.key, test.code, studentName);
          console.log('Recording metadata updated (fallback) for key:', latestRecording.key);
        }
      }
    } catch (error) {
      console.error('Error updating recording metadata:', error);
    }

    setSubmissionResult(submission);
    setIsTestSubmitted(true);

    toast({
      title: "Test Submitted",
      description: `Your score: ${totalScore}/${totalPoints} (${percentage}%)`,
    });
  };

  const handleClearSession = () => {
    setTestCode('');
    setTest(null);
    setIsTestStarted(false);
    setIsTestSubmitted(false);
    setStudentName('');
    setCurrentQuestionIndex(0);
    setStudentAnswers([]);
    setSubmissionResult(null);
    setCameraActive(false);
  };

  const handleCameraChange = (active: boolean, reason?: string) => {
    // Debug log camera state changes
    // eslint-disable-next-line no-console
    console.log('handleCameraChange called:', { active, reason, isTestStarted, isTestSubmitted });

    setCameraActive(active);
    if (!active && isTestStarted && !isTestSubmitted) {
      // Camera turned off or covered during test - automatically submit
      const reasonMessage = reason === 'camera_covered'
        ? 'Camera was covered during the test.'
        : 'Camera was turned off during the test.';

      // Create and save alert
      const alert = createAlert(
        test!.code,
        studentName,
        reason === 'camera_covered' ? 'camera_covered' : 'camera_off',
        reasonMessage,
        'high'
      );
      saveAlert(alert);

      // Update session status
      saveSession({
        testCode: test!.code,
        studentName,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        alerts: [alert],
        attentionScore: 0,
        status: 'terminated',
        deviceInfo: {
          isMobile: /Mobi|Android|iPhone|iPad|iPod|Phone/i.test(navigator.userAgent || ''),
          userAgent: navigator.userAgent || ''
        }
      });

      toast({
        title: "Test Ended - Camera Issue",
        description: `${reasonMessage} Your test has been automatically submitted.`,
        variant: "destructive",
      });

      // Automatically submit the test
      handleSubmitTest();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Show submission result
  if (isTestSubmitted && submissionResult) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Card className={submissionResult.percentage >= 60 ? "border-success/50 bg-success/5" : "border-warning/50 bg-warning/5"}>
            <CardHeader>
              <CardTitle className={submissionResult.percentage >= 60 ? "text-success" : "text-warning"}>
                {submissionResult.percentage >= 60 ? "✓ Test Submitted Successfully!" : "Test Submitted"}
              </CardTitle>
              <CardDescription>Your test has been graded</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Student Name</Label>
                <p className="text-lg font-semibold">{submissionResult.studentName}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
                  <p className="text-sm text-muted-foreground mb-1">Your Score</p>
                  <p className="text-3xl font-bold text-primary">
                    {submissionResult.totalScore}/{submissionResult.totalPoints}
                  </p>
                </div>
                <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
                  <p className="text-sm text-muted-foreground mb-1">Percentage</p>
                  <p className="text-3xl font-bold text-primary">
                    {submissionResult.percentage}%
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <Label>Answer Summary</Label>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {test?.questions.map((q, idx) => {
                    const answer = submissionResult.answers[idx];
                    const isCorrect = answer?.isCorrect;
                    return (
                      <div key={q.id} className={`p-3 rounded-lg border ${isCorrect ? 'bg-success/10 border-success/30' : 'bg-muted/50 border-muted'}`}>
                        <div className="flex items-start gap-2">
                          {isCorrect ? (
                            <CheckCircle className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                          ) : (
                            <AlertCircle className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
                          )}
                          <div className="flex-1">
                            <p className="font-medium text-sm">Q{idx + 1}: {q.text.substring(0, 50)}...</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Your answer: {answer?.answer || '(No answer)'}
                            </p>
                            {(q as any).type === 'multiple-choice' || q.options ? (
                              <p className="text-xs text-muted-foreground">
                                Correct answer: {q.correctAnswer}
                              </p>
                            ) : null}
                            <p className="text-xs font-medium mt-1">
                              {answer?.pointsEarned || 0}/{(q as any).points} points
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-3">
                <Button onClick={handleClearSession} variant="outline" className="flex-1">
                  Take Another Test
                </Button>
                <Button onClick={() => window.location.href = '/dashboard'} className="flex-1">
                  View Results
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Pre-test setup screen - validate code and setup camera/session
  if (!testCodeEntered) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Take a Test</CardTitle>
              <CardDescription>Enter your details to begin</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleValidateTestCode} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="studentName">Your Name</Label>
                  <Input
                    id="studentName"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder="Enter your full name"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="testCode">Test Code</Label>
                  <Input
                    id="testCode"
                    value={testCode}
                    onChange={(e) => setTestCode(e.target.value.toUpperCase())}
                    placeholder="Enter your test code (e.g. STD-ABC123)"
                    maxLength={16}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Ask your instructor for the test code
                  </p>
                </div>

                <Button type="submit" className="w-full">
                  Next: Setup Camera & Session
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Pre-test setup screen - camera and session must be active
  if (!isTestStarted && testCodeEntered && test) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-card shadow-sm">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Test Setup</h1>
                <p className="text-sm text-muted-foreground">{test.title}</p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setTestCodeEntered(false);
                  setTest(null);
                  setTestCode('');
                  setStudentName('');
                }}
              >
                Back
              </Button>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* Left Column - Camera Setup */}
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${cameraActive ? 'bg-success animate-pulse' : 'bg-muted'}`} />
                    Camera Setup
                  </CardTitle>
                  <CardDescription>
                    {cameraActive ? 'Camera is active' : 'Waiting for camera...'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <WebcamMonitor
                    onCameraChange={handleCameraChange}
                    shouldRecord={sessionStarted}
                    onRecordingStop={(key, saved) => {
                      if (saved && key) setLastSavedRecordingKey(key);
                    }}
                  />
                  <div className={`p-4 rounded-lg border-2 ${cameraActive ? 'border-success/50 bg-success/5' : 'border-warning/50 bg-warning/5'}`}>
                    <div className="flex items-start gap-3">
                      {cameraActive ? (
                        <CheckCircle className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
                      )}
                      <div>
                        <p className="font-medium text-sm">
                          {cameraActive ? 'Camera Ready' : 'Camera Required'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {cameraActive
                            ? 'Your camera is active and ready for monitoring.'
                            : 'Please enable your camera to proceed. Click "Allow" if prompted.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Session Setup */}
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${sessionStarted ? 'bg-success animate-pulse' : 'bg-muted'}`} />
                    Session Monitoring
                  </CardTitle>
                  <CardDescription>
                    {sessionStarted ? 'Session is recording' : 'Ready to start'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* SessionControls hidden - session auto-starts */}
                  <div className={`p-4 rounded-lg border-2 ${sessionStarted ? 'border-success/50 bg-success/5' : 'border-warning/50 bg-warning/5'}`}>
                    <div className="flex items-start gap-3">
                      {sessionStarted ? (
                        <CheckCircle className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
                      )}
                      <div>
                        <p className="font-medium text-sm">
                          {sessionStarted ? 'Session Active' : 'Session Required'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {sessionStarted
                            ? 'Your session is being monitored and recorded.'
                            : 'Session will start automatically when you enter your test code.'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Video Recording Status */}
                  {sessionStarted && (
                    <div className="p-4 rounded-lg border-2 border-destructive/50 bg-destructive/5">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-destructive animate-pulse" />
                        <div>
                          <p className="font-medium text-sm text-destructive">🎥 Video Recording Active</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Your webcam is being recorded. This will continue throughout the entire test.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Test Info Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Test Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Duration</p>
                    <p className="font-semibold">{test.duration} minutes</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Questions</p>
                    <p className="font-semibold">{test.questions.length} questions</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Total Points</p>
                    <p className="font-semibold">
                      {test.questions.reduce((sum, q) => sum + ((q as any).points || 0), 0)} points
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Start Test Button */}
          <div className="max-w-4xl mx-auto mt-6">
            <Button
              onClick={handleStartTest}
              disabled={cameraActive !== true || !sessionStarted}
              size="lg"
              className="w-full"
            >
              {cameraActive !== true || !sessionStarted
                ? `${cameraActive !== true ? '📷 Enable Camera' : ''} ${!sessionStarted ? '⏱️ Start Session' : ''}`
                : '✓ Start Test'}
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-3">
              Both camera and session monitoring must be active before you can start the test.
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (!isTestStarted) {
    return null;
  }

  if (!test) return null;

  const currentQuestion = test.questions[currentQuestionIndex];
  const currentAnswer = studentAnswers[currentQuestionIndex];
  const answeredCount = studentAnswers.filter(a => a.answer.trim() !== '').length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-xl font-bold">{test.title}</h1>
                <p className="text-xs text-muted-foreground">{studentName}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* Layout Toggle */}
              <div className="flex gap-2 border border-border rounded-lg p-1 bg-muted/50">
                <Button
                  variant={layoutMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setLayoutMode('grid')}
                  className="gap-2"
                >
                  <LayoutGrid className="w-4 h-4" />
                  Grid
                </Button>
                <Button
                  variant={layoutMode === 'flow' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setLayoutMode('flow')}
                  className="gap-2"
                >
                  <Zap className="w-4 h-4" />
                  Flow
                </Button>
              </div>

              <div className={`px-4 py-2 rounded-lg border ${timeRemaining < 300 ? 'bg-destructive/10 border-destructive/30' : 'bg-primary/10 border-primary/20'}`}>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <div>
                    <p className="text-xs text-muted-foreground">Time Remaining</p>
                    <p className={`text-sm font-bold ${timeRemaining < 300 ? 'text-destructive' : 'text-primary'}`}>
                      {formatTime(timeRemaining)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="px-4 py-2 rounded-lg bg-muted border border-muted-foreground/20">
                <p className="text-xs text-muted-foreground">Progress</p>
                <p className="text-sm font-semibold">{currentQuestionIndex + 1}/{test.questions.length}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {layoutMode === 'grid' ? (
          // GRID LAYOUT
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Left Column - Webcam */}
            <div className="lg:col-span-1 space-y-4">
            <WebcamMonitor
              onCameraChange={handleCameraChange}
              shouldRecord={isTestStarted}
              onRecordingStop={(key, saved) => {
                if (saved && key) setLastSavedRecordingKey(key);
              }}
            />

            {/* Attention Monitor */}
            {isTestStarted && (
              <AttentionMonitor
                videoRef={videoRef}
                isActive={isTestStarted}
                onAlertGenerated={(alert) => {
                  setMonitoringAlerts(prev => [alert, ...prev.slice(0, 4)]);
                  console.log('Alert generated:', alert);
                }}
                onMetricsUpdate={(metrics) => {
                  setCurrentMetrics(metrics);
                }}
              />
            )}

            {/* Session Duration Timer */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-4">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Session Duration</p>
                    <p className="text-2xl font-mono font-bold">
                      {String(Math.floor(sessionElapsed / 3600)).padStart(2, '0')}:
                      {String(Math.floor((sessionElapsed % 3600) / 60)).padStart(2, '0')}:
                      {String(sessionElapsed % 60).padStart(2, '0')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                  <span className="text-destructive font-medium">Recording</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Middle Column - Questions */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Question {currentQuestionIndex + 1} of {test.questions.length}</CardTitle>
                <CardDescription>
                  {(currentQuestion as any).type === 'multiple-choice' || currentQuestion.options ? 'Multiple Choice' : 'Text Answer'} • {(currentQuestion as any).points} points
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <p className="text-lg font-medium">{currentQuestion.text}</p>
                </div>

                {('type' in currentQuestion ? currentQuestion.type === 'multiple-choice' : !!currentQuestion.options) && currentQuestion.options && (
                  <RadioGroup value={currentAnswer?.answer || ''} onValueChange={handleAnswerChange}>
                    <div className="space-y-3">
                      {currentQuestion.options.map((option, idx) => (
                        <div key={idx} className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                          <RadioGroupItem value={option} id={`option-${idx}`} />
                          <Label htmlFor={`option-${idx}`} className="flex-1 cursor-pointer">
                            {String.fromCharCode(65 + idx)}. {option}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </RadioGroup>
                )}

                {((('type' in currentQuestion && currentQuestion.type === 'text') ||
                  (!('type' in currentQuestion) && !currentQuestion.options))) && (
                  <Textarea
                    value={currentAnswer?.answer || ''}
                    onChange={(e) => handleAnswerChange(e.target.value)}
                    placeholder="Type your answer here..."
                    rows={6}
                  />
                )}

                <div className="flex gap-3">
                  <Button
                    onClick={handlePreviousQuestion}
                    variant="outline"
                    disabled={currentQuestionIndex === 0}
                    className="flex-1"
                  >
                    ← Previous
                  </Button>
                  <Button
                    onClick={handleNextQuestion}
                    variant="outline"
                    disabled={currentQuestionIndex === test.questions.length - 1}
                    className="flex-1"
                  >
                    Next →
                  </Button>
                </div>

                {currentQuestionIndex === test.questions.length - 1 && (
                  <Button
                    onClick={handleSubmitTest}
                    className="w-full bg-success hover:bg-success/90"
                    size="lg"
                  >
                    Submit Test
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Question Navigator */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Questions</CardTitle>
                <CardDescription>{answeredCount} answered</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-2">
                  {test.questions.map((q, idx) => (
                    <button
                      key={q.id}
                      onClick={() => setCurrentQuestionIndex(idx)}
                      className={`aspect-square rounded-lg font-semibold text-sm transition-colors ${
                        idx === currentQuestionIndex
                          ? 'bg-primary text-primary-foreground'
                          : studentAnswers[idx]?.answer.trim()
                          ? 'bg-success/20 text-success hover:bg-success/30'
                          : 'bg-muted hover:bg-muted/80'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Instructions</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2 text-muted-foreground">
                <p>• Answer all questions</p>
                <p>• Use Previous/Next to navigate</p>
                <p>• Click question numbers to jump</p>
                <p>• Submit when ready</p>
                <p>• Camera must stay on</p>
              </CardContent>
            </Card>
          </div>
        </div>
        ) : (
          // FLOW LAYOUT
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Top - Monitoring Panel */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Webcam */}
              <div className="space-y-4">
                <WebcamMonitor
                  onCameraChange={handleCameraChange}
                  shouldRecord={isTestStarted}
                />

                {/* Attention Monitor */}
                {isTestStarted && (
                  <AttentionMonitor
                    videoRef={videoRef}
                    isActive={isTestStarted}
                    onAlertGenerated={(alert) => {
                      setMonitoringAlerts(prev => [alert, ...prev.slice(0, 4)]);
                      console.log('Alert generated:', alert);
                    }}
                    onMetricsUpdate={(metrics) => {
                      setCurrentMetrics(metrics);
                    }}
                  />
                )}
              </div>

              {/* Session Duration & Progress */}
              <div className="space-y-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3 mb-4">
                      <Clock className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Session Duration</p>
                        <p className="text-2xl font-mono font-bold">
                          {String(Math.floor(sessionElapsed / 3600)).padStart(2, '0')}:
                          {String(Math.floor((sessionElapsed % 3600) / 60)).padStart(2, '0')}:
                          {String(sessionElapsed % 60).padStart(2, '0')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                      <span className="text-destructive font-medium">Recording</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Progress</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Question {currentQuestionIndex + 1} of {test.questions.length}</span>
                        <span className="text-sm text-muted-foreground">{answeredCount} answered</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full transition-all"
                          style={{ width: `${((currentQuestionIndex + 1) / test.questions.length) * 100}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Quick Navigation */}
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Questions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-5 gap-2">
                      {test.questions.map((q, idx) => (
                        <button
                          key={q.id}
                          onClick={() => setCurrentQuestionIndex(idx)}
                          className={`aspect-square rounded-lg font-semibold text-xs transition-colors ${
                            idx === currentQuestionIndex
                              ? 'bg-primary text-primary-foreground'
                              : studentAnswers[idx]?.answer.trim()
                              ? 'bg-success/20 text-success hover:bg-success/30'
                              : 'bg-muted hover:bg-muted/80'
                          }`}
                        >
                          {idx + 1}
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Tips</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs space-y-1 text-muted-foreground">
                    <p>• Answer all questions</p>
                    <p>• Use buttons to navigate</p>
                    <p>• Camera must stay on</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Main Question Area */}
            <Card>
              <CardHeader>
                <CardTitle>Question {currentQuestionIndex + 1} of {test.questions.length}</CardTitle>
                <CardDescription>
                  {currentQuestion.options ? 'Multiple Choice' : 'Text Answer'} • {(currentQuestion as any).points || 0} points
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <p className="text-lg font-medium">{currentQuestion.text}</p>
                </div>

                {currentQuestion.options && (
                  <RadioGroup value={currentAnswer?.answer || ''} onValueChange={handleAnswerChange}>
                    <div className="space-y-3">
                      {currentQuestion.options.map((option, idx) => (
                        <div key={idx} className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                          <RadioGroupItem value={option} id={`option-${idx}`} />
                          <Label htmlFor={`option-${idx}`} className="flex-1 cursor-pointer">
                            {String.fromCharCode(65 + idx)}. {option}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </RadioGroup>
                )}

                {(('type' in currentQuestion && (currentQuestion as any).type === 'text') || (!('type' in currentQuestion) && !currentQuestion.options)) && (
                  <Textarea
                    value={currentAnswer?.answer || ''}
                    onChange={(e) => handleAnswerChange(e.target.value)}
                    placeholder="Type your answer here..."
                    rows={6}
                  />
                )}

                <div className="flex gap-3">
                  <Button
                    onClick={handlePreviousQuestion}
                    variant="outline"
                    disabled={currentQuestionIndex === 0}
                    className="flex-1"
                  >
                    ← Previous
                  </Button>
                  <Button
                    onClick={handleNextQuestion}
                    variant="outline"
                    disabled={currentQuestionIndex === test.questions.length - 1}
                    className="flex-1"
                  >
                    Next →
                  </Button>
                </div>

                {currentQuestionIndex === test.questions.length - 1 && (
                  <Button
                    onClick={handleSubmitTest}
                    className="w-full bg-success hover:bg-success/90"
                    size="lg"
                  >
                    Submit Test
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};

export default TakeTest;