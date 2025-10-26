import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, CheckCircle, BellRing, TrendingUp } from 'lucide-react';

interface MonitoringStats {
  activeStudents: number;
  completedTests: number;
  activeAlerts: number;
  averageScore: number;
}

export function TestMonitoringDashboard() {
  const [stats, setStats] = useState<MonitoringStats>({
    activeStudents: 0,
    completedTests: 0,
    activeAlerts: 0,
    averageScore: 0
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-4">
        <h2 className="text-2xl font-bold">Test Monitoring Dashboard</h2>
        
        {/* Stats Grid - Rearranged in 2x2 grid */}
        <div className="grid grid-cols-2 gap-4">
          {/* Active Students Card */}
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950 dark:to-blue-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500" />
                Active Students
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.activeStudents}</div>
              <CardDescription>Currently taking the test</CardDescription>
            </CardContent>
          </Card>

          {/* Completed Tests Card */}
          <Card className="bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950 dark:to-green-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Completed Tests
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600 dark:text-green-400">{stats.completedTests}</div>
              <CardDescription>Total submissions</CardDescription>
            </CardContent>
          </Card>

          {/* Active Alerts Card */}
          <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950 dark:to-amber-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <BellRing className="w-4 h-4 text-amber-500" />
                Active Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.activeAlerts}</div>
              <CardDescription>High severity alerts</CardDescription>
            </CardContent>
          </Card>

          {/* Average Score Card */}
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950 dark:to-purple-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-purple-500" />
                Average Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">{stats.averageScore}%</div>
              <CardDescription>Class average</CardDescription>
            </CardContent>
          </Card>
        </div>

        {/* Tabs Section */}
        <Tabs defaultValue="overview" className="mt-6">
          <TabsList className="grid w-full grid-cols-4 rounded-lg bg-muted p-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="alerts">Alerts</TabsTrigger>
            <TabsTrigger value="sessions">Sessions</TabsTrigger>
            <TabsTrigger value="submissions">Submissions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Active Sessions</CardTitle>
                <CardDescription>Currently active test takers</CardDescription>
              </CardHeader>
              <CardContent className="h-[200px] flex items-center justify-center text-muted-foreground">
                {stats.activeStudents === 0 ? "No active sessions" : "List of active sessions would appear here"}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="alerts" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Alerts</CardTitle>
                <CardDescription>Suspicious activity and warnings</CardDescription>
              </CardHeader>
              <CardContent className="h-[200px] flex items-center justify-center text-muted-foreground">
                {stats.activeAlerts === 0 ? "No active alerts" : "List of alerts would appear here"}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sessions" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Test Sessions</CardTitle>
                <CardDescription>All ongoing and completed sessions</CardDescription>
              </CardHeader>
              <CardContent className="h-[200px] flex items-center justify-center text-muted-foreground">
                Session details would appear here
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="submissions" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Test Submissions</CardTitle>
                <CardDescription>Completed test submissions</CardDescription>
              </CardHeader>
              <CardContent className="h-[200px] flex items-center justify-center text-muted-foreground">
                {stats.completedTests === 0 ? "No submissions yet" : "List of submissions would appear here"}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}