import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Brain, TrendingUp, TrendingDown } from 'lucide-react';

interface FocusScoreProps {
  score: number;
  trend: 'up' | 'down' | 'stable';
}

export const FocusScore = ({ score, trend }: FocusScoreProps) => {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-warning';
    return 'text-destructive';
  };

  const getScoreGradient = (score: number) => {
    if (score >= 80) return 'from-success to-success/70';
    if (score >= 60) return 'from-warning to-warning/70';
    return 'from-destructive to-destructive/70';
  };

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          Attention Score
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-4">
          <div className={`text-6xl font-bold ${getScoreColor(score)}`}>
            {Math.round(score)}
          </div>
          <div className="flex flex-col pb-2">
            <span className="text-3xl text-muted-foreground">/100</span>
            {trend !== 'stable' && (
              <div className={`flex items-center gap-1 text-sm ${trend === 'up' ? 'text-success' : 'text-destructive'}`}>
                {trend === 'up' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                <span>{trend === 'up' ? 'Improving' : 'Declining'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Circular progress indicator */}
        <div className="mt-6 relative w-full h-3 bg-muted rounded-full overflow-hidden">
          <div
            className={`absolute inset-y-0 left-0 bg-gradient-to-r ${getScoreGradient(score)} transition-all duration-500 rounded-full`}
            style={{ width: `${score}%` }}
          />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
          <div className="p-2 rounded-lg bg-success-subtle">
            <div className="font-semibold text-success">Focused</div>
            <div className="text-xs text-muted-foreground">85-100</div>
          </div>
          <div className="p-2 rounded-lg bg-warning-subtle">
            <div className="font-semibold text-warning">Moderate</div>
            <div className="text-xs text-muted-foreground">60-84</div>
          </div>
          <div className="p-2 rounded-lg bg-destructive-subtle">
            <div className="font-semibold text-destructive">Low</div>
            <div className="text-xs text-muted-foreground">0-59</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
