import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Activity, Bell, Share2, TrendingUp, AlertTriangle } from 'lucide-react';
import { getAllTests, getSubmissionsByTestCode, Test, TestSubmission } from '@/lib/testStorage';
import { getCurrentCreator } from '@/lib/auth';
import { toast } from '@/components/ui/use-toast';

interface TestWithStats extends Test {
  activeStudents: number;
  totalSubmissions: number;
  averageScore: number;
}

interface DashboardStats {
  activeStudents: number;
  completedTests: number;
  activeAlerts: number;
  averageScore: number;
}

export function CreatorDashboard() {
  const [tests, setTests] = useState<TestWithStats[]>([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    activeStudents: 0,
    completedTests: 0,
    activeAlerts: 0,
    averageScore: 0
  });

  useEffect(() => {
    loadTests();
  }, []);

  const loadTests = () => {
    setLoading(true);
    const allTests = getAllTests();
    const creator = getCurrentCreator();
    // If a creator is logged in, filter tests to only those they created (match by gmail)
    const myTests = creator
      ? allTests.filter(t => {
          const creatorEmail = (t as any).creatorEmail;
          return !!creatorEmail && String(creatorEmail).toLowerCase() === String(creator.email).toLowerCase();
        })
      : [];
    

    const testsWithStats = myTests.map(test => {
      const submissions = getSubmissionsByTestCode(test.code);
      // For this demo, we'll consider students active if they've submitted in the last hour
      const activeStudents = submissions.filter(s => {
        const submissionTime = new Date(s.submittedAt).getTime();
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        return submissionTime > oneHourAgo;
      }).length;

      const scores = submissions.map(s => s.percentage);
      const averageScore = scores.length > 0 
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) 
        : 0;

      return {
        ...test,
        activeStudents,
        totalSubmissions: submissions.length,
        averageScore
      };
    });

    setTests(testsWithStats);
    // Update overall dashboard stats
    const totalActive = testsWithStats.reduce((sum, t) => sum + (t.activeStudents || 0), 0);
    const totalSubmissions = testsWithStats.reduce((sum, t) => sum + (t.totalSubmissions || 0), 0);
    const avgScore = testsWithStats.length > 0
      ? Math.round(testsWithStats.reduce((s, t) => s + (t.averageScore || 0), 0) / testsWithStats.length)
      : 0;

    setStats({
      activeStudents: totalActive,
      completedTests: totalSubmissions,
      activeAlerts: 0,
      averageScore: avgScore,
    });
    setLoading(false);
  };

  const handleShare = async (test: TestWithStats) => {
    const shareData = {
      title: 'ExamGuard Test',
      text: `Join my test: ${test.title}\nTest Code: ${test.code}`,
      url: `${window.location.origin}/take-test?code=${test.code}`
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        toast({
          title: "Shared successfully",
          description: "Test link has been shared.",
        });
      } else {
        throw new Error('Web Share API not supported');
      }
    } catch (err) {
      // Fallback to copying to clipboard
      const text = `${shareData.text}\n${shareData.url}`;
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied to clipboard",
        description: "Test details have been copied to your clipboard.",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Students</CardDescription>
            <CardTitle className="text-4xl">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                {stats.activeStudents}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Currently taking tests</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completed Tests</CardDescription>
            <CardTitle className="text-4xl">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                {stats.completedTests}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Total submissions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Alerts</CardDescription>
            <CardTitle className="text-4xl">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-destructive" />
                {stats.activeAlerts}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">High severity alerts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Average Score</CardDescription>
            <CardTitle className="text-4xl">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                {stats.averageScore}%
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Class average</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Section */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="submissions">Submissions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tests.map(test => (
              <Card key={test.code} className="border-border/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{test.title}</CardTitle>
                      <CardDescription>Code: {test.code}</CardDescription>
                      <div className="text-sm text-muted-foreground mt-1">Type: {test.interfaceType || 'standard'}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleShare(test)}
                      title="Share test"
                    >
                      <Share2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Active</p>
                      <p className="text-2xl font-semibold">{test.activeStudents}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Total</p>
                      <p className="text-2xl font-semibold">{test.totalSubmissions}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-sm text-muted-foreground mb-1">Average Score</p>
                      <Badge variant={test.averageScore >= 60 ? "default" : "destructive"}>
                        {test.averageScore}%
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {tests.length === 0 && (
              <Card className="col-span-full">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                    <Activity className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-medium text-foreground mb-2">No tests created yet</p>
                  <p className="text-muted-foreground mb-6">Create your first test to get started</p>
                  <Button asChild>
                    <a href="/create-test">Create Test</a>
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="alerts" className="mt-6">
          <Card>
            <CardContent className="py-6">
              <div className="text-center text-muted-foreground">
                No active alerts
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions" className="mt-6">
          <Card>
            <CardContent className="py-6">
              <div className="text-center text-muted-foreground">
                No active sessions
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="submissions" className="mt-6">
          <Card>
            <CardContent className="py-6">
              <div className="text-center text-muted-foreground">
                No submissions yet
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}