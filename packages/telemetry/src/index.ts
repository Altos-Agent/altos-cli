// @altos/telemetry - Tracing and metrics

export interface Span {
  name: string;
  start(attributes?: Record<string, unknown>): void;
  end(attributes?: Record<string, unknown>): void;
  addEvent(name: string, attributes?: Record<string, unknown>): void;
}

export interface Tracer {
  startSpan(name: string): Span;
}

export interface Counter {
  add(value: number, tags?: Record<string, string>): void;
}

export interface Histogram {
  record(value: number, tags?: Record<string, string>): void;
}

export class ConsoleTracer implements Tracer {
  startSpan(name: string): Span {
    return new ConsoleSpan(name);
  }
}

class ConsoleSpan implements Span {
  name: string;
  constructor(name: string) {
    this.name = name;
    console.log(`[trace] ${name} started`);
  }
  start() {}
  end() {
    console.log(`[trace] ${this.name} ended`);
  }
  addEvent(name: string) {
    console.log(`[trace] ${this.name} event: ${name}`);
  }
}

export class NoOpCounter implements Counter {
  add() {}
}

export class NoOpHistogram implements Histogram {
  record() {}
}

export function createTracer(): Tracer {
  return new ConsoleTracer();
}

export function createCounter(_name: string): Counter {
  return new NoOpCounter();
}

export function createHistogram(_name: string): Histogram {
  return new NoOpHistogram();
}
