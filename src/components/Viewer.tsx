import { useRef, useState, useEffect } from "react";
import { useScadStore } from "../store/scadStore";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src: string;
        alt: string;
        "auto-rotate"?: boolean;
        "shadow-intensity"?: string;
        exposure?: string;
      };
    }
  }
}

import "@google/model-viewer";

export function Viewer() {
  const { modelUrl } = useScadStore();
  const modelViewerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [autoRotate, setAutoRotate] = useState(false);
  const [shadowIntensity, setShadowIntensity] = useState(1);
  const [exposure, setExposure] = useState(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const handleResetCamera = () => {
    if (modelViewerRef.current) {
      modelViewerRef.current.cameraOrbit = "45deg 55deg 100m";
      modelViewerRef.current.cameraTarget = "0m 0m 0m";
    }
  };

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => {
        console.error("Error enabling fullscreen:", err);
      });
    } else {
      document.exitFullscreen().catch((err) => {
        console.error("Error exiting fullscreen:", err);
      });
    }
  };

  const handleRotateExposure = () => {
    setExposure((prev) => {
      if (prev === 1.0) return 1.6;
      if (prev === 1.6) return 0.5;
      return 1.0;
    });
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-[#0f131a] flex items-center justify-center"
    >
      {/* 3D Canvas Coordinate Grid Background (Amber/Teal colored lines coordinate look) */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />

      {/* Floating Top-Left Interaction Help watermark */}
      <div className="absolute top-3 left-3 bg-[#131924]/75 border border-border-figma/40 px-2 py-0.5 rounded text-[10px] text-zinc-500 font-sans tracking-wide select-none z-20 pointer-events-none">
        drag · rotate · scroll · zoom
      </div>

      {/* Model Viewer Native Element */}
      <model-viewer
        ref={modelViewerRef}
        style={{ width: "100%", height: "100%" }}
        src={modelUrl}
        alt="A 3D model of an object"
        camera-controls
        camera-target="0m 0m 0m"
        disable-tap
        camera-orbit="45deg 55deg 100m"
        auto-rotate={autoRotate ? true : undefined}
        shadow-intensity={String(shadowIntensity)}
        exposure={String(exposure)}
      />

      {/* Minimal Floating Canvas Settings Toolbar (Bottom-Right) */}
      <div className="absolute bottom-3 right-3 flex items-center space-x-1.5 bg-[#131924]/85 border border-[#1e293b] p-1 rounded-lg shadow-xl z-20 transition-all select-none">
        {/* Reset Camera */}
        <button
          onClick={handleResetCamera}
          className="p-1 text-zinc-400 hover:text-white rounded hover:bg-[#1d2737] transition-colors"
          title="Reset View"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
            />
          </svg>
        </button>

        {/* Auto Rotate Toggle */}
        <button
          onClick={() => setAutoRotate(!autoRotate)}
          className={`p-1 rounded transition-colors ${
            autoRotate
              ? "text-scad-amber bg-scad-amber-bg border border-scad-amber/20"
              : "text-zinc-400 hover:text-white hover:bg-[#1d2737]"
          }`}
          title="Toggle Auto Rotation"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>

        {/* Shadows Toggle */}
        <button
          onClick={() => setShadowIntensity((prev) => (prev === 0 ? 1 : 0))}
          className={`p-1 rounded transition-colors ${
            shadowIntensity > 0
              ? "text-scad-amber bg-scad-amber-bg border border-scad-amber/20"
              : "text-zinc-400 hover:text-white hover:bg-[#1d2737]"
          }`}
          title="Toggle Shadows"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
            />
          </svg>
        </button>

        {/* Exposure Adjust */}
        <button
          onClick={handleRotateExposure}
          className="px-2 py-1 text-zinc-400 hover:text-white rounded hover:bg-[#1d2737] transition-colors font-mono font-bold text-[9px] uppercase tracking-wider"
          title="Change View Exposure"
        >
          EXP: {exposure.toFixed(1)}x
        </button>

        <div className="w-[1px] h-3.5 bg-zinc-800 mx-1" />

        {/* Fullscreen Toggle */}
        <button
          onClick={handleToggleFullscreen}
          className="p-1 text-zinc-400 hover:text-white rounded hover:bg-[#1d2737] transition-colors"
          title="Toggle Fullscreen"
        >
          {isFullscreen ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
