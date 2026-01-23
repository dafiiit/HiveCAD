import { useState } from "react";
import { Home } from "lucide-react";

interface ViewCubeProps {
  onViewChange?: (view: string) => void;
}

const ViewCube = ({ onViewChange }: ViewCubeProps) => {
  const [hoveredFace, setHoveredFace] = useState<string | null>(null);

  const handleClick = (view: string) => {
    onViewChange?.(view);
  };

  return (
    <div className="cad-viewcube select-none">
      {/* Home button */}
      <button 
        className="absolute -top-6 left-1/2 -translate-x-1/2 p-1 hover:bg-secondary rounded transition-colors"
        onClick={() => handleClick("home")}
      >
        <Home className="w-4 h-4 text-muted-foreground" />
      </button>

      {/* 3D Cube visualization */}
      <div 
        className="w-full h-full relative"
        style={{
          perspective: "200px",
          perspectiveOrigin: "50% 50%"
        }}
      >
        <div
          className="w-full h-full relative"
          style={{
            transformStyle: "preserve-3d",
            transform: "rotateX(-20deg) rotateY(-30deg)"
          }}
        >
          {/* Front face */}
          <div
            className={`absolute inset-0 flex items-center justify-center text-2xs font-medium cursor-pointer transition-colors ${
              hoveredFace === "front" ? "bg-primary/40" : "bg-viewcube-face"
            } border border-viewcube-edge/50`}
            style={{
              transform: "translateZ(40px)",
              width: "80px",
              height: "80px"
            }}
            onMouseEnter={() => setHoveredFace("front")}
            onMouseLeave={() => setHoveredFace(null)}
            onClick={() => handleClick("front")}
          >
            FRONT
          </div>

          {/* Back face */}
          <div
            className={`absolute flex items-center justify-center text-2xs font-medium cursor-pointer transition-colors ${
              hoveredFace === "back" ? "bg-primary/40" : "bg-viewcube-face"
            } border border-viewcube-edge/50`}
            style={{
              transform: "translateZ(-40px) rotateY(180deg)",
              width: "80px",
              height: "80px"
            }}
            onMouseEnter={() => setHoveredFace("back")}
            onMouseLeave={() => setHoveredFace(null)}
            onClick={() => handleClick("back")}
          >
            BACK
          </div>

          {/* Right face */}
          <div
            className={`absolute flex items-center justify-center text-2xs font-medium cursor-pointer transition-colors ${
              hoveredFace === "right" ? "bg-primary/40" : "bg-viewcube-face"
            } border border-viewcube-edge/50`}
            style={{
              transform: "translateX(40px) rotateY(90deg)",
              width: "80px",
              height: "80px",
              left: "0"
            }}
            onMouseEnter={() => setHoveredFace("right")}
            onMouseLeave={() => setHoveredFace(null)}
            onClick={() => handleClick("right")}
          >
            RIGHT
          </div>

          {/* Left face */}
          <div
            className={`absolute flex items-center justify-center text-2xs font-medium cursor-pointer transition-colors ${
              hoveredFace === "left" ? "bg-primary/40" : "bg-viewcube-face"
            } border border-viewcube-edge/50`}
            style={{
              transform: "translateX(-40px) rotateY(-90deg)",
              width: "80px",
              height: "80px",
              left: "0"
            }}
            onMouseEnter={() => setHoveredFace("left")}
            onMouseLeave={() => setHoveredFace(null)}
            onClick={() => handleClick("left")}
          >
            LEFT
          </div>

          {/* Top face */}
          <div
            className={`absolute flex items-center justify-center text-2xs font-medium cursor-pointer transition-colors ${
              hoveredFace === "top" ? "bg-primary/40" : "bg-viewcube-face"
            } border border-viewcube-edge/50`}
            style={{
              transform: "translateY(-40px) rotateX(90deg)",
              width: "80px",
              height: "80px",
              top: "0"
            }}
            onMouseEnter={() => setHoveredFace("top")}
            onMouseLeave={() => setHoveredFace(null)}
            onClick={() => handleClick("top")}
          >
            TOP
          </div>

          {/* Bottom face */}
          <div
            className={`absolute flex items-center justify-center text-2xs font-medium cursor-pointer transition-colors ${
              hoveredFace === "bottom" ? "bg-primary/40" : "bg-viewcube-face"
            } border border-viewcube-edge/50`}
            style={{
              transform: "translateY(40px) rotateX(-90deg)",
              width: "80px",
              height: "80px",
              top: "0"
            }}
            onMouseEnter={() => setHoveredFace("bottom")}
            onMouseLeave={() => setHoveredFace(null)}
            onClick={() => handleClick("bottom")}
          >
            BOTTOM
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViewCube;
