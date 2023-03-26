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
  has: (key: KeyType) => Promise<boolean> | boolean;
  get: (key: KeyType) => Promise<ValueType | undefined> | ValueType | undefined;
  set: (key: KeyType, value: ValueType) => Promise<unknown> | unknown;
  delete: (key: KeyType) => unknown;
  clear?: () => unknown;
};

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
	import pMemoize from 'p-memoize';
	pMemoize(function_, {cacheKey: JSON.stringify});
	```
	Or you can use a more full-featured serializer like [serialize-javascript](https://github.com/yahoo/serialize-javascript) to add support for `RegExp`, `Date` and so on.
	```
	import pMemoize from 'p-memoize';
	import serializeJavascript from 'serialize-javascript';
	pMemoize(function_, {cacheKey: serializeJavascript});
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

  readonly abortable?: Abortable;

  readonly promiseCache?: Map<CacheKeyType, Promise<AsyncReturnType<Fn>>>;
};

export default function pMemoize<
  Fn extends AnyAsyncFunction,
  CacheKeyType,
  Abortable extends boolean = false
>(fn: Fn, options: Options<Fn, CacheKeyType, Abortable>): Fn {
  type CacheParams = RunParams<Abortable, Fn>;

  const cache = options?.cache ?? new Map();
  const cacheKey =
    options?.cacheKey ?? (([firstArgument]) => firstArgument as CacheKeyType);
  const abortable = options?.abortable ?? false;

  // Promise objects can't be serialized so we keep track of them internally and only provide their resolved values to `cache`
  // `Promise<AsyncReturnType<FunctionToMemoize>>` is used instead of `ReturnType<FunctionToMemoize>` because promise properties are not kept
  const promiseCache =
    options?.promiseCache ??
    new Map<CacheKeyType, Promise<AsyncReturnType<Fn>>>();

  const memoized = function (
    this: any,
    ...arguments_: Parameters<Fn>
  ): Promise<AsyncReturnType<Fn>> {
    // If async function is abortable, we don't use the last parameter for the cache key, because it's the abort signal
    const key = abortable
      ? cacheKey(arguments_.slice(0, -1) as CacheParams)
      : cacheKey(arguments_ as CacheParams);

    if (promiseCache.has(key)) {
      return promiseCache.get(key)!;
    }

    const promise = (async () => {
      try {
        if (cache && (await cache.has(key))) {
          return (await cache.get(key))!;
        }

        const promise = fn.apply(this, arguments_) as Promise<
          AsyncReturnType<Fn>
        >;

        const result = await promise;

        try {
          return result;
        } finally {
          if (cache) {
            await cache.set(key, result);
          }
        }
      } finally {
        promiseCache.delete(key);
      }
    })() as Promise<AsyncReturnType<Fn>>;

    promiseCache.set(key, promise);

    return promise;
  } as Fn;

  return memoized;
}
