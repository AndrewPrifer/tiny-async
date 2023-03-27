# Tiny Async

Tiny, flexible and ergonomic and async data fetching & RPC library for React with memoization support.
Tiny Async helps you easily create bespoke React hooks that automatically memoize async functions and manage promise state.

## Features

- Manages `data`, `error`, `isPending`, `isResolved`, `isRejected` state
- Gracefully handles race conditions and stale data
- Provides `run` and `cancel` methods, giving you full control over when async functions run
- Supports abortable promises through `AbortController`
- Automatically memoizes async functions
- Supports custom cache and hash implementations
- Options to customize state updates on a per-hook, or per-run basis
- Full TypeScript support
- Less than 1.3kb minified and gzipped
- Platform agnostic
- Zero dependencies

## Installation

```sh
yarn add tiny-async
```

## Quick Start

```tsx
import { createHook } from "tiny-async";

const fetchUser = async (id: number) => {
  const response = await fetch(`https://api.example.com/users/${id}`);
  return response.json();
};

// fetchUser is automatically memoized (you can opt out of this behavior)
const useFetchUser = createHook(fetchUser);

function UserProfile({ userId }) {
  const { data, error, isPending, run } = useFetchUser();

  useEffect(() => {
    // Call run anytime you want to fetch the user
    run(userId).then(({ cached }) => {
      if (cached) {
        // If the first run's response was cached, revalidate while displaying the cached data
        run.withOpts({ ignoreCache: true, keepPreviousData: true })(userId);
      }
    });
  }, [userId]);

  if (isPending) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h1>{data.name}</h1>
      <p>{data.email}</p>
    </div>
  );
}
```

## Why not `useSWR` or `react-query`?

There is no one size fits all solution.
`useSWR` and `react-query` are both great libraries that automatically handle data fetching, but since there are so many different use cases, they have to include a myriad configuration options to cover them all. While they are convenient in many cases, their opinionated approach makes them feel inflexible and convoluted in others.

Tiny Async takes a different approach.
It handles only the problems that apply to _all_ asynchronous operations, and leaves the rest up to you.
You are in control of how and when your data is fetched, stored and invalidated.
Tiny Async takes care of memoization, state management and race conditions, so you don't have to.
You can easily create data fetching hooks tailored to your specific use case.

## API

### `createHook(fn, options?)`

Creates a React hook managing the lifecycle of the given async function.

**Parameters**

- `fn`: The async function to manage the lifecycle of.
- `options`: Optional configuration options for the hook.

**Options**

- `cacheKey` (Optional): A function that determines the cache key for storing the result based on the function arguments. Default: `(arguments_) => arguments_[0]`.
- `cache` (Optional): Use a different cache storage. Default: `new Map()`.
- `abortable` (Optional): A boolean indicating whether the function is abortable. Default: `false`.

**Returns**

A React hook managing the lifecycle of the async function.

**Example**

```ts
const useFetchData = createHook(fetchData, {
  cacheKey: JSON.stringify,
  abortable: true,
});
```

### Hook returned by `createHook`

React hook managing the lifecycle of the async function passed to `createHook`.

**Parameters**

- `options`: Optional configuration options for the hook.

**Options**

- `cancelOnUnmount?: boolean`: Whether to cancel the execution when the hook is unmounted. Default is `false`.
- `keepPreviousData?: boolean`: Whether to keep the previous data when the hook is re-run. Default is `false`.
- `ignoreCache?: boolean`: Whether to ignore the cache and re-run the function. Default is `false`.

**Example**

```ts
const { data, error, isPending, run } = useFetchData({
  cancelOnUnmount: true,
  keepPreviousData: true,
});
```

**Returns**

The created hook returns an object with the following properties:

- `data: Data | undefined`: The data returned by the async function.
- `error: Error | undefined`: The error thrown by the async function.
- `isPending: boolean`: Whether the async function is currently running.
- `isInitial: boolean`: Whether the async function has been run at least once.
- `isResolved: boolean`: Whether the async function has resolved.
- `isRejected: boolean`: Whether the async function has rejected.
- `isSettled: boolean`: Whether the async function has settled (either resolved or rejected).
- `status: "initial" | "pending" | "rejected" | "resolved"`: The current status of the async function.

**Example**

```ts
const { data, error, isPending, run } = useFetchData();

if (isPending) {
  return <div>Loading...</div>;
}

if (error) {
  return <div>Error: {error.message}</div>;
}

return <div>Data: {JSON.stringify(data)}</div>;
```

### `run(...args)`

A function that runs the async function with the given arguments.

**Parameters**

- `...args: Args`: The arguments to pass to the async function.

**Returns**

A promise that resolves with an object containing:

- `data: Data`: The data that was returned by the async function.
- `latest: boolean`: Whether the execution is the latest one. Useful for avoiding race conditions.
- `cached: boolean`: Whether the response was retrieved from the cache.

**Example**

```ts
const { run } = useFetchData();

run(arg1, arg2).then(({ data, latest, cached }) => {
  if (latest) {
    console.log("Fetched latest data:", data);
  }
});
```

### `run.withOpts(options?)`

A function that allows you to override the options given to the hook when running the async function.

**Parameters**

- `options`: Optional configuration options for the `run` function.

**Options**

- `cancelOnUnmount?: boolean`: Whether to cancel the execution when the hook is unmounted. Default is `false`.
- `keepPreviousData?: boolean`: Whether to keep the previous data when the hook is re-run. Default is `false`.
- `ignoreCache?: boolean`: Whether to ignore the cache and re-run the function. Default is `false`.

**Returns**

A function that takes the arguments to pass to the async function and returns a promise that resolves with an object containing:

- `data: Data`: The data that was returned by the async function.
- `latest: boolean`: Whether the execution is the latest one. Useful for avoiding race conditions.

**Example**

```ts
const { run } = useFetchData();

run
  .withOpts({ ignoreCache: true })(arg1, arg2)
  .then(({ data, latest }) => {
    if (latest) {
      console.log("Fetched latest data:", data);
    }
  });
```

## Use cases

Tiny Async is very flexible and can be used to create bespoke hooks for a variety of use cases.

### Wrap your tRPC procedures

Get React state management and memoization for your tRPC procedures with no cost. The created hook will inherit all of the type safety of the procedure, including the type of `data` and the parameters of `run()`.

```ts
const useMyProcedure = createHook(
  (...args: Parameters<typeof trpc.myProcedure.mutate>) =>
    trpc.myProcedure.mutate(...args),
  {
    // Tiny Async supports aborting tRPC procedures out of the box
    abortable: true,
    cacheKey: (args) => JSON.stringify(args),
  }
);

// data and run are typed correctly
const { data, run } = useMyProcedure();
```

### Roll your own useSWR

Here is a tiny, useSWR-like hook built using Tiny Async in 70 lines of code:

```ts
// Let Tiny Async handle caching and state management by creating a helper hook
const useSWRHelper = createHook((key: string, fetcher: () => Promise<any>) => {
  return fetcher();
});

// We wrap the helper hook in a custom hook to provide the high-level useSWR API
export const useTinySWR = <T>(
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

  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  useEffect(() => {
    run(key, fetcherRef.current).then(({ cached }) => {
      if (cached && revalidateIfStale) {
        revalidate();
      }
    });
  }, [key]);

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
