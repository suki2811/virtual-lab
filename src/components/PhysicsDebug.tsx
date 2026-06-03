import React, { useState, useEffect } from 'react';
import { Bug, Eye, EyeOff } from 'lucide-react';

interface PhysicsDebugProps {
  bodies: Map<string, any>;
  constraints: Map<string, any>;
  engine: any;
}

const PhysicsDebug: React.FC<PhysicsDebugProps> = ({ bodies, constraints, engine }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showColliders, setShowColliders] = useState(false);
  const [bodyCount, setBodyCount] = useState(0);
  const [constraintCount, setConstraintCount] = useState(0);

  useEffect(() => {
    setBodyCount(bodies.size);
    setConstraintCount(constraints.size);
  }, [bodies, constraints]);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 bg-gray-800 hover:bg-gray-700 text-white p-3 rounded-full shadow-lg transition-colors z-40"
        title="Open Debug Panel"
      >
        <Bug size={24} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl p-4 w-80 z-40">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bug className="text-green-400" size={20} />
          <h3 className="text-white font-bold">Physics Debug</h3>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-400 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="space-y-3">
        <div className="bg-gray-900 p-3 rounded-lg">
          <div className="text-gray-400 text-sm mb-1">Bodies</div>
          <div className="text-white text-2xl font-bold">{bodyCount}</div>
        </div>

        <div className="bg-gray-900 p-3 rounded-lg">
          <div className="text-gray-400 text-sm mb-1">Constraints</div>
          <div className="text-white text-2xl font-bold">{constraintCount}</div>
        </div>

        {engine && (
          <div className="bg-gray-900 p-3 rounded-lg">
            <div className="text-gray-400 text-sm mb-1">Engine Status</div>
            <div className="text-white text-sm">
              <div>Gravity: {engine.gravity.y.toFixed(2)}</div>
              <div>Time Scale: {engine.timing?.timeScale || 1}</div>
            </div>
          </div>
        )}

        <div className="bg-gray-900 p-3 rounded-lg">
          <div className="text-gray-400 text-sm mb-2">Body List</div>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {Array.from(bodies.entries()).map(([id, body]) => (
              <div key={id} className="text-xs text-gray-300 flex items-center justify-between">
                <span className="truncate">{body.label}</span>
                <span className={`px-2 py-1 rounded ${body.isStatic ? 'bg-blue-900' : 'bg-green-900'}`}>
                  {body.isStatic ? 'Static' : 'Dynamic'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-900 p-3 rounded-lg">
          <div className="text-gray-400 text-sm mb-2">Constraints</div>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {Array.from(constraints.entries()).map(([id, constraint]) => (
              <div key={id} className="text-xs text-gray-300">
                {constraint.bodyA?.label} ↔ {constraint.bodyB?.label}
                <div className="text-gray-500">Length: {constraint.length?.toFixed(1) || 'N/A'}</div>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => setShowColliders(!showColliders)}
          className={`w-full px-4 py-2 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
            showColliders ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-700 hover:bg-gray-600'
          } text-white`}
        >
          {showColliders ? <Eye size={16} /> : <EyeOff size={16} />}
          {showColliders ? 'Hide Colliders' : 'Show Colliders'}
        </button>
      </div>
    </div>
  );
};

export default PhysicsDebug;
