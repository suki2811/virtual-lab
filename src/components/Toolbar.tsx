import React from 'react';
import { 
  Square, 
  Circle, 
  Minus, 
  Waves, 
  Disc, 
  Trash2,
  Save,
  FolderOpen,
  Users,
  Play,
  Pause,
  RotateCcw,
  HelpCircle,
  Ruler
} from 'lucide-react';

interface ToolbarProps {
  onAddBox: () => void;
  onAddCircle: () => void;
  onAddGround: () => void;
  onAddRope: () => void;
  onAddSpring: () => void;
  onAddPivot: () => void;
  onDistanceTool: () => void;
  onClear: () => void;
  onSave: () => void;
  onLoad: () => void;
  onToggleRoom: () => void;
  onToggleHelp: () => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onReset: () => void;
  selectedTool: string | null;
}

const Toolbar: React.FC<ToolbarProps> = ({
  onAddBox,
  onAddCircle,
  onAddGround,
  onAddRope,
  onAddSpring,
  onAddPivot,
  onDistanceTool,
  onClear,
  onSave,
  onLoad,
  onToggleRoom,
  onToggleHelp,
  isPlaying,
  onTogglePlay,
  onReset,
  selectedTool
}) => {
  return (
    <div className="bg-white border-b-2 border-gray-300 p-4 shadow-sm">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900 mr-6">VIRTUAL-LAB</h1>
          
          <div className="flex gap-2 border-r border-gray-300 pr-4">
            <button
              onClick={onAddBox}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 border-2 border-gray-300 rounded-lg transition-colors"
              title="Add Box"
            >
              <Square size={20} />
              <span>Box</span>
            </button>
            <button
              onClick={onAddCircle}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 border-2 border-gray-300 rounded-lg transition-colors"
              title="Add Circle"
            >
              <Circle size={20} />
              <span>Circle</span>
            </button>
            <button
              onClick={onAddGround}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 border-2 border-gray-300 rounded-lg transition-colors"
              title="Add Ground"
            >
              <Minus size={20} />
              <span>Ground</span>
            </button>
          </div>

          <div className="flex gap-2 border-r border-gray-300 pr-4">
            <button
              onClick={onAddRope}
              className={`flex items-center gap-2 px-4 py-2 ${
                selectedTool === 'rope' ? 'bg-gray-300 border-gray-500' : 'bg-gray-100 hover:bg-gray-200 border-gray-300'
              } text-gray-900 border-2 rounded-lg transition-colors`}
              title="Add Rope Constraint"
            >
              <Waves size={20} />
              <span>Rope</span>
            </button>
            <button
              onClick={onAddSpring}
              className={`flex items-center gap-2 px-4 py-2 ${
                selectedTool === 'spring' ? 'bg-gray-300 border-gray-500' : 'bg-gray-100 hover:bg-gray-200 border-gray-300'
              } text-gray-900 border-2 rounded-lg transition-colors`}
              title="Add Spring"
            >
              <Waves size={20} />
              <span>Spring</span>
            </button>
            <button
              onClick={onAddPivot}
              className={`flex items-center gap-2 px-4 py-2 ${
                selectedTool === 'pivot' ? 'bg-gray-300 border-gray-500' : 'bg-gray-100 hover:bg-gray-200 border-gray-300'
              } text-gray-900 border-2 rounded-lg transition-colors`}
              title="Add Pivot"
            >
              <Disc size={20} />
              <span>Pivot</span>
            </button>
            <button
              onClick={onDistanceTool}
              className={`flex items-center gap-2 px-4 py-2 ${
                selectedTool === 'distance' ? 'bg-gray-300 border-gray-500' : 'bg-gray-100 hover:bg-gray-200 border-gray-300'
              } text-gray-900 border-2 rounded-lg transition-colors`}
              title="Distance Tool"
            >
              <Ruler size={20} />
              <span>Distance</span>
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onTogglePlay}
              className={`flex items-center gap-2 px-4 py-2 ${
                isPlaying ? 'bg-gray-200 hover:bg-gray-300' : 'bg-gray-100 hover:bg-gray-200'
              } text-gray-900 border-2 border-gray-300 rounded-lg transition-colors`}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <button
              onClick={onReset}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 border-2 border-gray-300 rounded-lg transition-colors"
              title="Reset"
            >
              <RotateCcw size={20} />
            </button>
            <button
              onClick={onClear}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 border-2 border-gray-300 rounded-lg transition-colors"
              title="Clear All"
            >
              <Trash2 size={20} />
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onSave}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 border-2 border-gray-300 rounded-lg transition-colors"
            title="Save Experiment"
          >
            <Save size={20} />
            <span>Save</span>
          </button>
          <button
            onClick={onLoad}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 border-2 border-gray-300 rounded-lg transition-colors"
            title="Load Experiment"
          >
            <FolderOpen size={20} />
            <span>Load</span>
          </button>
          <button
            onClick={onToggleRoom}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 border-2 border-gray-300 rounded-lg transition-colors"
            title="Multiplayer Room"
          >
            <Users size={20} />
            <span>Room</span>
          </button>
          <button
            onClick={onToggleHelp}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 border-2 border-gray-300 rounded-lg transition-colors"
            title="Help & Instructions"
          >
            <HelpCircle size={20} />
            <span>Help</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Toolbar;
