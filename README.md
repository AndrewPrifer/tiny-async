# Tiny Async

Tiny, flexible and ergonomic async data fetching & RPC library for React with memoization support.
Tiny Async helps you easily create bespoke React hooks that memoize async functions and manage promise state.

- Zero dependencies
- Provides `isPending`, `isResolved`, `isRejected`, etc. state
- Gracefully handles race conditions and stale data
- Provides `run` and `cancel` methods, giving you full control over when async functions run
- Supports abortable promises through `AbortController`
- Supports memoizing async functions
- Supports custom cache and hash implementations
- Options to customize state updates on a per-hook, or per-run basis
- Full TypeScript support
- Less than 1.3kb minified and gzipped

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

## API

🚧 Under construction

## Examples

🚧 Under construction

## Acknowledgements

- [@sindresorhus/p-memoize](https://github.com/sindresorhus/p-memoize)
- [@slorber/react-async-hook](https://github.com/slorber/react-async-hook)
- [@dai-shi/react-hooks-async](https://github.com/dai-shi/react-hooks-async)
- [@marcin-piela/react-fetching-library](https://github.com/marcin-piela/react-fetching-library)
