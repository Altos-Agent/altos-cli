export class Foo {
  public name: string;
  private value: number;

  constructor(name: string) {
    this.name = name;
    this.value = 0;
  }

  public getValue(): number {
    return this.value;
  }
}

export function getFoo(name: string): Foo {
  return new Foo(name);
}
