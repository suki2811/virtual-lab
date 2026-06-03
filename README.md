# 🧪 Virtual Lab

A browser-based 2D physics simulation platform for creating, running, analyzing, and collaborating on mechanics experiments. Build physical systems using springs, ropes, pivots, and rigid bodies, and observe their real-time physics behaviors.

---

## ✨ Key Features
- **Interactive 2D Physics:** Real-time simulations of rigid bodies, collisions, gravity, friction, and restitution (bounciness).
- **Constraints & Joints:** Connect objects using ropes, springs (with Hooke's Law), and pivot joints.
- **Data & Analytics:** Record simulations and plot velocity, acceleration, and angular velocity graphs.
- **Time Controls & Replay:** Pause, play, and scrub back in time to review motion frame-by-frame.
- **Real-Time Collaboration:** Create rooms and build experiments together with others via WebSockets.
- **Cloud Saves:** Save and load experiments using MongoDB.

---

## 🚀 Quick Start Workflow

Follow these simple steps to get the project running locally.

### 1. Prerequisites
Ensure you have the following installed on your machine:
- [Node.js](https://nodejs.org/) (v16+)
- [Git](https://git-scm.com/)

### 2. Clone the Repository
```bash
git clone https://github.com/suki2811/virtual-lab.git
cd virtual-lab
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Setup Environment Variables
Create a `.env` file in the root folder with the following configuration:
```env
VITE_SOCKET_URL=http://localhost:3001
VITE_API_URL=http://localhost:3001
# Local MongoDB (Or use an Atlas connection string)
MONGODB_URI=mongodb://127.0.0.1:27017/virtual-lab
```
> **Note:** If you don't configure MongoDB, the backend will still work but will save experiments in temporary memory instead of a database.

### 5. Run the Application (Frontend & Backend)
You'll need two terminal windows open to run both the frontend UI and the backend server simultaneously.

**Terminal 1 (Backend Server):**
```bash
node server/index.js
```
*(Server runs on `http://localhost:3001`)*

**Terminal 2 (Frontend Client):**
```bash
npm run dev
```
*(App runs on `http://localhost:5173`)*

Open `http://localhost:5173` in your browser to start experimenting!

---

## 🛠️ Tech Stack & Architecture

- **Frontend:** React, Vite, TypeScript, TailwindCSS
- **Physics Engine:** Matter.js (handles rigid-body motion, collisions, and constraint solving)
- **Backend Server:** Node.js, Express.js
- **Real-time Collaboration:** Socket.IO
- **Database:** MongoDB (via Mongoose)

### How It Works Under The Hood
1. **Simulation:** The core loop bridges React state with the Matter.js engine. Objects drawn on the React canvas are translated into Matter.js rigid bodies.
2. **Constraints:** Springs apply forces using Hooke's Law (`F = -k(x - L0)`), while ropes dynamically restrict distance without pushing when slack.
3. **Collaboration:** Socket.IO synchronizes canvas events (object creation, dragging, properties updates) instantly across all clients in the same room.
4. **Analytics:** While the simulation runs, body states (velocity, acceleration) are captured per frame. When paused, this data is rendered into interactive charts.
