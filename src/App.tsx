import "./App.css";
import { ScadEditor } from "./components/scadEditor";

function App() {
  return (
    <main className="bg-black w-full h-screen grid grid-cols-2">
      <div>
        <ScadEditor />
      </div>
      <div>
        <ScadEditor />
      </div>
    </main>
  );
}

export default App;
