import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { User } from '../types/physics';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

export const useWebSocket = (roomId: string, userName: string) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling']
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setConnected(true);
      console.log('Connected to server');
      newSocket.emit('join-room', { roomId, userName });
    });

    newSocket.on('disconnect', () => {
      setConnected(false);
      console.log('Disconnected from server');
    });

    newSocket.on('room-users', (roomUsers: User[]) => {
      setUsers(roomUsers);
    });

    return () => {
      newSocket.disconnect();
    };
  }, [roomId, userName]);

  const emitPhysicsUpdate = (data: any) => {
    if (socket && connected) {
      socket.emit('physics-update', { roomId, data });
    }
  };

  const onPhysicsUpdate = (callback: (data: any) => void) => {
    if (socket) {
      socket.on('physics-update', callback);
    }
  };

  const emitObjectAdded = (object: any) => {
    if (socket && connected) {
      socket.emit('object-added', { roomId, object });
    }
  };

  const onObjectAdded = (callback: (object: any) => void) => {
    if (socket) {
      socket.on('object-added', callback);
    }
  };

  const emitConstraintAdded = (constraint: any) => {
    if (socket && connected) {
      socket.emit('constraint-added', { roomId, constraint });
    }
  };

  const onConstraintAdded = (callback: (constraint: any) => void) => {
    if (socket) {
      socket.on('constraint-added', callback);
    }
  };

  return {
    socket,
    connected,
    users,
    emitPhysicsUpdate,
    onPhysicsUpdate,
    emitObjectAdded,
    onObjectAdded,
    emitConstraintAdded,
    onConstraintAdded
  };
};
