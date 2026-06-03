import React, { useState } from 'react';
import { X, Users, LogIn, Plus } from 'lucide-react';
import { User } from '../types/physics';

interface RoomManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onJoinRoom: (roomId: string, userName: string) => void;
  users: User[];
  connected: boolean;
  currentRoom: string;
}

const RoomManager: React.FC<RoomManagerProps> = ({
  isOpen,
  onClose,
  onJoinRoom,
  users,
  connected,
  currentRoom
}) => {
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const [mode, setMode] = useState<'join' | 'create'>('join');

  const handleJoin = () => {
    if (roomId.trim() && userName.trim()) {
      onJoinRoom(roomId, userName);
      onClose();
    }
  };

  const handleCreate = () => {
    if (userName.trim()) {
      const newRoomId = Math.random().toString(36).substring(7).toUpperCase();
      setRoomId(newRoomId);
      onJoinRoom(newRoomId, userName);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-md">
        <div className="bg-gray-900 p-4 flex items-center justify-between border-b border-gray-700 rounded-t-lg">
          <div className="flex items-center gap-2">
            <Users className="text-purple-400" size={24} />
            <h2 className="text-2xl font-bold text-white">Multiplayer Room</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6">
          {connected ? (
            <div>
              <div className="bg-green-900 border border-green-700 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 text-green-300 mb-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="font-semibold">Connected to Room: {currentRoom}</span>
                </div>
                <div className="text-green-400 text-sm">
                  {users.length} user{users.length !== 1 ? 's' : ''} online
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-white font-semibold mb-2">Active Users:</h3>
                {users.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center gap-3 bg-gray-700 p-3 rounded-lg"
                  >
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: user.color }}
                    ></div>
                    <span className="text-white">{user.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div className="flex gap-2 mb-6">
                <button
                  onClick={() => setMode('join')}
                  className={`flex-1 px-4 py-2 rounded-lg font-semibold transition-colors ${
                    mode === 'join'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-650'
                  }`}
                >
                  <LogIn className="inline mr-2" size={18} />
                  Join Room
                </button>
                <button
                  onClick={() => setMode('create')}
                  className={`flex-1 px-4 py-2 rounded-lg font-semibold transition-colors ${
                    mode === 'create'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-650'
                  }`}
                >
                  <Plus className="inline mr-2" size={18} />
                  Create Room
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-gray-300 mb-2">Your Name</label>
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:border-purple-500"
                    placeholder="Enter your name..."
                  />
                </div>

                {mode === 'join' && (
                  <div>
                    <label className="block text-gray-300 mb-2">Room ID</label>
                    <input
                      type="text"
                      value={roomId}
                      onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                      className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:border-purple-500"
                      placeholder="Enter room ID..."
                    />
                  </div>
                )}

                <button
                  onClick={mode === 'join' ? handleJoin : handleCreate}
                  className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-colors"
                >
                  {mode === 'join' ? 'Join Room' : 'Create Room'}
                </button>

                {mode === 'create' && (
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <p className="text-gray-400 text-sm">
                      A unique room ID will be generated. Share it with collaborators to work together in real-time.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RoomManager;
