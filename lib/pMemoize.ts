import { PopTuple } from "./typeUtils";

export type RunParams<
  Abortable extends boolean,
  Fn extends (...args: any[]) => any
> = Abortable extends true
  ? PopTuple<Required<Parameters<Fn>>>
  : Parameters<Fn>;

type AsyncFunction = (...arguments_: any[]) => Promise<unknown>;
type AsyncReturnType<Target extends AsyncFunction> = Awaited<
  ReturnType<Target>
>;

// TODO: Use the one in `type-fest` when it's added there.
export type AnyAsyncFunction = (
  ...arguments_: readonly any[]
) => Promise<unknown | void>;

export type CacheStorage<KeyType, ValueType> = {
  /**
   * Returns a boolean asserting whether an element is present with the given key in the storage or not.
   *
   * @param key The key of the element to add to the Map object.
   */
  has: (key: KeyType) => Promise<boolean> | boolean;
  /**
   * Returns the element associated to the given key, or undefined if there is none.
   *
   * @param key The key of the element to return from the storage.
   * @returns The element associated with the specified key or undefined if the key can't be found in the storage.
   */
  get: (key: KeyType) => Promise<ValueType | undefined> | ValueType | undefined;
  /**
   * Sets the value for the key in the storage.
   *
   * @param key The key of the element to add to the storage.
   * @param value The value of the element to add to the storage.
   */
  set: (key: KeyType, value: ValueType) => Promise<unknown> | unknown;
  /**
   * Removes any value associated to the key.
   *
   * @param key The key of the element to remove from the storage.
   */
  delete: (key: KeyType) => unknown;
  /**
   * Removes all key/value pairs from the storage.
   */
  clear?: () => unknown;
};

export type PromiseWithIsCached<T> = Promise<{ data: T; cached: boolean }>;

export type Options<
  Fn extends AnyAsyncFunction,
  CacheKeyType,
  Abortable extends boolean
> = {
  /**
	Determines the cache key for storing the result based on the function arguments. By default, __only the first argument is considered__ and it only works with [primitives](https://developer.mozilla.org/en-US/docs/Glossary/Primitive).
	A `cacheKey` function can return any type supported by `Map` (or whatever structure you use in the `cache` option).
	You can have it cache **all** the arguments by value with `JSON.stringify`, if they are compatible:
	```
	{cacheKey: JSON.stringify}
	```
	Or you can use a more full-featured serializer like [serialize-javascript](https://github.com/yahoo/serialize-javascript) to add support for `RegExp`, `Date` and so on.
	```
	import serializeJavascript from 'serialize-javascript';
	{cacheKey: serializeJavascript}
	```
	@default arguments_ => arguments_[0]
	@example arguments_ => JSON.stringify(arguments_)
	*/
  readonly cacheKey?: (arguments_: RunParams<Abortable, Fn>) => CacheKeyType;

  /**
	Use a different cache storage. Must implement the following methods: `.has(key)`, `.get(key)`, `.set(key, value)`, `.delete(key)`, and optionally `.clear()`. You could for example use a `WeakMap` instead or [`quick-lru`](https://github.com/sindresorhus/quick-lru) for a LRU cache. To disable caching so that only concurrent executions resolve with the same value, pass `false`.
	@default new Map()
	@example new WeakMap()
	*/
  readonly cache?: CacheStorage<CacheKeyType, AsyncReturnType<Fn>> | false;

  /**
   * Whether the function is abortable. If it is, the last argument will be treated as an AbortSignal.
   */
  readonly abortable?: Abortable;

  /**
   * A `Map` to store the promises for the memoized function. By default, a `Map` is used. This is useful if you want to share the cache across multiple instances of the memoized function.
   */
  readonly promiseCache?: Map<
    CacheKeyType,
    PromiseWithIsCached<AsyncReturnType<Fn>>
  >;
};

export default function pMemoize<
  Fn extends AnyAsyncFunction,
  CacheKeyType,
  Abortable extends boolean = false
>(fn: Fn, options: Options<Fn, CacheKeyType, Abortable>) {
  type CacheParams = RunParams<Abortable, Fn>;

  const cache = options?.cache ?? new Map<CacheKeyType, AsyncReturnType<Fn>>();
  const cacheKey =
    options?.cacheKey ?? (([firstArgument]) => firstArgument as CacheKeyType);
  const abortable = options?.abortable ?? false;

  // Promise objects can't be serialized so we keep track of them internally and only provide their resolved values to `cache`
  // `Promise<AsyncReturnType<FunctionToMemoize>>` is used instead of `ReturnType<FunctionToMemoize>` because promise properties are not kept
  const promiseCache =
    options?.promiseCache ??
    new Map<CacheKeyType, PromiseWithIsCached<AsyncReturnType<Fn>>>();

  const createMemoizedRun = ({
    ignoreCache = false,
  }: { ignoreCache?: boolean } = {}) =>
    function (
      this: any,
      ...arguments_: Parameters<Fn>
    ): PromiseWithIsCached<AsyncReturnType<Fn>> {
      // If async function is abortable, we don't use the last parameter for the cache key, because it's the abort signal
      const key = abortable
        ? cacheKey(arguments_.slice(0, -1) as CacheParams)
        : cacheKey(arguments_ as CacheParams);

      if (promiseCache.has(key) && !ignoreCache) {
        return promiseCache.get(key)!;
      }

      const promise = (async (): PromiseWithIsCached<AsyncReturnType<Fn>> => {
        try {
          if (cache && (await cache.has(key)) && !ignoreCache) {
            return { data: (await cache.get(key))!, cached: true };
          }

          const promise = fn.apply(this, arguments_) as Promise<
            AsyncReturnType<Fn>
          >;

          const result = await promise;

          try {
            return { data: result, cached: false };
          } finally {
            if (cache) {
              await cache.set(key, result);
            }
          }
        } finally {
          promiseCache.delete(key);
        }
      })();

      promiseCache.set(key, promise);

      return promise;
    };

  const memoized = (...args: Parameters<Fn>) =>
    createMemoizedRun({ ignoreCache: false })(...args);
  memoized.withOpts = createMemoizedRun;

  return memoized;
}
