export interface BarOptions {
  name: string;
  value?: number;
}

export function createBar(opts: BarOptions): BarOptions {
  return { name: opts.name, value: opts.value ?? 0 };
}
