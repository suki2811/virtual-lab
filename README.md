<div align="center">
  <h1>🧪 Virtual Lab</h1>
  <p><strong>A Next-Generation Browser-Based 2D Physics Simulator</strong></p>
  <p>
    <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
    <img src="https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E" alt="Vite" />
    <img src="https://img.shields.io/badge/Matter.js-FFB000?style=for-the-badge&logo=javascript&logoColor=white" alt="Matter.js" />
    <img src="https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socket.io&logoColor=white" alt="Socket.io" />
  </p>
</div>

---

> **Imagine a sandbox where you control the laws of physics.**  
> Build physical systems using springs, ropes, pivots, and rigid bodies, and observe their real-time physics behaviors. Collaborate with friends in real-time, record your experiments, and plot beautiful velocity graphs! 🚀

---

## ✨ What Makes It Awesome?

* **🎮 Interactive 2D Physics Sandbox:** Experience ultra-smooth, real-time simulations of rigid bodies. Tweak gravity, friction, and bounciness (restitution) on the fly!
* **🔗 Dynamic Joints & Constraints:** Connect objects using realistic ropes, perfect pivot joints, and springs powered by actual Hooke's Law mathematics.
* **📈 Real-Time Data & Analytics:** Don't just watch things fall—measure them! Record simulations and generate beautiful velocity, acceleration, and angular velocity graphs.
* **⏪ Time Travel (Replay):** Messed up? Pause the simulation and scrub back in time to review motion frame-by-frame. 
* **👥 Multiplayer Collaboration:** Create rooms and build chaotic experiments together with friends across the globe via blazing-fast WebSockets.
* **☁️ Cloud Saves:** Never lose an experiment. Save and load your chaotic creations seamlessly with MongoDB.

---

## 🚀 Quick Start Workflow

Ready to break some virtual glass? Let's get you set up in minutes.

### 1️⃣ Prerequisites
Before you start, make sure you have the essentials:
- [Node.js](https://nodejs.org/) (v16+ recommended)
- [Git](https://git-scm.com/)

### 2️⃣ Clone the Repository
Grab the code from GitHub and dive in:
```bash
git clone https://github.com/suki2811/virtual-lab.git
cd virtual-lab
```

### 3️⃣ Install Dependencies
Let npm do the heavy lifting:
```bash
npm install
```

### 4️⃣ Setup Your Environment
Create a `.env` file in the root folder and drop in this config:
```env
VITE_SOCKET_URL=http://localhost:3001
VITE_API_URL=http://localhost:3001
# Optional: Local MongoDB (Or use a cloud Atlas connection string)
MONGODB_URI=mongodb://127.0.0.1:27017/virtual-lab
```
> 💡 **Pro Tip:** If you skip configuring MongoDB, the app won't crash! It simply acts as a true sandbox and saves your experiments in temporary memory instead.

### 5️⃣ Fire It Up! (Frontend & Backend)
You'll need two terminal windows to bring the lab to life.

**Terminal 1 (Backend Server):**
```bash
node server/index.js
```
*(Listening for connections on `http://localhost:3001`)*

**Terminal 2 (Frontend Client):**
```bash
npm run dev
```
*(Serving the UI on `http://localhost:5173`)*

🎉 **Boom!** Open `http://localhost:5173` in your favorite browser and start building.

---

## 🛠️ The Tech Under The Hood

We've packed this project with modern, high-performance web technologies:

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend UI** | ⚛️ React + Vite + TS | Lightning-fast rendering and an amazing developer experience. |
| **Styling** | 🎨 TailwindCSS | Sleek, modern, and fully responsive user interface design. |
| **Physics Engine** | ⚙️ Matter.js | Handles the complex math for rigid-body motion and collisions. |
| **Backend Server** | 🟢 Node.js + Express | Serves the APIs and coordinates data storage. |
| **Multiplayer** | ⚡ Socket.IO | Synchronizes canvas events instantly across all clients. |
| **Database** | 🍃 MongoDB | Stores your brilliant experiments forever. |

### 🧠 How It Actually Works
1. **The Simulation Loop:** Our custom hooks bridge React's reactive state with the Matter.js engine loop. When you draw on the React canvas, it's instantly translated into a Matter.js rigid body.
2. **Mathematics:** Springs apply forces frame-by-frame using Hooke's Law (`F = -k(x - L0)`). Ropes dynamically restrict maximum distance without ever pushing when they go slack.
3. **Collaboration Sync:** Socket.IO ensures that every time you drag an object or tweak a property, everyone in your room sees it instantly.
4. **Data Capture:** While the simulation runs, body states are captured per frame. When you hit pause, this massive array of data is crunched into the interactive charts you see on screen.

---
<div align="center">
  <i>Built with ❤️ for science and coding.</i>
</div>
