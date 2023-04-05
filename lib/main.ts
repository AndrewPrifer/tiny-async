import pMemoize, {
  Options,
  AnyAsyncFunction,
  RunParams,
  PromiseWithIsCached,
} from "./pMemoize";
import { useState, useRef, useCallback, useEffect } from "react";
import { makeControlledPromise, useEventCallback } from "./utils";

// TODO: Allow passing base run options to createHook (overwritten by hook options, which are overwritten by run options)

/**
 * Create a React hook managing the lifecycle of an async function.
 *
 * @param fn The async function to manage the lifecycle of
 * @param options Options for the hook
 * @returns A React hook managing the lifecycle of the async function
 */
export const createHook = <
  Fn extends AnyAsyncFunction,
  CacheKeyType = string,
  Abortable extends boolean = false
>(
  fn: Fn,
  options?: Omit<Options<Fn, CacheKeyType, Abortable>, "promiseCache">
) => {
  type MyRunParams = RunParams<Abortable, Fn>;

  const cache = options?.cache ?? new Map();
  const promiseCache = new Map<
    CacheKeyType,
    PromiseWithIsCached<Awaited<ReturnType<Fn>>>
  >();
  const cacheKey =
    options?.cacheKey ?? (([firstArgument]) => firstArgument as CacheKeyType);
  const abortable = options?.abortable ?? false;

  const memoizedFn = pMemoize(fn, {
    cache,
    cacheKey,
    promiseCache,
    ...options,
  });

  type RunConfig = {
    /**
     * Whether to cancel the execution when the hook is unmounted.
     */
    cancelOnUnmount?: boolean;
    /**
     * Whether to keep the previous data when the hook is re-run.
     */
    keepPreviousData?: boolean;
    /**
     * Whether to ignore the cache and re-run the function.
     */
    ignoreCache?: boolean;
  };

  /**
   * The hook managing the lifecycle of the async function.
   *
   * @param hookOptions Options for the hook
   */
  return (hookOptions?: RunConfig) => {
    // State containing the status of the async function
    const [data, setData] = useState<Awaited<ReturnType<Fn>> | undefined>();
    // TypeScript has no mechanism for declaring or inferring thrown errors.
    // An option would be to make it a generic parameter, but that'd make it the single manually specified generic parameter,
    // which would in turn force manually typing the rest of the parameters, which would be a pain, and wouldn't be typesafe either,
    // since the error could be of any type. The only type safe way right now to coerce errors to a certain type
    // is to use a type guard in the catch clause.
    const [error, setError] = useState<any>();
    const [isPending, setIsPending] = useState(false);
    const [isInitial, setIsInitial] = useState(true);
    // Error and isRejected are managed independently because a promise can be rejected with undefined, in which case error wouldn't be super useful
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
      // When the current execution started
      startedAt: number;
      // A symbol uniquely identifying the current execution
      symbol: Symbol;
      // The cache key of the current execution. Used to identify equivalent executions
      hash: CacheKeyType;
      // The AbortController of the current execution
      abortController: AbortController;

      // The options passed to the hook/run function
      runOptions: RunConfig;
    } | null>(null);

    const lastResolvedRef = useRef<
      | {
          data: Awaited<ReturnType<Fn>>;
          startedAt: number;
          // A symbol uniquely identifying the current execution
          symbol: Symbol;
          // The cache key of the current execution. Used to identify equivalent executions
          hash: CacheKeyType;
        }
      | undefined
    >(undefined);

    const cancel = useCallback(() => {
      if (!runningRef.current) return;
      runningRef.current.abortController.abort();

      // We can't leave canceled promises in the cache, because they might be reused before they receive the abort signal
      promiseCache.delete(runningRef.current.hash);
    }, []);

    // Cancel on unmount
    useEffect(() => {
      return () => {
        if (runningRef.current?.runOptions.cancelOnUnmount) {
          cancel();
        }
      };
    }, [cancel]);

    const createRunFn = useEventCallback(
      (runOptions?: RunConfig) =>
        (...args: MyRunParams) => {
          const defaultOptions: Required<RunConfig> = {
            cancelOnUnmount: false,
            keepPreviousData: false,
            ignoreCache: false,
          };
          const opts = {
            ...defaultOptions,
            ...hookOptions,
            ...runOptions,
          };

          const hash = cacheKey(args);

          const executionSymbol = Symbol();
          const abortController = new AbortController();
          const userPromise = makeControlledPromise<{
            /**
             * The data that was returned by the async function.
             */
            data: Awaited<ReturnType<Fn>>;
            /**
             * Whether the execution is the latest one. Useful for avoiding race conditions.
             */
            latest: boolean;
            /**
             * Whether the data was returned from the cache.
             */
            cached: boolean;
          }>();
          const startedAt = Date.now();

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
              if (runningRef.current?.symbol == executionSymbol) {
                runningRef.current = null;

                setIsPending(false);

                // If the promise is still running, we cancel it
                // Note that other executions might have been started in the meantime, specifically because AbortController.abort() doesn't run synchronously,
                // so we only clean up if the current execution is still running
                if (abortController.signal.aborted) {
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
            startedAt,
            symbol: executionSymbol,
            hash,
            abortController,
            runOptions: opts,
          };

          // Set pending state
          setIsPending(true);
          setIsRejected(false);
          setError(undefined);
          setIsInitial(false);
          if (!opts.keepPreviousData) {
            setData(undefined);
          }

          // If the async function supports aborting, we pass the AbortController's signal to it in addition to the arguments
          const promise = abortable
            ? // @ts-ignore TypeScript is not smart enough for this yet
              memoizedFn.withOpts({ ignoreCache: opts.ignoreCache })(...args, {
                signal: abortController.signal,
              })
            : memoizedFn.withOpts({ ignoreCache: opts.ignoreCache })(
                ...(args as Parameters<Fn>)
              );

          promise
            .then((data) => {
              // only set data and resolve the user promise if the promise is not aborted
              if (abortController.signal.aborted) return;

              userPromise.resolve({
                ...data,
                latest:
                  !lastResolvedRef.current ||
                  lastResolvedRef.current?.startedAt < startedAt,
              });

              // If the current execution started after the last resolved execution started, we set the data
              // This is different from e.g. https://github.com/slorber/react-async-hook, where data is only set if the current execution is the latest one
              // That is overly restrictive, because it means that if the user calls the hook multiple times in a row, only the last call will be considered
              // Even though considering earlier calls doesn't in itself lead to data inconsistency, as long as we don't discard data from later executions as a result
              if (
                !lastResolvedRef.current ||
                // Checking <= instead of < mainly so that a pattern like this works:
                // run(); run.withOpts({ ignoreCache: true }); // A cached run will be overwritten by the non-cached run started at the same time
                lastResolvedRef.current?.startedAt <= startedAt
              ) {
                lastResolvedRef.current = {
                  ...data,
                  startedAt,
                  symbol: executionSymbol,
                  hash,
                };

                setData(data.data);
              }

              if (runningRef.current?.symbol === executionSymbol) {
                setIsRejected(false);
              }
            })
            .catch((error) => {
              // only handle the error if the promise is not aborted
              if (abortController.signal.aborted) {
                // If the promise is aborted, but the error caught is the abort reason, we forward it to the user promise
                if (error === abortController.signal.reason) {
                  userPromise.reject(error);
                }

                return;
              }

              // Forward the error to the user promise
              userPromise.reject(error);

              // We only set the error state if the current execution is the latest one
              // This is different from the data state, where we replace the data as long as the execution started after the last resolved execution started
              // This is necessary to clearly associate the error with the execution that caused it
              if (runningRef.current?.symbol === executionSymbol) {
                // Set error state
                setError(error);
                setIsRejected(true);
              }
            });

          return userPromise.promise;
        }
    );

    const run = (...args: MyRunParams) => createRunFn()(...args);

    /**
     * Override the options given to the hook.
     */
    run.withOpts = createRunFn;

    return {
      /**
       * The data returned by the async function.
       */
      data,
      /**
       * The error thrown by the async function.
       */
      error,
      /**
       * Whether the async function is currently running.
       */
      isPending,
      /**
       * Whether the async function has been run at least once.
       */
      isInitial,
      /**
       * Whether the async function has resolved.
       */
      isResolved,
      /**
       * Whether the async function has rejected.
       */
      isRejected,
      /**
       * Whether the async function has settled (either resolved or rejected).
       */
      isSettled,
      /**
       * The current status of the async function. Can be one of "pending", "initial", "resolved", "rejected".
       */
      status,
      /**
       * Run the async function.
       *
       * @param args Same arguments as those of the async function
       */
      run,
      /**
       * Cancel the current execution.
       */
      cancel,
    } as const;
  };
};

export type { CacheStorage } from "./pMemoize";
