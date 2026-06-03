import React from 'react';
import { X, Info } from 'lucide-react';

interface InstructionsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const InstructionsPanel: React.FC<InstructionsPanelProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden">
        <div className="bg-gray-900 p-4 flex items-center justify-between border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Info className="text-blue-400" size={24} />
            <h2 className="text-2xl font-bold text-white">How to Use VIRTUAL-LAB</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)] space-y-6">
          <section>
            <h3 className="text-xl font-bold text-white mb-3">🎯 Adding Objects (New Placement System)</h3>
            <ol className="list-decimal list-inside text-gray-300 space-y-2">
              <li>Click the object type button (<strong className="text-red-400">Box</strong>, <strong className="text-blue-400">Circle</strong>, or <strong className="text-gray-400">Ground</strong>)</li>
              <li>A <strong>semi-transparent preview</strong> appears following your cursor</li>
              <li>Move your mouse to <strong>position precisely</strong></li>
              <li><strong className="text-green-400">Right-click</strong> to place permanently</li>
              <li>Press <strong className="text-yellow-400">ESC</strong> to cancel placement</li>
            </ol>
            <div className="mt-3 bg-gray-900 p-3 rounded-lg">
              <p className="text-gray-400 text-sm">
                <strong>Preview Mode:</strong> Objects appear at 50% opacity with a white outline. They follow your cursor and don't interact with physics until you right-click to finalize.
              </p>
            </div>
          </section>

          <section>
            <h3 className="text-xl font-bold text-white mb-3">🔗 Creating Constraints</h3>
            <ol className="list-decimal list-inside text-gray-300 space-y-2">
              <li>Click on <strong className="text-yellow-400">Rope</strong>, <strong className="text-purple-400">Spring</strong>, or <strong className="text-orange-400">Pivot</strong></li>
              <li>Click on the <strong>first object</strong> to connect</li>
              <li>Click on the <strong>second object</strong> to complete the connection</li>
            </ol>
            <div className="mt-3 bg-gray-900 p-3 rounded-lg">
              <p className="text-gray-400 text-sm">
                <strong>Rope:</strong> Flexible connection with limited length<br />
                <strong>Spring:</strong> Elastic connection that bounces<br />
                <strong>Pivot:</strong> Fixed rotation point
              </p>
            </div>
          </section>

          <section>
            <h3 className="text-xl font-bold text-white mb-3">📊 Analytics Dashboard</h3>
            <ul className="list-disc list-inside text-gray-300 space-y-2">
              <li>Click on any object to select it</li>
              <li>View real-time velocity, energy, and position data</li>
              <li>Watch energy transformation graphs</li>
            </ul>
          </section>

          <section>
            <h3 className="text-xl font-bold text-white mb-3">💾 Experiments</h3>
            <ul className="list-disc list-inside text-gray-300 space-y-2">
              <li><strong>Save:</strong> Store your current setup for later</li>
              <li><strong>Load:</strong> Choose from pre-made templates or your saved experiments</li>
              <li>Try the <strong>Pendulum</strong>, <strong>Bridge</strong>, or <strong>Catapult</strong> templates!</li>
            </ul>
          </section>

          <section>
            <h3 className="text-xl font-bold text-white mb-3">👥 Multiplayer Collaboration</h3>
            <ol className="list-decimal list-inside text-gray-300 space-y-2">
              <li>Click the <strong className="text-purple-400">Room</strong> button</li>
              <li>Choose <strong>Create Room</strong> to start a new session</li>
              <li>Share the <strong>Room ID</strong> with collaborators</li>
              <li>Or use <strong>Join Room</strong> to enter an existing session</li>
            </ol>
            <div className="mt-3 bg-gray-900 p-3 rounded-lg">
              <p className="text-gray-400 text-sm">
                Note: The multiplayer server needs to be running. Start it with: <code className="bg-gray-800 px-2 py-1 rounded">node server/index.js</code>
              </p>
            </div>
          </section>

          <section>
            <h3 className="text-xl font-bold text-white mb-3">🎮 Controls</h3>
            <div className="space-y-3">
              <div>
                <h4 className="text-white font-semibold mb-2">Mouse Controls:</h4>
                <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
                  <li><strong>Left-Click:</strong> Select objects or create constraints</li>
                  <li><strong>Right-Click:</strong> Finalize object placement (in preview mode)</li>
                  <li><strong>Click & Drag:</strong> Move objects around after placement</li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-semibold mb-2">Keyboard:</h4>
                <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
                  <li><strong>ESC:</strong> Cancel current placement preview</li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-semibold mb-2">Simulation:</h4>
                <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
                  <li><strong>Play/Pause:</strong> Control the simulation</li>
                  <li><strong>Reset:</strong> Return to initial state of current experiment</li>
                  <li><strong>Clear:</strong> Remove all objects from the canvas</li>
                </ul>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xl font-bold text-white mb-3">🔬 Physics Concepts</h3>
            <div className="bg-gray-900 p-4 rounded-lg space-y-2 text-gray-300 text-sm">
              <p><strong>Conservation of Energy:</strong> Watch total energy remain constant</p>
              <p><strong>Kinetic Energy:</strong> Energy of motion (½mv²)</p>
              <p><strong>Potential Energy:</strong> Energy based on height (mgh)</p>
              <p><strong>Oscillations:</strong> Study pendulums and springs</p>
              <p><strong>Collisions:</strong> Elastic impacts between objects</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default InstructionsPanel;
