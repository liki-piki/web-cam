import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TestAlert, TestSession, getAlertsByTest, getSessionsByTest } from '@/lib/alertStorage';
import { getSubmissions, Test, Submission } from '@/lib/testStorage';
import { AlertTriangle, Bell, Camera, CheckCircle, Clock, User, Users, XCircle } from 'lucide-react';

interface TestDashboardProps {
  testCode: string;
}

export const TestDashboard = ({ testCode }: TestDashboardProps) => {
  const [sessions, setSessions] = useState<TestSession[]>([]);
  const [alerts, setAlerts] = useState<TestAlert[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [activeTab, setActiveTab] = useState('overview');

  // Fetch data every 5 seconds
  useEffect(() => {
    const loadData = () => {
      const testSessions = getSessionsByTest(testCode);
      const testAlerts = getAlertsByTest(testCode);
      const testSubmissions = getSubmissions().filter(s => s.testCode === testCode);
      
      setSessions(testSessions);
      setAlerts(testAlerts);
      setSubmissions(testSubmissions);
    };

    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [testCode]);

  const activeSessions = sessions.filter(s => s.status === 'active');
  const completedSessions = sessions.filter(s => s.status === 'completed');
  const terminatedSessions = sessions.filter(s => s.status === 'terminated');

  const getAlertSeverityColor = (severity: TestAlert['severity']) => {
    switch (severity) {
      case 'high':
        return 'bg-destructive text-destructive-foreground';
      case 'medium':
        return 'bg-warning text-warning-foreground';
      case 'low':
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Students</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeSessions.length}</div>
            <p className="text-xs text-muted-foreground">Currently taking the test</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Tests</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{submissions.length}</div>
            <p className="text-xs text-muted-foreground">Total submissions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{alerts.filter(a => a.severity === 'high').length}</div>
            <p className="text-xs text-muted-foreground">High severity alerts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Score</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {submissions.length > 0
                ? Math.round(submissions.reduce((sum, s) => sum + s.percentage, 0) / submissions.length)
                : 0}%
            </div>
            <p className="text-xs text-muted-foreground">Class average</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="submissions">Submissions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Active Sessions */}
          <Card>
            <CardHeader>
              <CardTitle>Active Sessions</CardTitle>
              <CardDescription>Currently active test takers</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activeSessions.map(session => (
                  <div key={session.studentName} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
                      <div>
                        <p className="font-medium">{session.studentName}</p>
                        <p className="text-sm text-muted-foreground">Started {new Date(session.startTime).toLocaleTimeString()}</p>
                      </div>
                    </div>
                    <Badge variant={session.attentionScore > 80 ? "default" : "destructive"}>
                      {session.attentionScore}% Attention
                    </Badge>
                  </div>
                ))}
                {activeSessions.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No active sessions</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recent Alerts */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Alerts</CardTitle>
              <CardDescription>Latest monitoring alerts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {alerts.slice(0, 5).map(alert => (
                  <Alert key={alert.id}>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle className="flex items-center gap-2">
                      {alert.studentName}
                      <Badge className={getAlertSeverityColor(alert.severity)}>
                        {alert.severity}
                      </Badge>
                    </AlertTitle>
                    <AlertDescription>{alert.message}</AlertDescription>
                  </Alert>
                ))}
                {alerts.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No recent alerts</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Alerts</CardTitle>
              <CardDescription>Complete alert history for this test</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {alerts.map(alert => (
                  <Alert key={alert.id}>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle className="flex items-center gap-2">
                      {alert.studentName}
                      <Badge className={getAlertSeverityColor(alert.severity)}>
                        {alert.severity}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {new Date(alert.timestamp).toLocaleString()}
                      </span>
                    </AlertTitle>
                    <AlertDescription>{alert.message}</AlertDescription>
                  </Alert>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Sessions</CardTitle>
              <CardDescription>Test session history</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {sessions.map(session => (
                  <div key={session.studentName} className="p-4 border rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        <span className="font-medium">{session.studentName}</span>
                        {session.deviceInfo?.isMobile && (
                          <span className="ml-2 text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800">Mobile</span>
                        )}
                      </div>
                      <Badge
                        variant={
                          session.status === 'active'
                            ? 'default'
                            : session.status === 'completed'
                            ? 'outline'
                            : 'destructive'
                        }
                      >
                        {session.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Started</p>
                        <p>{new Date(session.startTime).toLocaleString()}</p>
                      </div>
                      {session.endTime && (
                        <div>
                          <p className="text-muted-foreground">Ended</p>
                          <p>{new Date(session.endTime).toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={session.attentionScore} className="flex-1" />
                      <span className="text-sm font-medium">{session.attentionScore}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="submissions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Test Submissions</CardTitle>
              <CardDescription>Completed test results</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {submissions.map(submission => (
                  <div key={submission.studentName} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{submission.studentName}</p>
                        <p className="text-sm text-muted-foreground">
                          Submitted {new Date(submission.submittedAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg">{submission.percentage}%</p>
                        <p className="text-sm text-muted-foreground">
                          {submission.totalScore} / {submission.totalPoints} points
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};