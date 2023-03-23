import pMemoize, { Options, AnyAsyncFunction } from "p-memoize";
import { useState, useRef, useCallback } from "react";

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

    const runningRef = useRef<{
      prevState: PrevPromiseState;
      timestamp: number;
      symbol: Symbol;
    } | null>(null);

    const cancel = useCallback(() => {
      if (!runningRef.current) return;
      setIsPending(false);
      setIsRejected(runningRef.current.prevState.isRejected);
      setIsInitial(runningRef.current.prevState.isInitial);
      runningRef.current = null;
    }, []);

    const run = useCallback((...args: Parameters<typeof memoizedFn>) => {
      cancel();
      const runningSymbol = Symbol();

      runningRef.current = {
        symbol: runningSymbol,
        timestamp: Date.now(),
        prevState: {
          isInitial: isInitial,
          isRejected: isRejected,
        },
      };

      setIsPending(true);
      setIsRejected(false);
      setError(undefined);
      setIsInitial(false);

      const promise = memoizedFn(...args);

      promise
        .then((data) => {
          if (
            !runningRef.current ||
            runningRef.current.symbol !== runningSymbol
          )
            return;

          setData(data as Awaited<ReturnType<Fn>>);
          setIsPending(false);
        })
        .catch((error) => {
          if (
            !runningRef.current ||
            runningRef.current.symbol !== runningSymbol
          )
            return;

          setError(error);
          setIsPending(false);
          setIsRejected(true);
        });

      return promise.then((data) => {
        if (!runningRef.current || runningRef.current.symbol !== runningSymbol)
          throw Error("Run was cancelled.");

        runningRef.current = null;
        return data as Awaited<ReturnType<Fn>>;
      });
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
      isFulfilled: isResolved,
      isRejected,
      isSettled,
      run,
      runFresh,
      cancel,
    };
  };
};
