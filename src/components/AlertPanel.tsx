import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, Eye, EyeOff, Smartphone, Clock } from 'lucide-react';

interface Alert {
  id: string;
  type: 'focus_loss' | 'device_detected' | 'away' | 'distracted';
  timestamp: Date;
  severity: 'low' | 'medium' | 'high';
  message: string;
}

interface AlertPanelProps {
  alerts: Alert[];
}

export const AlertPanel = ({ alerts }: AlertPanelProps) => {
  const getAlertIcon = (type: Alert['type']) => {
    switch (type) {
      case 'focus_loss':
        return <EyeOff className="w-4 h-4" />;
      case 'device_detected':
        return <Smartphone className="w-4 h-4" />;
      case 'away':
        return <AlertTriangle className="w-4 h-4" />;
      case 'distracted':
        return <Eye className="w-4 h-4" />;
    }
  };

  const getSeverityColor = (severity: Alert['severity']) => {
    switch (severity) {
      case 'high':
        return 'bg-destructive text-destructive-foreground';
      case 'medium':
        return 'bg-warning text-warning-foreground';
      case 'low':
        return 'bg-secondary text-secondary-foreground';
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-warning" />
          Alerts & Violations
          {alerts.length > 0 && (
            <Badge variant="destructive" className="ml-auto">
              {alerts.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <div className="w-16 h-16 rounded-full bg-success-subtle flex items-center justify-center mb-3">
                <Eye className="w-8 h-8 text-success" />
              </div>
              <p className="text-sm text-muted-foreground">No violations detected</p>
              <p className="text-xs text-muted-foreground mt-1">Keep up the good work!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/5 transition-colors"
                >
                  <div className={`p-2 rounded-lg ${getSeverityColor(alert.severity)}`}>
                    {getAlertIcon(alert.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{alert.message}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {formatTime(alert.timestamp)}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs capitalize">
                    {alert.severity}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
