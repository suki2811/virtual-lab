import { forwardRef } from 'react';

interface PhysicsCanvasProps {
  width?: number;
  height?: number;
  className?: string;
}

/**
 * A reusable canvas component for the physics simulation.
 * Supports ref forwarding for external physics engine attachment.
 * Resizing is managed externally by the physics engine hook.
 */
const PhysicsCanvas = forwardRef<HTMLCanvasElement, PhysicsCanvasProps>(
  ({ width, height, className = "" }, ref) => {
    return (
      <div className={`relative w-full h-full bg-white overflow-hidden ${className}`}>
        <canvas
          ref={ref}
          width={width}
          height={height}
          className="w-full h-full"
        />
      </div>
    );
  }
);

PhysicsCanvas.displayName = 'PhysicsCanvas';

export default PhysicsCanvas;
export { PhysicsCanvas };
