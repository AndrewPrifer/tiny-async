import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createHook } from "../lib/main";

const useHelloQuery = createHook((name: string): Promise<string> => {
  return new Promise((resolve) => {
    if (name === "Error") {
      throw new Error("Error");
    }
    setTimeout(() => {
      resolve(`I'm ${name}`);
    }, 2000);
  });
});

const useAbortableHelloQuery = createHook(
  (name: string, { signal }: { signal: AbortSignal }): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      signal.addEventListener("abort", () => {
        reject(signal.reason);
      });
      if (name === "Error") {
        reject(new Error("Error"));
      }
      setTimeout(() => {
        resolve(`I'm ${name}`);
      }, 2000);
    });
  },
  { abortable: true }
);

function useWindowFocus() {
  const [focused, setFocus] = useState(true);
  const handleFocus = () => setFocus(true);
  const handleBlur = () => setFocus(false);

  useEffect(() => {
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  });

  return focused;
}

function useIsOnline() {
  let [isOnline, setIsOnline] = useState(window.navigator.onLine);

  useEffect(() => {
    function handler() {
      setIsOnline(window.navigator.onLine);
    }

    window.addEventListener("online", handler);
    window.addEventListener("offline", handler);

    return () => {
      window.removeEventListener("online", handler);
      window.removeEventListener("offline", handler);
    };
  }, []);

  return isOnline;
}

const useTinySWRQuery = createHook(
  (key: string, fetcher: () => Promise<any>) => {
    return fetcher();
  }
);

const useTinySWR = <T,>(
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
  const { data, error, isPending, run } = useTinySWRQuery({
    keepPreviousData,
  });

  const [isReValidating, setIsRevalidating] = useState(false);

  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  useEffect(() => {
    run.withOpts({ ignoreCache: revalidateIfStale })(key, fetcherRef.current);
  }, [key]);

  const windowFocus = useWindowFocus();

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

function MyComponent({ name }: { name: string }) {
  const { data, error, isLoading, isValidating } = useTinySWR(
    name,
    () => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(`${name} ${Math.random()}`);
        }, 2000);
      });
    },
    { fallbackData: "Fallback data here" }
  );

  return (
    <div>
      <p>{data}</p>
      <p>{error && error.message}</p>
      <p>{isLoading && "loading"}</p>
      <p>{isValidating && "validating"}</p>
    </div>
  );
}

function App() {
  const query = useAbortableHelloQuery();

  const [name, setName] = useState("Andrew");
  const [tempName, setTempName] = useState("");

  return (
    <div>
      <button
        onClick={async () => {
          const res = await query.run("Andrew");
        }}
      >
        Andrew
      </button>
      <button
        onClick={() => {
          query.run
            .withOpts({ ignoreCache: true })("Peter")
            .then((res) => {
              console.log(res);
            });
        }}
      >
        Peter
      </button>
      <button
        onClick={async () => {
          query.run("Error").then((res) => {});
        }}
      >
        Error
      </button>
      <button onClick={() => query.cancel()}>Cancel</button>
      <button
        onClick={async () => {
          query.run("Sonia");
          query.cancel();
          query.run.withOpts({ ignoreCache: true })("Sonia");
        }}
      >
        Sonia
      </button>
      <pre>{JSON.stringify(query)}</pre>
      <input value={tempName} onChange={(e) => setTempName(e.target.value)} />
      <button
        onClick={() => {
          setName(tempName);
        }}
      >
        set name
      </button>
      <MyComponent name={name} />
    </div>
  );
}

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
