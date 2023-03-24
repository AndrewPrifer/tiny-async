import pMemoize, { Options, AnyAsyncFunction } from "./pMemoize";
import { useState, useRef, useCallback } from "react";
import { makeControlledPromise, useEventCallback } from "./utils";
import { PopTuple } from "./typeUtils";

export const createHook = <
  Fn extends AnyAsyncFunction,
  CacheKeyType,
  Abortable extends boolean
>(
  fn: Fn,
  options?: Options<Fn, CacheKeyType, Abortable>
) => {
  type RunParams = Abortable extends true
    ? PopTuple<Parameters<Fn>>
    : Parameters<Fn>;

  const cache = options?.cache ?? new Map();
  const cacheKey =
    options?.cacheKey ?? (([firstArgument]) => firstArgument as CacheKeyType);
  const abortable = options?.abortable ?? false;

  const memoizedFn = pMemoize(fn, { cache, cacheKey, ...options });

  // Return a React hook managing the lifecycle of the memoized async function
  return () => {
    // State containing the status of the async function
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

    // Data related to the current execution
    const runningRef = useRef<{
      // A symbol uniquely identifying the current execution
      symbol: Symbol;
      // The cache key of the current execution. Used to identify equivalent executions
      hash: CacheKeyType;
      // The AbortController of the current execution
      abortController: AbortController;
      // The promise returned to the user
      userPromise: Promise<Awaited<ReturnType<Fn>>>;
    } | null>(null);

    /**
     * Cancel the current execution.
     */
    const cancel = useCallback(() => {
      if (!runningRef.current) return;
      runningRef.current.abortController.abort();
    }, []);

    /**
     * Run the async function.
     */
    const run = useEventCallback((...args: RunParams) => {
      const hash = cacheKey(args);
      // If an equivalent (by cache key) async operation is already running, we return the promise of the running operation instead of starting a new one
      if (runningRef.current && runningRef.current.hash == hash) {
        return runningRef.current.userPromise;
      }

      // We cancel the current execution, if any
      cancel();

      const executionSymbol = Symbol();
      const abortController = new AbortController();
      const userPromise = makeControlledPromise<Awaited<ReturnType<Fn>>>();

      // Preserve the state of the previous execution, in case we need to restore it upon cancelling the current execution
      const prevState = {
        data,
        isInitial,
        isRejected,
        error,
      };

      abortController.signal.addEventListener("abort", (e) => {
        // We only reject the user promise if the wrapped promise doesn't support aborting itself, otherwise we let the wrapped promise reject the user promise
        if (!abortable) {
          userPromise.reject(abortController.signal.reason);
        }
      });

      userPromise.promise
        // This marks the very end of the execution, so we are doing all the cleanup here
        .finally(() => {
          // If the promise is still running, we cancel it
          // Note that other executions might have been started in the meantime, specifically because AbortController.abort() doesn't run synchronously,
          // so we only clean up if the current execution is still running
          if (runningRef.current?.symbol == executionSymbol) {
            runningRef.current = null;

            if (abortController.signal.aborted) {
              setIsPending(false);
              setIsRejected(prevState.isRejected);
              setIsInitial(prevState.isInitial);
              setData(prevState.data);
            }
          }
        })
        // Have to put a catch here to avoid unhandled promise rejection, otherwise the user will get an error even if they handle it on their end
        // The downside is that it will swallow the unhandled promise rejection error unless the user awaits it or thens it.
        // OTOH arguably swallowing it is a good thing, since the user gets notified of the error through the error state anyway.
        // In case we don't want to swallow it, the only solution is to introduce another layer of promises for the cleanup, and forward resolve/reject to a user promise
        // that is returned to the user without any then calls on our end.
        // Interestingly, the behavior of only throwing unhandled rejection that can be caught on the root-promise if there are no then-chains attached, makes
        // then-calls have a side-effect, which is a bit weird.
        // Even a .finally() call will interfere with the unhandled rejection behavior, even though it runs whether or not the promise is rejected, thus requiring no catch call.
        .catch(() => {});

      runningRef.current = {
        symbol: executionSymbol,
        hash,
        abortController,
        userPromise: userPromise.promise,
      };

      // Set pending state
      setIsPending(true);
      setIsRejected(false);
      setError(undefined);
      setIsInitial(false);

      // If the async function supports aborting, we pass the AbortController's signal to it in addition to the arguments
      const promise = abortable
        ? memoizedFn(...args, { signal: abortController.signal })
        : memoizedFn(...args);

      promise
        .then((data) => {
          // only set data and resolve the user promise if the execution is still running
          if (abortController.signal.aborted) return;

          setData(data as Awaited<ReturnType<Fn>>);
          setIsPending(false);

          userPromise.resolve(data as Awaited<ReturnType<Fn>>);
        })
        .catch((error) => {
          // only handle the error if the execution is still running
          if (abortController.signal.aborted) {
            // If the execution is not running, but the error is the abort reason, we forward it to the user promise
            if (error === abortController.signal.reason) {
              userPromise.reject(error);
            }

            return;
          }

          // Forward the error to the user promise
          userPromise.reject(error);

          // Set error state
          setError(error);
          setIsPending(false);
          setIsRejected(true);
        });

      return userPromise.promise;
    });

    // Run the async function, even if the result is already in the cache
    const runFresh = useCallback((...args: RunParams) => {
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
