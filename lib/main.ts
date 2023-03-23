import pMemoize, { Options, AnyAsyncFunction } from "p-memoize";
import { useState, useRef, useCallback } from "react";
import { defer, Deferred } from "./utils";

type PrevPromiseState = {
  isRejected: boolean;
  isInitial: boolean;
};

export const createHook = <Fn extends AnyAsyncFunction, CacheKeyType>(
  fn: Fn,
  options?: Options<Fn, CacheKeyType>
) => {
  const cache = options?.cache ?? new Map();
  const cacheKey =
    options?.cacheKey ?? (([firstArgument]) => firstArgument as CacheKeyType);

  const memoizedFn = pMemoize(fn, { cache, cacheKey, ...options });

  // Return a React hook managing the lifecycle of the memoized async function
  return () => {
    const [data, setData] = useState<Awaited<ReturnType<Fn>> | undefined>();
    const [error, setError] = useState<Error | undefined>();
    const [isPending, setIsPending] = useState(false);
    const [isInitial, setIsInitial] = useState(true);
    const [isRejected, setIsRejected] = useState(false);
    const isSettled = !isPending && !isInitial;
    const isResolved = isSettled && !isRejected;
    const status = isInitial
      ? "initial"
      : isPending
      ? "pending"
      : isRejected
      ? "rejected"
      : "resolved";

    const runningRef = useRef<{
      prevState: PrevPromiseState;
      timestamp: number;
      symbol: Symbol;
      userPromise: Deferred<Awaited<ReturnType<Fn>>>;
    } | null>(null);

    const cancel = useCallback(() => {
      if (!runningRef.current) return;
      setIsPending(false);
      setIsRejected(runningRef.current.prevState.isRejected);
      setIsInitial(runningRef.current.prevState.isInitial);

      runningRef.current.userPromise.reject(new Error("Run was cancelled."));

      runningRef.current = null;
    }, []);

    const run = useCallback((...args: Parameters<typeof memoizedFn>) => {
      cancel();
      const runningSymbol = Symbol();

      const userPromise = defer<Awaited<ReturnType<Fn>>>();

      runningRef.current = {
        symbol: runningSymbol,
        timestamp: Date.now(),
        prevState: {
          isInitial: isInitial,
          isRejected: isRejected,
        },
        userPromise,
      };

      setIsPending(true);
      setIsRejected(false);
      setError(undefined);
      setIsInitial(false);

      const promise = memoizedFn(...args);

      const isRunning = () =>
        runningRef.current && runningRef.current.symbol == runningSymbol;

      promise
        .then((data) => {
          if (!isRunning()) return;

          setData(data as Awaited<ReturnType<Fn>>);
          setIsPending(false);

          userPromise.resolve(data as Awaited<ReturnType<Fn>>);
        })
        .catch((error) => {
          if (!isRunning()) return;

          setError(error);
          setIsPending(false);
          setIsRejected(true);

          userPromise.reject(error);
        })
        .finally(() => {
          if (!isRunning()) return;

          runningRef.current = null;
        });

      return userPromise.promise;
    }, []);

    const runFresh = useCallback((...args: Parameters<typeof memoizedFn>) => {
      if (cache) {
        cache.delete(cacheKey(args));
      }
      return run(...args);
    }, []);

    return {
      data,
      error,
      isPending,
      isInitial,
      isResolved,
      isRejected,
      isSettled,
      status,
      run,
      runFresh,
      cancel,
    } as const;
  };
};
