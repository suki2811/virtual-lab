import React from 'react';

interface SpringPreviewProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const SpringPreview: React.FC<SpringPreviewProps> = ({ x1, y1, x2, y2 }) => {
  // Calculate angle and distance
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  // Spring parameters
  const coils = 12;
  const coilAmplitude = 8;
  const startOffset = 15;
  const endOffset = 15;
  
  // Generate spring path
  let path = `M 0 0 `; // Start at origin
  
  const springLen = distance - startOffset - endOffset;
  if (springLen > 0) {
    // Start straight connector
    path += `L ${startOffset} 0 `;
    
    // Draw coils
    const coilStep = springLen / coils;
    for (let i = 0; i < coils; i++) {
      const currentX = startOffset + i * coilStep;
      path += `L ${currentX + coilStep / 4} ${coilAmplitude} `;
      path += `L ${currentX + (coilStep / 4) * 3} ${-coilAmplitude} `;
    }
    
    // End at center line
    path += `L ${startOffset + springLen} 0 `;
  }
  
  // End straight connector
  path += `L ${distance} 0`;

  return (
    <g transform={`translate(${x1},${y1}) rotate(${angle})`}>
      {/* Spring path - solid black line */}
      <path
        d={path}
        fill="none"
        stroke="#000000"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
      
      {/* Small circular end connector at start */}
      <circle 
        cx="0" 
        cy="0" 
        r="3" 
        fill="none"
        stroke="#000000" 
        strokeWidth="1.5"
      />
      
      {/* Small circular end connector at end */}
      <circle 
        cx={distance} 
        cy="0" 
        r="3" 
        fill="none"
        stroke="#000000" 
        strokeWidth="1.5"
      />
    </g>
  );
};

export default SpringPreview;
