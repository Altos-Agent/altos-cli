// Legacy metrics types - kept for backward compatibility
export interface Metric {
  name: string;
  value: number;
  tags?: Record<string, string>;
}

export class MetricsCollector {
  private metrics: Metric[] = [];

  record(name: string, value: number, tags?: Record<string, string>): void {
    this.metrics.push({ name, value, tags });
  }

  getMetrics(): Metric[] {
    return [...this.metrics];
  }

  clear(): void {
    this.metrics = [];
  }
}

export function createMetricsCollector(): MetricsCollector {
  return new MetricsCollector();
}
