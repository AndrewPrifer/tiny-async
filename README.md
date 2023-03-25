# Tiny Async

Tiny, flexible and ergonomic async data fetching & RPC library for React with memoization support.
Tiny Async helps you easily create bespoke React hooks that memoize async functions and manage promise state.

- Zero dependencies
- Provides `isPending`, `isResolved`, `isRejected`, etc. state
- Provides `run` and `cancel` methods, giving you full control over when async functions run
- Supports abortable promises through `AbortController`
- Supports memoizing async functions
- Supports custom cache and hash implementations
- Configurable with `keepPreviousData` and `cancelOnUnmount`, etc. options, on a per-hook, or per-run basis
- Full TypeScript support

## Installation

```sh
yarn add tiny-async
```

## Quick Start

```tsx
import { createHook } from "tiny-async";

const useHelloAsync = createHook((name: string): Promise<string> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(`Hello ${name}`);
    }, 2000);
  });
});

function App() {
  // Data will be automatically cached
  const { data, isPending, run } = useHelloAsync({ keepPreviousData: true });

  return (
    <div>
      <button
        onClick={() => {
          run("Andrew");
        }}
      >
        Say hi to Andrew
      </button>
      <button
        onClick={() => {
          // Opt out of the cache just for this run
          run.withOpts({ ignoreCache: true })("Bob");
        }}
      >
        Say hi to Bob
      </button>
      {isPending && <div>Loading...</div>}
      {data && <div>{data}</div>}
    </div>
  );
}
```
