import { createRoot } from "react-dom/client";
import { createHook } from "../lib/main";

const useHelloQuery = createHook((name: string): Promise<string> => {
  return new Promise((resolve) => {
    if (name === "Error") {
      throw new Error("Error");
    }
    setTimeout(() => {
      resolve(`I'm ${name}`);
    }, 5000);
  });
});

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
      <button onClick={() => query.run("Error")}>Error</button>
      <button onClick={() => query.cancel()}>Cancel</button>
      <pre>{JSON.stringify(query)}</pre>
    </div>
  );
}

createRoot(document.getElementById("app")!).render(<App />);
