# VIRTUAL-LAB
VIRTUAL-LAB is a browser-based 2D physics simulation platform for creating, running, analyzing, and collaborating on mechanics experiments such as springs, ropes, pivots, collisions, forces, and velocity plots.

---

## How to Run This Project
Follow these steps from scratch after downloading or cloning the project.

### 1. Install Requirements
Install these tools first:
- Node.js
- npm
- Git

Check that they are installed:
```bash
node --version
npm --version
git --version
```

If these commands show version numbers, the system is ready.

### 2. Get the Project Files
If you are using GitHub, clone the repository:
```bash
git clone https://github.com/your-username/virtual-lab.git
cd virtual-lab
```

If you downloaded the project as a ZIP file, extract it first. Then open a terminal inside the extracted project folder.

The terminal should be inside the folder that contains `package.json`.

### 3. Install Project Dependencies
Run:
```bash
npm install
```

This installs React, Vite, Matter.js, Socket.IO, Express, MongoDB dependencies, and all other required packages.

### 4. Configure MongoDB for Saved Experiments
Create a `.env` file in the project root folder:
```env
VITE_SOCKET_URL=http://localhost:3001
VITE_API_URL=http://localhost:3001
MONGODB_URI=mongodb://127.0.0.1:27017/virtual-lab
```

Use a MongoDB Atlas connection string instead of the local URI if you are using Atlas.

MongoDB is only required for permanent saved experiments. If `MONGODB_URI` is not configured, the backend still runs, but saved experiments use temporary memory storage.

### 5. Start the Frontend
In the project folder, run:
```bash
npm run dev
```

The frontend starts with Vite. Open the URL shown in the terminal, usually:
```text
http://localhost:5173
```

### 6. Start the Backend for Collaboration and Saving
Open a second terminal in the same project folder and run:
```bash
node server/index.js
```

The backend starts the Express API and Socket.IO collaboration server at:
```text
http://localhost:3001
```

### 7. Use the App
Keep both terminals running:
- Terminal 1: frontend with `npm run dev`
- Terminal 2: backend with `node server/index.js`

Then use the browser app to create simulations, save experiments, load experiments, and join collaboration rooms.

---

## Project Structure
```text
VIRTUAL-LAB/
|-- src/
|   |-- components/        React UI components
|   |-- hooks/             Physics and WebSocket hooks
|   |-- physics/           Engine, bodies, constraints, forces
|   |-- types/             TypeScript type definitions
|   |-- utils/             Helper utilities
|   |-- App.tsx            Main application component
|   |-- main.tsx           React entry point
|   `-- index.css          Global styles
|-- server/
|   `-- index.js           Express and Socket.IO backend
|-- index.html             HTML entry file
|-- package.json           Scripts and dependencies
|-- package-lock.json      Exact dependency versions
|-- tsconfig.json          TypeScript configuration
|-- vite.config.ts         Vite configuration
|-- .env.example           Example environment file
|-- .gitignore             Git ignored files
`-- README.md              Project documentation
```

---

## Complete Project Explanation

### 1. Application Start
The app starts from `src/main.tsx`. This file loads React and renders the main `App.tsx` component into the browser.

### 2. Main App File
`src/App.tsx` connects the toolbar, canvas, side panel, room manager, experiment library, velocity plotting modal, and physics hook.

### 3. Physics System
The main simulation logic is inside `src/hooks/usePhysics2.ts`. It manages bodies, constraints, selected objects, play/pause state, replay snapshots, and velocity plot data.

### 4. Physics Engine
`src/physics/engine.ts` creates the Matter.js engine. Matter.js handles rigid-body motion, collision detection, collision response, and constraint solving.

### 5. Simulation Loop
`src/physics/world.ts` runs the engine using a fixed timestep. This keeps physics updates stable and consistent.

### 6. Creating Objects
When the user clicks Box, Circle, or Ground, the app creates a preview object. After placement, it becomes a real Matter.js body.

### 7. Body Factory
`src/physics/bodies/factory.ts` converts project objects into Matter.js bodies with shape, size, mass, friction, restitution, static state, and render properties.

### 8. Creating Constraints
Ropes, springs, and pivots connect two bodies. The user selects objects on the canvas, and the project creates a constraint between them.

### 9. Constraint Factory
`src/physics/constraints/factory.ts` creates rope, spring, and pivot constraints. It stores rope length, max tension, spring natural length, spring constant, and damping.

### 10. Spring Motion
Springs follow Hooke's law:
```text
F = -k(x - L0)
```
This allows horizontal or vertical simple harmonic motion when damping is zero.

### 11. Rope Motion
Ropes pull when stretched but do not push when slack. The project can also calculate and display rope tension.

### 12. Forces and Gravity
The simulation supports gravity, mass, friction, restitution, external force, velocity control, and air resistance. These values are edited from the right-side panel.

### 13. Collisions
Matter.js detects collisions between bodies. Restitution controls bounce, and friction controls resistance during contact.

### 14. Play and Pause
When Start is clicked, bodies move and simulation time begins. When Pause is clicked, the simulation stops and properties can be inspected or edited.

### 15. Replay System
During simulation, the app records positions, velocities, angles, and angular velocities. The replay slider can scrub through saved states.

### 16. Velocity Plotting
From Start until Pause, the app records each body's time, velocity magnitude, `Vx`, `Vy`, angular velocity, and acceleration. After pausing, velocity plots can be opened.

### 17. Real-Time Collaboration
`server/index.js` runs an Express and Socket.IO server. Users can join rooms, create objects, create constraints, and receive live updates.

### 18. Saving Experiments
Saved experiments are stored through backend API endpoints in `server/index.js`:
```text
GET    /api/experiments
POST   /api/experiments
DELETE /api/experiments/:id
```
When `MONGODB_URI` is configured, experiments are saved in MongoDB. If it is missing, the backend uses temporary memory storage for development only.

### 19. WebSocket Communication
`src/hooks/useWebSocket.ts` sends and receives room events, object events, constraint events, and physics updates between frontend and backend.

### 20. Data Flow
```text
User action -> React UI -> usePhysics hook -> Matter.js engine -> Canvas output
Local user -> Socket.IO client -> Socket.IO server -> Other users
Save experiment -> REST API -> MongoDB
```

### 21. Main Purpose
VIRTUAL-LAB helps users understand mechanics by building experiments, running simulations, observing motion, editing physical properties, and analyzing graphs.

---



