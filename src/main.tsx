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

function App() {
  const query = useHelloQuery();

  return (
    <div>
      <button
        onClick={async () => {
          const res = await query.run("Andrew");
          console.log(res);
        }}
      >
        Andrew
      </button>
      <button
        onClick={() => {
          query.runFresh("Peter").then((res) => {
            console.log(res);
          });
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
      <pre>{JSON.stringify(query)}</pre>
    </div>
  );
}

createRoot(document.getElementById("app")!).render(<App />);
