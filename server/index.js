import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import mongoose from 'mongoose';
import 'dotenv/config';

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const mongoUri = process.env.MONGODB_URI;
let isMongoConnected = false;

const experimentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  objects: { type: [mongoose.Schema.Types.Mixed], default: [] },
  constraints: { type: [mongoose.Schema.Types.Mixed], default: [] },
  thumbnail: { type: String },
  createdAt: { type: Date, default: Date.now }
}, {
  versionKey: false
});

const Experiment = mongoose.model('Experiment', experimentSchema);
const memoryExperiments = [];

const connectMongo = async () => {
  if (!mongoUri) {
    console.warn('MONGODB_URI is not set. Saved experiments will use temporary memory storage.');
    return;
  }

  try {
    await mongoose.connect(mongoUri);
    isMongoConnected = true;
    console.log('MongoDB connected for experiment persistence');
  } catch (error) {
    isMongoConnected = false;
    console.error('MongoDB connection failed. Falling back to temporary memory storage.');
    console.error(error.message);
  }
};

connectMongo();

mongoose.connection.on('disconnected', () => {
  isMongoConnected = false;
  if (mongoUri) {
    console.warn('MongoDB disconnected. Experiment API will use temporary memory storage until it reconnects.');
  }
});

mongoose.connection.on('connected', () => {
  isMongoConnected = true;
});

const normalizeExperiment = (experiment) => ({
  id: experiment.id,
  name: experiment.name,
  description: experiment.description || '',
  objects: Array.isArray(experiment.objects) ? experiment.objects : [],
  constraints: Array.isArray(experiment.constraints) ? experiment.constraints : [],
  thumbnail: experiment.thumbnail,
  createdAt: experiment.createdAt ? new Date(experiment.createdAt) : new Date()
});

app.get('/api/experiments', async (_req, res) => {
  try {
    if (isMongoConnected) {
      const experiments = await Experiment.find({}, { _id: 0 }).sort({ createdAt: -1 }).lean();
      return res.json(experiments);
    }

    return res.json([...memoryExperiments].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  } catch (error) {
    console.error('Failed to load experiments:', error);
    return res.status(500).json({ error: 'Failed to load experiments' });
  }
});

app.post('/api/experiments', async (req, res) => {
  try {
    const experiment = normalizeExperiment(req.body);
    if (!experiment.id || !experiment.name.trim()) {
      return res.status(400).json({ error: 'Experiment id and name are required' });
    }

    if (isMongoConnected) {
      const saved = await Experiment.findOneAndUpdate(
        { id: experiment.id },
        experiment,
        { new: true, upsert: true, projection: { _id: 0 } }
      ).lean();
      return res.status(201).json(saved);
    }

    const existingIndex = memoryExperiments.findIndex((item) => item.id === experiment.id);
    if (existingIndex >= 0) {
      memoryExperiments[existingIndex] = experiment;
    } else {
      memoryExperiments.unshift(experiment);
    }
    return res.status(201).json(experiment);
  } catch (error) {
    console.error('Failed to save experiment:', error);
    return res.status(500).json({ error: 'Failed to save experiment' });
  }
});

app.delete('/api/experiments/:id', async (req, res) => {
  try {
    if (isMongoConnected) {
      await Experiment.deleteOne({ id: req.params.id });
    } else {
      const index = memoryExperiments.findIndex((item) => item.id === req.params.id);
      if (index >= 0) memoryExperiments.splice(index, 1);
    }

    return res.status(204).end();
  } catch (error) {
    console.error('Failed to delete experiment:', error);
    return res.status(500).json({ error: 'Failed to delete experiment' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    persistence: isMongoConnected ? 'mongodb' : 'memory'
  });
});

// Store active rooms and their states
const rooms = new Map();

// Generate random color for user
const getRandomColor = () => {
  const colors = [
    '#e74c3c', '#3498db', '#2ecc71', '#f39c12', 
    '#9b59b6', '#1abc9c', '#e67e22', '#34495e'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', ({ roomId, userName }) => {
    socket.join(roomId);
    
    // Initialize room if it doesn't exist
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        users: [],
        objects: [],
        constraints: []
      });
    }

    const room = rooms.get(roomId);
    const user = {
      id: socket.id,
      name: userName,
      color: getRandomColor()
    };

    // Add user to room
    room.users.push(user);

    // Send current room state to the joining user
    socket.emit('room-state', {
      objects: room.objects,
      constraints: room.constraints
    });

    // Notify all users in the room
    io.to(roomId).emit('room-users', room.users);
    
    console.log(`User ${userName} joined room ${roomId}`);
  });

  socket.on('object-added', ({ roomId, object }) => {
    const room = rooms.get(roomId);
    if (room) {
      room.objects.push(object);
      // Broadcast to all other users in the room
      socket.to(roomId).emit('object-added', object);
    }
  });

  socket.on('constraint-added', ({ roomId, constraint }) => {
    const room = rooms.get(roomId);
    if (room) {
      room.constraints.push(constraint);
      // Broadcast to all other users in the room
      socket.to(roomId).emit('constraint-added', constraint);
    }
  });

  socket.on('physics-update', ({ roomId, data }) => {
    // High-frequency physics state sync
    socket.to(roomId).emit('physics-update', data);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Remove user from all rooms
    rooms.forEach((room, roomId) => {
      const userIndex = room.users.findIndex(u => u.id === socket.id);
      if (userIndex !== -1) {
        room.users.splice(userIndex, 1);
        io.to(roomId).emit('room-users', room.users);
        
        // Clean up empty rooms
        if (room.users.length === 0) {
          rooms.delete(roomId);
          console.log(`Room ${roomId} deleted (no users)`);
        }
      }
    });
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server ready for connections`);
});
