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

const useTinySWRQuery = createHook(
  (key: string, fetcher: () => Promise<any>) => {
    return fetcher();
  }
);

const useTinySWR = <T,>(
  key: string,
  fetcher: () => Promise<T>,
  {
    initialData,
  }: {
    initialData?: T;
  } = {}
) => {
  const { data, error, isPending, run, runFresh } = useTinySWRQuery();

  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  useEffect(() => {
    run(key, fetcherRef.current);
  }, [key]);

  return {
    data: data ?? initialData,
    error,
    isLoading: isPending,
    revalidate: () => {
      runFresh(key, fetcherRef.current);
    },
  };
};

function MyComponent({ name }: { name: string }) {
  const { data, error, isLoading } = useTinySWR(
    name,
    () => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(name);
        }, 2000);
      });
    },
    { initialData: "initial" }
  );

  return (
    <div>
      <p>{data}</p>
      <p>{error && error.message}</p>
      <p>{isLoading && "loading"}</p>
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
          query.runFresh("Peter").then((res) => {});
        }}
      >
        Peter
      </button>
      <button
        onClick={async () => {
          query.run("Error");
        }}
      >
        Error
      </button>
      <button onClick={() => query.cancel()}>Cancel</button>
      <button
        onClick={async () => {
          query.run("Sonia");
          query.cancel();
          query.runFresh("Sonia");
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
