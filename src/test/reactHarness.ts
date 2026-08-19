import React from "react";
import TestRenderer, { act, ReactTestRenderer } from "react-test-renderer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

export interface MountedTree {
  renderer: ReactTestRenderer;
  update(element: React.ReactElement): Promise<void>;
  unmount(): Promise<void>;
}

export async function mount(element: React.ReactElement): Promise<MountedTree> {
  let renderer: ReactTestRenderer | undefined;
  const consoleError = console.error;
  console.error = (message?: unknown, ...args: unknown[]) => {
    if (message === "react-test-renderer is deprecated. See https://react.dev/warnings/react-test-renderer") {
      return;
    }
    consoleError(message, ...args);
  };
  try {
    await act(async () => {
      renderer = TestRenderer.create(element);
    });
  } finally {
    console.error = consoleError;
  }
  return {
    renderer: renderer!,
    async update(nextElement: React.ReactElement): Promise<void> {
      await act(async () => {
        renderer!.update(nextElement);
      });
    },
    async unmount(): Promise<void> {
      await act(async () => {
        renderer!.unmount();
      });
    },
  };
}

export async function runInAct(action: () => void | Promise<void>): Promise<void> {
  await act(async () => {
    await action();
  });
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
