declare global {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        src: string;
        alt: string;
      };
    }
  }
}

import "@google/model-viewer";
import { useScadStore } from "../store/scadStore";

export function Viewer() {
  const { modelUrl } = useScadStore();

  return (
    <model-viewer
      style={{ width: "100%", height: "100%" }}
      src={modelUrl}
      alt="A 3D model of an object"
      camera-controls
      camera-target="0m 0m 0m"
      disable-tap
      camera-orbit="45deg 55deg 100m"
    ></model-viewer>
  );
}
