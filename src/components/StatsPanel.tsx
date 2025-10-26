import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, EyeOff, Smartphone, TrendingUp } from 'lucide-react';

interface StatsPanelProps {
  totalFocusTime: number;
  distractedTime: number;
  deviceDetections: number;
  averageScore: number;
}

export const StatsPanel = ({ 
  totalFocusTime, 
  distractedTime, 
  deviceDetections, 
  averageScore 
}: StatsPanelProps) => {
  const formatMinutes = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const stats = [
    {
      label: 'Focus Time',
      value: formatMinutes(totalFocusTime),
      icon: Eye,
      color: 'text-success',
      bgColor: 'bg-success-subtle',
    },
    {
      label: 'Distracted Time',
      value: formatMinutes(distractedTime),
      icon: EyeOff,
      color: 'text-warning',
      bgColor: 'bg-warning-subtle',
    },
    {
      label: 'Device Alerts',
      value: deviceDetections.toString(),
      icon: Smartphone,
      color: 'text-destructive',
      bgColor: 'bg-destructive-subtle',
    },
    {
      label: 'Avg. Score',
      value: `${Math.round(averageScore)}%`,
      icon: TrendingUp,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
  ];

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Session Statistics</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="p-4 rounded-lg border border-border hover:border-primary/30 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                </div>
              </div>
              <p className="text-2xl font-bold mb-1">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
