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
          run
            .withOpts({ ignoreCache: true })("Bob")
            // The run function also returns a promise that resolves to the data
            // It also tells you if it is the latest run, so you can avoid race conditions
            .then(({ data, latest }) => {
              if (latest) {
                console.log(data);
              }
            });
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

Tiny Async is very flexible and can be used to create bespoke hooks for a variety of use cases.

Here is a tiny, useSWR-like hook built using Tiny Async in 70 lines of code:

```tsx
// Let Tiny Async handle caching and state management by creating a helper hook
const useSWRHelper = createHook((key: string, fetcher: () => Promise<any>) => {
  return fetcher();
});

// We wrap the helper hook in a custom hook to provide the high-level useSWR API
export const useTinySWR = <T,>(
  key: string,
  fetcher: () => Promise<T>,
  {
    fallbackData,
    keepPreviousData = false,
    revalidateIfStale = true,
    revalidateOnFocus = true,
    revalidateOnReconnect = true,
  }: {
    fallbackData?: T;
    keepPreviousData?: boolean;
    revalidateIfStale?: boolean;
    revalidateOnFocus?: boolean;
    revalidateOnReconnect?: boolean;
  } = {}
) => {
  const { data, error, isPending, run } = useSWRHelper({
    keepPreviousData,
  });

  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);
  useEffect(() => {
    run.withOpts({ ignoreCache: revalidateIfStale })(key, fetcherRef.current);
  }, [key]);

  const [isReValidating, setIsRevalidating] = useState(false);
  const revalidate = () => {
    setIsRevalidating(true);
    run
      .withOpts({ ignoreCache: true, keepPreviousData: true })(
        key,
        fetcherRef.current
      )
      .finally(() => {
        setIsRevalidating(false);
      });
  };

  const windowFocus = useWindowFocus();
  useEffect(() => {
    if (revalidateOnFocus && windowFocus) {
      revalidate();
    }
  }, [revalidateOnFocus, windowFocus]);

  const isOnline = useIsOnline();
  useEffect(() => {
    if (revalidateOnReconnect && isOnline) {
      revalidate();
    }
  }, [revalidateOnReconnect, isOnline]);

  return {
    data: data ?? fallbackData,
    error,
    isLoading: isPending && !isReValidating,
    isValidating: isPending || isReValidating,
  };
};
```

## Acknowledgements

- [@sindresorhus/p-memoize](https://github.com/sindresorhus/p-memoize)
- [@slorber/react-async-hook](https://github.com/slorber/react-async-hook)
- [@dai-shi/react-hooks-async](https://github.com/dai-shi/react-hooks-async)
- [@marcin-piela/react-fetching-library](https://github.com/marcin-piela/react-fetching-library)
- [@vercel/swr](https://github.com/vercel/swr)
