import React from 'react';
import { Play, BookOpen, Users, Beaker } from 'lucide-react';

interface WelcomeScreenProps {
  onStart: () => void;
  onOpenTemplates: () => void;
  onOpenRoom: () => void;
  onOpenHelp: () => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onStart,
  onOpenTemplates,
  onOpenRoom,
  onOpenHelp
}) => {
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center z-50">
      <div className="max-w-4xl mx-auto px-8 text-center">
        <div className="mb-8">
          <div className="flex items-center justify-center mb-4">
            <Beaker className="text-purple-400" size={64} />
          </div>
          <h1 className="text-6xl font-bold text-white mb-4">VIRTUAL-LAB</h1>
          <p className="text-xl text-gray-300">
            Collaborative 2D Physics Sandbox for Learning & Experimentation
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
          <button
            onClick={onStart}
            className="group bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 p-8 rounded-2xl transition-all transform hover:scale-105 shadow-2xl"
          >
            <Play className="mx-auto mb-4 text-white group-hover:scale-110 transition-transform" size={48} />
            <h3 className="text-2xl font-bold text-white mb-2">Start Building</h3>
            <p className="text-gray-200">Create your own physics experiments from scratch</p>
          </button>

          <button
            onClick={onOpenTemplates}
            className="group bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 p-8 rounded-2xl transition-all transform hover:scale-105 shadow-2xl"
          >
            <BookOpen className="mx-auto mb-4 text-white group-hover:scale-110 transition-transform" size={48} />
            <h3 className="text-2xl font-bold text-white mb-2">Browse Templates</h3>
            <p className="text-gray-200">Explore pre-built experiments and scenarios</p>
          </button>

          <button
            onClick={onOpenRoom}
            className="group bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700 p-8 rounded-2xl transition-all transform hover:scale-105 shadow-2xl"
          >
            <Users className="mx-auto mb-4 text-white group-hover:scale-110 transition-transform" size={48} />
            <h3 className="text-2xl font-bold text-white mb-2">Collaborate</h3>
            <p className="text-gray-200">Join a room and work together in real-time</p>
          </button>

          <button
            onClick={onOpenHelp}
            className="group bg-gradient-to-r from-orange-600 to-yellow-600 hover:from-orange-700 hover:to-yellow-700 p-8 rounded-2xl transition-all transform hover:scale-105 shadow-2xl"
          >
            <BookOpen className="mx-auto mb-4 text-white group-hover:scale-110 transition-transform" size={48} />
            <h3 className="text-2xl font-bold text-white mb-2">Learn How</h3>
            <p className="text-gray-200">View tutorials and usage instructions</p>
          </button>
        </div>

        <div className="mt-12 text-gray-400 text-sm">
          <p>Built with React, Matter.js, and Socket.io</p>
          <p className="mt-2">
            <span className="inline-block px-3 py-1 bg-gray-800 rounded-full mr-2">Physics Simulation</span>
            <span className="inline-block px-3 py-1 bg-gray-800 rounded-full mr-2">Real-time Collaboration</span>
            <span className="inline-block px-3 py-1 bg-gray-800 rounded-full">Analytics Dashboard</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default WelcomeScreen;
