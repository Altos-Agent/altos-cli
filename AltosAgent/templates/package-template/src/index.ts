// Example package - replace with your implementation

export const VERSION = "0.1.0";

export interface ExampleAPI {
  doSomething(): void;
}

export function createExampleAPI(): ExampleAPI {
  return {
    doSomething() {
      console.log("Example API called");
    },
  };
}
