import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Pause, SkipBack, SkipForward, Settings as SettingsIcon, 
  Plus, Trash2, Image as ImageIcon, Clock, Calendar, 
  Power, RotateCcw, Monitor, ChevronRight, X, Upload,
  MoreHorizontal, Move, Copy, Check, Shuffle, Zap, Palette, Thermometer, Cpu, HardDrive, Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Album, Photo, ScheduleItem } from './types';

// --- Haptic Utilities ---

const triggerHaptic = (intensity: 'light' | 'medium' | 'heavy' = 'light') => {
  // Android / Chrome Vibration API
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    const duration = intensity === 'light' ? 5 : intensity === 'medium' ? 10 : 20;
    navigator.vibrate(duration);
  }
  
  // iOS 18+ Switch Hack
  // We toggle a hidden switch input via its label to trigger system haptics
  const label = document.getElementById('haptic-label');
  if (label) {
    label.click();
  }
};

// --- Components ---

const Slider = ({ label, value, min, max, step = 1, onChange, unit = "" }: any) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    triggerHaptic('light');
    onChange(newValue);
  };

  return (
    <div className="mb-6">
      <div className="flex justify-between mb-2">
        <span className="text-sm font-medium text-zinc-400 uppercase tracking-wider">{label}</span>
        <span className="text-sm font-mono text-emerald-400">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
      />
    </div>
  );
};

const Toggle = ({ label, enabled, onToggle }: any) => {
  const handleToggle = () => {
    triggerHaptic('medium');
    onToggle(!enabled);
  };

  return (
    <div className="flex items-center justify-between py-4 border-b border-zinc-800/50">
      <span className="text-zinc-200 font-medium">{label}</span>
      <button
        onClick={handleToggle}
        className={`w-12 h-6 rounded-full transition-colors duration-200 relative ${enabled ? 'bg-emerald-500' : 'bg-zinc-700'}`}
      >
        <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${enabled ? 'translate-x-6' : ''}`} />
      </button>
    </div>
  );
};

// --- Slideshow Component ---

const Slideshow = () => {
  const [current, setCurrent] = useState<any>(null);
  const [target, setTarget] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [isFirstLoad, setIsFirstLoad] = useState(true);

  const loadCurrent = async () => {
    try {
      const res = await fetch('/api/slideshow/current');
      const data = await res.json();
      
      if (!current) {
        setCurrent(data.photo);
      } else if (data.photo && data.photo.id !== current.id) {
        setTarget(data.photo);
      }
      
      setSettings(data.settings);
    } catch (err) {
      console.error("Slideshow load error:", err);
    }
  };

  const handleImageLoaded = (photo: any) => {
    if (target && photo.id === target.id) {
      setCurrent(target);
      setTarget(null);
      setIsFirstLoad(false);
    } else if (isFirstLoad && current && photo.id === current.id) {
      setIsFirstLoad(false);
    }
  };

  useEffect(() => {
    loadCurrent();
  }, []);

  // Fast poll for state changes (manual next/prev, settings changes)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [sRes, cRes] = await Promise.all([
          fetch('/api/settings'),
          fetch('/api/slideshow/current')
        ]);
        
        const sData = await sRes.json();
        const cData = await cRes.json();

        // Update settings - this will trigger re-render for brightness etc.
        setSettings(sData);
        
        // Update photo if it changed
        if (cData.photo && (!current || cData.photo.id !== current.id)) {
          setTarget(cData.photo);
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [current?.id]); // Re-run effect when photo changes to keep 'current' fresh in closure

  if (!current) return (
    <div className="h-screen w-screen bg-black flex flex-col items-center justify-center text-zinc-500 font-mono">
      <ImageIcon size={48} className="mb-4 opacity-20" />
      <p className="text-sm tracking-widest uppercase">Se încarcă fotografiile...</p>
    </div>
  );

  const kbIntensity = parseFloat(settings?.ken_burns_intensity) || 0.5;
  const kbEnabled = settings?.ken_burns_enabled === '1';
  const crossfade = parseInt(settings?.crossfade) || 1000;
  const duration = parseInt(settings?.duration) || 5000;
  const brightness = settings?.brightness !== undefined ? parseFloat(settings.brightness) : 1.0;

  // Simple deterministic random based on ID
  const getKBValues = (id: number) => {
    const seed = id * 1337;
    const x = ((seed % 100) / 100 - 0.5) * 40 * kbIntensity;
    const y = (((seed / 100) % 100) / 100 - 0.5) * 40 * kbIntensity;
    const scale = 1 + (kbIntensity * 0.2);
    return { x, y, scale };
  };

  const currentKB = getKBValues(current.id);

  return (
    <div className="h-screen w-screen bg-black overflow-hidden relative">
      <div 
        className="absolute inset-0 flex items-center justify-center pointer-events-none z-0"
        style={{
          pointerEvents: 'auto'
        }}
      >
        {/* Brightness Overlay - More reliable than CSS filters on some hardware */}
        <div 
          className="absolute inset-0 bg-black pointer-events-none z-50 transition-opacity duration-500" 
          style={{ opacity: 1 - brightness }} 
        />

        <AnimatePresence initial={false}>
          <motion.div
            key={current.id}
            initial={{ opacity: isFirstLoad ? 1 : 0 }}
            animate={{ 
              opacity: 1,
              scale: kbEnabled ? [1, currentKB.scale] : 1,
              x: kbEnabled ? [0, currentKB.x] : 0,
              y: kbEnabled ? [0, currentKB.y] : 0,
            }}
            exit={{ 
              opacity: 0,
              transition: { duration: crossfade / 1000, ease: "easeInOut" }
            }}
            transition={{ 
              opacity: { duration: crossfade / 1000, ease: "easeInOut" },
              scale: { duration: duration / 1000, ease: "linear" },
              x: { duration: duration / 1000, ease: "linear" },
              y: { duration: duration / 1000, ease: "linear" },
            }}
            className="absolute inset-0 z-10"
          >
            <img 
              src={`/photos/${current.filename}`} 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onLoad={() => handleImageLoaded(current)}
            />
          </motion.div>
        </AnimatePresence>
        
        {/* Preload target image - hidden */}
        {target && (
          <div className="hidden">
            <img 
              src={`/photos/${target.filename}`} 
              onLoad={() => handleImageLoaded(target)}
              referrerPolicy="no-referrer"
            />
          </div>
        )}
      </div>
    </div>
  );
};

const PhotoCard = ({ photo, albums, onDelete, onMove, onCopy, isSelectionMode, isSelected, onSelect, onLongPress }: any) => {
  const [showMenu, setShowMenu] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startPress = () => {
    timerRef.current = setTimeout(() => {
      triggerHaptic('heavy');
      onLongPress();
    }, 600);
  };

  const endPress = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <div 
      onClick={() => isSelectionMode && onSelect()}
      onMouseDown={!isSelectionMode ? startPress : undefined}
      onMouseUp={endPress}
      onMouseLeave={endPress}
      onTouchStart={!isSelectionMode ? startPress : undefined}
      onTouchEnd={endPress}
      onContextMenu={(e) => e.preventDefault()}
      className={`aspect-[9/16] relative rounded-2xl overflow-hidden group bg-zinc-900 border shadow-lg transition-all select-none touch-pan-y ${
        isSelected ? 'ring-4 ring-emerald-500 border-emerald-500 scale-[0.98]' : 'border-zinc-800/50'
      } ${isSelectionMode ? 'cursor-pointer' : ''}`}
      style={{ WebkitTouchCallout: 'none' }}
    >
      <img 
        src={`/photos/${photo.filename}`} 
        className="w-full h-full object-cover" 
        referrerPolicy="no-referrer"
      />
      
      {isSelectionMode && (
        <div className={`absolute inset-0 flex items-center justify-center transition-colors ${isSelected ? 'bg-emerald-500/20' : 'bg-black/20'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
            isSelected ? 'bg-emerald-500 border-emerald-500 text-black' : 'bg-black/40 border-white/40 text-transparent'
          }`}>
            <Check size={20} strokeWidth={3} />
          </div>
        </div>
      )}

      {!isSelectionMode && (
        <>
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-40 group-hover:opacity-100 transition-opacity" />
          <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/40 to-transparent pointer-events-none" />

          <button 
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="absolute top-3 right-3 p-2.5 bg-black/60 backdrop-blur-lg rounded-full text-white z-20 shadow-xl border border-white/10 transition-all active:scale-90"
          >
            <MoreHorizontal size={20} />
          </button>

          <AnimatePresence>
            {showMenu && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute inset-x-2 bottom-2 bg-zinc-900/95 backdrop-blur-xl rounded-xl p-2 border border-zinc-700/50 z-10"
              >
                <div className="flex flex-col gap-1">
                  <button 
                    onClick={() => {
                      onMove();
                      setShowMenu(false);
                    }}
                    className="flex items-center gap-3 p-2 text-sm text-zinc-300 hover:bg-zinc-800 rounded-lg"
                  >
                    <Move size={16} /> Mută
                  </button>
                  <button 
                    onClick={() => {
                      onCopy();
                      setShowMenu(false);
                    }}
                    className="flex items-center gap-3 p-2 text-sm text-zinc-300 hover:bg-zinc-800 rounded-lg"
                  >
                    <Copy size={16} /> Copiază
                  </button>
                  <button 
                    onClick={() => {
                      if (confirm('Ești sigur că vrei să ștergi această fotografie?')) {
                        onDelete();
                      }
                      setShowMenu(false);
                    }}
                    className="flex items-center gap-3 p-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg"
                  >
                    <Trash2 size={16} /> Șterge
                  </button>
                  <button 
                    onClick={() => setShowMenu(false)}
                    className="mt-1 p-2 text-xs text-zinc-500 text-center border-t border-zinc-800"
                  >
                    Anulează
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
};

const ScheduleSection = ({ title, type }: { title: string, type: 'weekday' | 'weekend' }) => {
  const [data, setData] = useState<ScheduleItem | null>(null);

  useEffect(() => {
    fetch('/api/schedule')
      .then(res => res.json())
      .then(items => {
        const item = items.find((i: any) => i.day_type === type);
        setData(item);
      });
  }, [type]);

  const update = async (updates: Partial<ScheduleItem>) => {
    if (!data) return;
    const newData = { ...data, ...updates };
    setData(newData);
    await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newData)
    });
  };

  if (!data) return null;

  return (
    <div className="bg-zinc-900/50 rounded-3xl p-6 border border-zinc-800/50">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-zinc-100">{title}</h3>
        <button
          onClick={() => {
            triggerHaptic('medium');
            update({ enabled: data.enabled ? 0 : 1 });
          }}
          className={`w-12 h-6 rounded-full transition-colors duration-200 relative ${data.enabled ? 'bg-emerald-500' : 'bg-zinc-700'}`}
        >
          <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${data.enabled ? 'translate-x-6' : ''}`} />
        </button>
      </div>

      <div className={`space-y-4 transition-opacity duration-300 ${data.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
        <div className="flex items-center justify-between p-4 bg-zinc-800/30 rounded-2xl">
          <div className="flex items-center gap-3 text-zinc-400">
            <Play size={18} className="text-emerald-500" />
            <span className="text-sm font-medium uppercase tracking-wider">Pornire</span>
          </div>
          <input 
            type="time" 
            value={data.start_time}
            onChange={(e) => update({ start_time: e.target.value })}
            className="bg-transparent text-xl font-mono font-bold text-emerald-400 focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-between p-4 bg-zinc-800/30 rounded-2xl">
          <div className="flex items-center gap-3 text-zinc-400">
            <Pause size={18} className="text-red-500" />
            <span className="text-sm font-medium uppercase tracking-wider">Oprire</span>
          </div>
          <input 
            type="time" 
            value={data.end_time}
            onChange={(e) => update({ end_time: e.target.value })}
            className="bg-transparent text-xl font-mono font-bold text-red-400 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
};

const AmbilightSection = ({ data, update }: { data: any, update: (key: string, value: any) => void }) => {
  if (!data) return null;

  return (
    <div className="space-y-6 pb-24">
      <div className="bg-zinc-900/50 rounded-3xl p-6 border border-zinc-800/50">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-500">
              <Zap size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-zinc-100">Ambilight</h3>
              <p className="text-xs text-zinc-500 uppercase tracking-widest">Sincronizare Ecran</p>
            </div>
          </div>
          <button
            onClick={() => {
              triggerHaptic('medium');
              update('enabled', data.enabled === '1' ? '0' : '1');
            }}
            className={`w-14 h-7 rounded-full transition-colors duration-200 relative ${data.enabled === '1' ? 'bg-emerald-500' : 'bg-zinc-700'}`}
          >
            <div className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform duration-200 ${data.enabled === '1' ? 'translate-x-7' : ''}`} />
          </button>
        </div>

        <div className={`space-y-8 transition-all duration-500 ${data.enabled === '1' ? 'opacity-100' : 'opacity-40 pointer-events-none grayscale'}`}>
          {/* Mode Selector */}
          <div className="flex flex-col gap-3">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Mod Funcționare</span>
            <div className="flex gap-3">
              <button 
                onClick={() => update('mode', 'dynamic')}
                className={`flex-1 py-4 rounded-2xl text-sm font-bold transition-all border ${data.mode === 'dynamic' ? 'bg-emerald-500 border-emerald-500 text-black' : 'bg-zinc-800 border-zinc-700/30 text-zinc-400'}`}
              >
                Ambilight
              </button>
              <button 
                onClick={() => update('mode', 'static')}
                className={`flex-1 py-4 rounded-2xl text-sm font-bold transition-all border ${data.mode === 'static' ? 'bg-emerald-500 border-emerald-500 text-black' : 'bg-zinc-800 border-zinc-700/30 text-zinc-400'}`}
              >
                Culoare Statică
              </button>
            </div>
          </div>

          {/* Static Color Picker */}
          {data.mode === 'static' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }}
              className="pt-6 border-t border-zinc-800/50 space-y-6"
            >
              <div className="flex flex-col gap-4">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Alege Culoarea</span>
                <div className="grid grid-cols-5 gap-3">
                  {['#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ff8800', '#8800ff', '#ff0088'].map(color => (
                    <button
                      key={color}
                      onClick={() => update('static_color', color)}
                      className={`aspect-square rounded-xl border-2 transition-all ${data.static_color === color ? 'border-white scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-4 mt-2">
                  <input 
                    type="color" 
                    value={data.static_color || '#ffffff'} 
                    onChange={(e) => update('static_color', e.target.value)}
                    className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 cursor-pointer overflow-hidden p-0"
                  />
                  <span className="text-sm font-mono text-zinc-400 uppercase">{data.static_color}</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* Brightness */}
          <Slider 
            label="Luminozitate LED" 
            value={data.brightness} 
            min={0} max={255} 
            onChange={(v: any) => update('brightness', v)} 
          />

          {/* LED Layout */}
          <div className="pt-6 border-t border-zinc-800/50">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-6 block">Configurație Latini (Număr LED-uri)</span>
            
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <Slider 
                label="Sus" 
                value={data.leds_top} 
                min={0} max={150} 
                onChange={(v: any) => update('leds_top', v)} 
              />
              <Slider 
                label="Dreapta" 
                value={data.leds_right} 
                min={0} max={150} 
                onChange={(v: any) => update('leds_right', v)} 
              />
              <Slider 
                label="Jos" 
                value={data.leds_bottom} 
                min={0} max={150} 
                onChange={(v: any) => update('leds_bottom', v)} 
              />
              <Slider 
                label="Stânga" 
                value={data.leds_left} 
                min={0} max={150} 
                onChange={(v: any) => update('leds_left', v)} 
              />
            </div>
          </div>

          {/* Start & Direction */}
          <div className="pt-6 border-t border-zinc-800/50 space-y-6">
            <div className="flex flex-col gap-3">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Colț de Start (Primul LED)</span>
              <select 
                value={data.start_corner}
                onChange={(e) => update('start_corner', e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-4 text-sm font-medium focus:outline-none focus:border-emerald-500 transition-colors appearance-none"
              >
                <option value="top-left">Sus-Stânga</option>
                <option value="top-right">Sus-Dreapta</option>
                <option value="bottom-right">Jos-Dreapta</option>
                <option value="bottom-left">Jos-Stânga</option>
              </select>
            </div>

            <div className="flex flex-col gap-3">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Direcție Cablare</span>
              <div className="flex gap-3">
                <button 
                  onClick={() => update('direction', 'cw')}
                  className={`flex-1 py-4 rounded-2xl text-sm font-bold transition-all border ${data.direction === 'cw' ? 'bg-emerald-500 border-emerald-500 text-black' : 'bg-zinc-800 border-zinc-700/30 text-zinc-400'}`}
                >
                  Clockwise (CW)
                </button>
                <button 
                  onClick={() => update('direction', 'ccw')}
                  className={`flex-1 py-4 rounded-2xl text-sm font-bold transition-all border ${data.direction === 'ccw' ? 'bg-emerald-500 border-emerald-500 text-black' : 'bg-zinc-800 border-zinc-700/30 text-zinc-400'}`}
                >
                  Counter-CW (CCW)
                </button>
              </div>
            </div>
          </div>

          {/* Sample Depth */}
          {data.mode === 'dynamic' && (
            <div className="pt-6 border-t border-zinc-800/50">
              <Slider 
                label="Profunzime Eșantionare (px)" 
                value={data.sample_depth} 
                min={1} max={50} 
                onChange={(v: any) => update('sample_depth', v)} 
              />
              <p className="text-[10px] text-zinc-600 mt-2 italic">
                Cât de mult "intră" analiza în imagine pentru a calcula culoarea marginii.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="p-6 bg-zinc-900/30 border border-zinc-800/50 rounded-3xl text-xs text-zinc-500 leading-relaxed italic flex items-start gap-3">
        <div className="p-2 bg-zinc-800 rounded-lg text-zinc-400">
          <Cpu size={14} />
        </div>
        <span>
          Configurație Hardware: WS2812B conectată la GPIO18 (PWM). 
          Asigură-te că masa (GND) benzii este comună cu cea a Raspberry Pi-ului.
        </span>
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [currentPhotos, setCurrentPhotos] = useState<Photo[]>([]);
  const [view, setView] = useState<'dashboard' | 'albums' | 'album-detail' | 'schedule' | 'ambilight' | 'tools' | 'slideshow'>('dashboard');

  useEffect(() => {
    // Simple routing based on URL hash
    const handleHash = () => {
      if (window.location.hash === '#slideshow') setView('slideshow');
      else setView('dashboard');
    };
    window.addEventListener('hashchange', handleHash);
    handleHash();
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [ambilightSettings, setAmbilightSettings] = useState<any>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);
  const [albumNameInput, setAlbumNameInput] = useState("");
  const [timeInput, setTimeInput] = useState("");
  const [targetAlbum, setTargetAlbum] = useState<Album | null>(null);
  
  // Album selection for move/copy
  const [isAlbumSelectModalOpen, setIsAlbumSelectModalOpen] = useState(false);
  const [piStats, setPiStats] = useState<any>(null);
  const [targetPhoto, setTargetPhoto] = useState<Photo | null>(null);
  const [selectAction, setSelectAction] = useState<'move' | 'copy' | 'bulk-move' | 'bulk-copy' | null>(null);

  // Multi-selection
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<(number | string)[]>([]);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [isDraggingBrightness, setIsDraggingBrightness] = useState(false);

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Check if the clicked element or its parent is interactive
      const isInteractive = target.closest('button, a, input, select, textarea, [role="button"]');
      if (isInteractive) {
        // We use a slight delay or check to avoid double haptics if the component already calls it
        // but for "any interaction", a light tap is usually fine even if redundant
        triggerHaptic('light');
      }
    };
    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    
    // Poll PI Stats
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/pi/stats');
        const data = await res.json();
        setPiStats(data);
      } catch (e) {}
    };
    fetchStats();
    const statsInterval = setInterval(fetchStats, 10000);

    return () => {
      clearInterval(interval);
      clearInterval(statsInterval);
    };
  }, []);

  const updateAmbilightSetting = async (key: string, value: any) => {
    if (!ambilightSettings) return;
    const newData = { ...ambilightSettings, [key]: value };
    setAmbilightSettings(newData);
    await fetch('/api/ambilight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value })
    });
  };

  const fetchData = async () => {
    try {
      const [sRes, aRes, ambRes] = await Promise.all([
        fetch('/api/settings'),
        fetch('/api/albums'),
        fetch('/api/ambilight')
      ]);
      const sData = await sRes.json();
      const aData = await aRes.json();
      const ambData = await ambRes.json();
      setSettings(sData);
      setAlbums([...aData, { id: -1, name: 'Procesate (Disk)', created_at: '' }]);
      setAmbilightSettings(ambData);
      
      // Only refresh currentPhotos if we are in album-detail view
      if (view === 'album-detail' && selectedAlbum) {
        const pRes = await fetch(`/api/albums/${selectedAlbum.id}/photos`);
        setCurrentPhotos(await pRes.json());
      }
    } catch (err) {
      console.error("Fetch error:", err);
    }
  };

  const updateSetting = async (key: keyof Settings, value: any) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value.toString() });
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value })
    });
  };

  const handleSystemCommand = async (cmd: string) => {
    await fetch(`/api/system/${cmd}`, { method: 'POST' });
  };

  const handleAlbumSelect = async (album: Album) => {
    setSelectedAlbum(album);
    const url = album.id === -1 ? '/api/photos/processed' : `/api/albums/${album.id}/photos`;
    const pRes = await fetch(url);
    setCurrentPhotos(await pRes.json());
    setView('album-detail');
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !selectedAlbum) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('album_id', selectedAlbum.id.toString());
    for (let i = 0; i < e.target.files.length; i++) {
      formData.append('photos', e.target.files[i]);
    }

    try {
      await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      handleAlbumSelect(selectedAlbum); // Refresh
    } finally {
      setUploading(false);
    }
  };

  const deletePhoto = async (id: number | string) => {
    await fetch(`/api/photos/${id}`, { method: 'DELETE' });
    if (selectedAlbum) handleAlbumSelect(selectedAlbum);
  };

  const bulkDeletePhotos = async () => {
    await Promise.all(selectedPhotoIds.map(id => fetch(`/api/photos/${id}`, { method: 'DELETE' })));
    if (selectedAlbum) handleAlbumSelect(selectedAlbum);
    setSelectedPhotoIds([]);
    setIsSelectionMode(false);
    setIsBulkDeleteModalOpen(false);
  };

  const bulkMovePhotos = async (targetAlbumId: number) => {
    await Promise.all(selectedPhotoIds.map(id => {
      if (typeof id === 'string') {
        return fetch('/api/photos/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: id, album_id: targetAlbumId })
        });
      }
      return fetch(`/api/photos/${id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ album_id: targetAlbumId })
      });
    }));
    if (selectedAlbum) handleAlbumSelect(selectedAlbum);
    setSelectedPhotoIds([]);
    setIsSelectionMode(false);
    setIsAlbumSelectModalOpen(false);
    setSelectAction(null);
  };

  const bulkCopyPhotos = async (targetAlbumId: number) => {
    await Promise.all(selectedPhotoIds.map(id => {
      if (typeof id === 'string') {
        return fetch('/api/photos/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: id, album_id: targetAlbumId })
        });
      }
      return fetch(`/api/photos/${id}/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ album_id: targetAlbumId })
      });
    }));
    if (selectedAlbum) handleAlbumSelect(selectedAlbum);
    setSelectedPhotoIds([]);
    setIsSelectionMode(false);
    setIsAlbumSelectModalOpen(false);
    setSelectAction(null);
  };

  const togglePhotoSelection = (id: number | string) => {
    setSelectedPhotoIds(prev => 
      prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
    );
  };

  const createAlbum = async () => {
    if (!albumNameInput.trim()) return;
    const res = await fetch('/api/albums', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: albumNameInput })
    });
    const newAlbum = await res.json();
    setAlbums([...albums, newAlbum]);
    setIsCreateModalOpen(false);
    setAlbumNameInput("");
  };

  const deleteAlbum = async () => {
    if (!targetAlbum) return;
    await fetch(`/api/albums/${targetAlbum.id}`, { method: 'DELETE' });
    setAlbums(albums.filter(a => a.id !== targetAlbum.id));
    setIsDeleteModalOpen(false);
    setTargetAlbum(null);
    setView('albums');
  };

  const renameAlbum = async () => {
    if (!targetAlbum || !albumNameInput.trim()) return;
    await fetch(`/api/albums/${targetAlbum.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: albumNameInput })
    });
    setAlbums(albums.map(a => a.id === targetAlbum.id ? { ...a, name: albumNameInput } : a));
    if (selectedAlbum?.id === targetAlbum.id) setSelectedAlbum({ ...selectedAlbum, name: albumNameInput });
    setIsRenameModalOpen(false);
    setTargetAlbum(null);
    setAlbumNameInput("");
  };

  const movePhoto = async (photoId: number, targetAlbumId: number) => {
    await fetch(`/api/photos/${photoId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ album_id: targetAlbumId })
    });
    if (selectedAlbum) handleAlbumSelect(selectedAlbum);
    setIsAlbumSelectModalOpen(false);
    setTargetPhoto(null);
    setSelectAction(null);
  };

  const copyPhoto = async (photoId: number, targetAlbumId: number) => {
    await fetch(`/api/photos/${photoId}/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ album_id: targetAlbumId })
    });
    if (selectedAlbum) handleAlbumSelect(selectedAlbum);
    setIsAlbumSelectModalOpen(false);
    setTargetPhoto(null);
    setSelectAction(null);
  };

  const openAlbumSelect = (photo: Photo, action: 'move' | 'copy') => {
    setTargetPhoto(photo);
    setSelectAction(action);
    setIsAlbumSelectModalOpen(true);
  };

  if (view === 'slideshow') return <Slideshow />;

  if (!settings) return <div className="min-h-screen bg-black flex items-center justify-center text-emerald-500 font-mono">INITIALIZING...</div>;


  return (
    <div className="h-screen bg-[#0A0A0A] text-zinc-100 font-sans selection:bg-emerald-500/30 overflow-hidden flex flex-col touch-none" style={{ overscrollBehavior: 'none' }}>
      {/* Hidden Haptic Trigger for iOS 18+ */}
      <input 
        type="checkbox" 
        id="haptic-trigger" 
        className="hidden pointer-events-none" 
        {...({ switch: "" } as any)} 
        aria-hidden="true"
        tabIndex={-1}
      />
      <label htmlFor="haptic-trigger" id="haptic-label" className="hidden" aria-hidden="true" />
      
      {/* Main Content */}
      <main className={`flex-1 ${view === 'dashboard' ? 'overflow-hidden' : 'overflow-y-auto'} px-6 max-w-lg mx-auto w-full relative`}>
        <AnimatePresence mode="wait">
          {view === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="h-full flex flex-col items-center justify-center pb-4"
            >
              {/* PI Stats Badge */}
              {piStats && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 bg-zinc-900/50 border border-zinc-800/50 rounded-full text-[11.25px] font-mono text-zinc-400 backdrop-blur-md whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    <Thermometer size={10} className={parseFloat(piStats.temp) > 60 ? 'text-orange-500' : 'text-emerald-500'} />
                    <span>{piStats.temp}°C</span>
                  </div>
                  <div className="w-[1px] h-2 bg-zinc-800" />
                  <div className="flex items-center gap-1">
                    <Cpu size={10} className={parseFloat(piStats.cpu) > 70 ? 'text-orange-500' : 'text-emerald-500'} />
                    <span>{piStats.cpu}%</span>
                  </div>
                  <div className="w-[1px] h-2 bg-zinc-800" />
                  <div className="flex items-center gap-1">
                    <HardDrive size={10} className={(parseInt(piStats.ramUsed) / parseInt(piStats.ramTotal)) > 0.8 ? 'text-orange-500' : 'text-emerald-500'} />
                    <span>{piStats.ramUsed}/{piStats.ramTotal}MB</span>
                  </div>
                  <div className="w-[1px] h-2 bg-zinc-800" />
                  <div className="flex items-center gap-1">
                    <Database size={10} className={parseFloat(piStats.storagePercent) > 90 ? 'text-orange-500' : 'text-emerald-500'} />
                    <span>{((parseInt(piStats.storageTotal) - parseInt(piStats.storageUsed)) / 1024).toFixed(1)}GB liberi</span>
                  </div>
                </div>
              )}

              {/* PI Frame Visual */}
              <div className="mb-4 flex flex-col items-center">
                <div className="relative w-64 aspect-[4/5] bg-white p-10 border-[3px] border-[#D4AF37] shadow-2xl flex items-center justify-center transform -mt-[30px] hover:scale-105 transition-transform duration-500">
                  {/* Passpartout border */}
                  <div className="absolute inset-0 border border-zinc-200 m-1 pointer-events-none" />
                  
                  {/* Black Screen Area - Now a vertical brightness slider */}
                  <div 
                    className="w-full h-full bg-black flex items-center justify-center shadow-inner overflow-hidden relative cursor-ns-resize"
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setIsDraggingBrightness(true);
                      const rect = e.currentTarget.getBoundingClientRect();
                      const y = e.clientY - rect.top;
                      const h = rect.height;
                      const p = Math.max(0, Math.min(1, 1 - (y / h)));
                      updateSetting('brightness', p.toFixed(2));
                      triggerHaptic('light');
                    }}
                    onPointerMove={(e) => {
                      if (isDraggingBrightness) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const y = e.clientY - rect.top;
                        const h = rect.height;
                        const p = Math.max(0, Math.min(1, 1 - (y / h)));
                        updateSetting('brightness', p.toFixed(2));
                        triggerHaptic('light');
                      }
                    }}
                    onPointerUp={() => setIsDraggingBrightness(false)}
                  >
                    {/* Fill Level */}
                    <motion.div 
                      className="absolute bottom-0 left-0 right-0 bg-emerald-500"
                      initial={false}
                      animate={{ height: `${(parseFloat(settings.brightness) || 1) * 100}%` }}
                      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    />
                    
                    <span className="relative z-10 text-2xl font-serif text-white tracking-[0.5em] uppercase text-center leading-none italic font-light mix-difference">
                      PI<br/>Frame
                    </span>

                    {/* Brightness Percentage Indicator */}
                    <div className="absolute top-2 right-2 z-20 text-[10px] font-mono text-white/50 mix-difference">
                      {Math.round((parseFloat(settings.brightness) || 1) * 100)}%
                    </div>
                  </div>
                </div>
              </div>

              {/* Playback Controls Redesign */}
              <div className="flex items-center justify-center gap-4 w-full px-2 mb-6">
                <button 
                  onClick={() => updateSetting('shuffle_enabled', settings.shuffle_enabled === '1' ? '0' : '1')}
                  className={`p-4 rounded-full transition-all active:scale-90 ${settings.shuffle_enabled === '1' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-zinc-800/50 text-zinc-500'}`}
                  title="Shuffle Photos"
                >
                  <Shuffle size={20} />
                </button>

                <div className="flex items-center gap-3">
                  <button 
                    onClick={async () => {
                      await fetch('/api/slideshow/prev', { method: 'POST' });
                      fetchData();
                    }}
                    className="p-4 bg-zinc-800/50 rounded-full text-zinc-400 hover:text-white transition-colors active:scale-90"
                  >
                    <SkipBack size={24} />
                  </button>
                  
                  <button 
                    onClick={() => {
                      triggerHaptic('medium');
                      updateSetting('is_playing', settings.is_playing === '1' ? '0' : '1');
                    }}
                    className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center text-black shadow-lg shadow-emerald-500/20 hover:scale-105 active:scale-95 transition-transform"
                  >
                    {settings.is_playing === '1' ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
                  </button>

                  <button 
                    onClick={async () => {
                      await fetch('/api/slideshow/next', { method: 'POST' });
                      fetchData();
                    }}
                    className="p-4 bg-zinc-800/50 rounded-full text-zinc-400 hover:text-white transition-colors active:scale-90"
                  >
                    <SkipForward size={24} />
                  </button>
                </div>

                <button 
                  onClick={() => setIsMenuOpen(true)}
                  className="p-4 bg-zinc-800/50 rounded-full text-zinc-400 hover:text-emerald-500 transition-colors active:scale-90"
                  title="Setări și Unelte"
                >
                  <SettingsIcon size={24} />
                </button>
              </div>

              {/* Current Album Selection - Moved and made smaller */}
              <div className="w-full max-w-[280px] p-3 bg-zinc-900/30 rounded-xl border border-zinc-800/30 mx-auto">
                <label className="block text-[9px] font-bold text-zinc-600 uppercase tracking-[0.2em] mb-2 text-center">Album Activ</label>
                <div className="relative">
                  <select
                    value={settings.current_album_id}
                    onChange={(e) => updateSetting('current_album_id', e.target.value)}
                    className="w-full bg-transparent text-sm font-medium focus:outline-none appearance-none cursor-pointer text-zinc-300"
                    style={{ textAlign: 'center', textAlignLast: 'center' }}
                  >
                    <option value="all" className="bg-zinc-900 font-bold text-emerald-500">✨ Toate albumele</option>
                    {albums.filter(a => a.id !== -1).map(a => (
                        <option key={a.id} value={a.id} className="bg-zinc-900">{a.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'albums' && (
            <motion.div
              key="albums"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="grid grid-cols-2 gap-4 pt-[20px] pb-24"
            >
              {albums.map(album => (
                <button
                  key={album.id}
                  onClick={() => handleAlbumSelect(album)}
                  className="aspect-square bg-zinc-900 rounded-3xl p-6 flex flex-col items-center justify-center gap-4 border border-zinc-800/50 hover:bg-zinc-800 transition-all group relative overflow-hidden"
                >
                  <div className="absolute top-2 right-3 text-[10px] font-mono text-zinc-700">ID: {album.id}</div>
                  <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform shadow-inner">
                    <ImageIcon size={32} />
                  </div>
                  <div className="text-center">
                    <span className="block font-semibold text-zinc-200">{album.name}</span>
                    <span className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">Vezi conținut</span>
                  </div>
                </button>
              ))}
              <button
                onClick={() => {
                  setAlbumNameInput("");
                  setIsCreateModalOpen(true);
                }}
                className="aspect-square bg-zinc-900/30 border-2 border-dashed border-zinc-800 rounded-3xl flex flex-col items-center justify-center gap-4 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300 transition-all"
              >
                <Plus size={32} />
                <span className="font-medium">Album Nou</span>
              </button>
            </motion.div>
          )}

          {view === 'album-detail' && (
            <motion.div
              key="album-detail"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="pt-[20px] pb-24"
            >
              <div className="flex flex-col gap-6 mb-8">
                <div className="flex items-center justify-between">
                  <button 
                    onClick={() => {
                      setView('albums');
                      setIsSelectionMode(false);
                      setSelectedPhotoIds([]);
                    }}
                    className="flex items-center gap-2 text-emerald-500 font-medium"
                  >
                    <ChevronRight size={20} className="rotate-180" />
                    Albume
                  </button>
                  <div className="flex gap-2">
                    {isSelectionMode && (
                      <button 
                        onClick={() => {
                          setIsSelectionMode(false);
                          setSelectedPhotoIds([]);
                        }}
                        className="px-4 py-2 rounded-lg font-medium bg-emerald-500 text-black transition-all"
                      >
                        Gata
                      </button>
                    )}
                    {!isSelectionMode && selectedAlbum?.id !== -1 && (
                      <>
                        <button 
                          onClick={() => {
                            if (selectedAlbum) {
                              setTargetAlbum(selectedAlbum);
                              setAlbumNameInput(selectedAlbum.name);
                              setIsRenameModalOpen(true);
                            }
                          }}
                          className="p-2 bg-zinc-800 rounded-lg text-zinc-400"
                        >
                          Redenumește
                        </button>
                        <button 
                          onClick={() => {
                            if (selectedAlbum) {
                              setTargetAlbum(selectedAlbum);
                              setIsDeleteModalOpen(true);
                            }
                          }}
                          className="p-2 bg-red-500/10 rounded-lg text-red-500"
                        >
                          <Trash2 size={20} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {!isSelectionMode ? (
                  selectedAlbum?.id !== -1 ? (
                    <label className="w-full bg-emerald-500 text-black font-bold py-4 rounded-2xl flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-all shadow-lg shadow-emerald-500/20">
                      <Upload size={22} />
                      {uploading ? 'Se încarcă...' : 'Adaugă Fotografii'}
                      <input type="file" multiple accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
                    </label>
                  ) : (
                    <div className="w-full bg-zinc-800/50 text-zinc-400 py-4 rounded-2xl flex items-center justify-center gap-2 border border-zinc-700/50 italic text-sm">
                      <ImageIcon size={18} />
                      Vizualizare fișiere de pe disc (folderul /processed)
                    </div>
                  )
                ) : (
                  <div className="flex gap-2">
                    <button 
                      disabled={selectedPhotoIds.length === 0}
                      onClick={() => {
                        setSelectAction('bulk-move');
                        setIsAlbumSelectModalOpen(true);
                      }}
                      className="flex-1 bg-zinc-800 text-zinc-300 py-3 rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <Move size={18} /> Mută
                    </button>
                    <button 
                      disabled={selectedPhotoIds.length === 0}
                      onClick={() => {
                        setSelectAction('bulk-copy');
                        setIsAlbumSelectModalOpen(true);
                      }}
                      className="flex-1 bg-zinc-800 text-zinc-300 py-3 rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <Copy size={18} /> Copiază
                    </button>
                    <button 
                      disabled={selectedPhotoIds.length === 0}
                      onClick={() => setIsBulkDeleteModalOpen(true)}
                      className="flex-1 bg-red-500/10 text-red-500 py-3 rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <Trash2 size={18} /> Șterge
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {currentPhotos.map(photo => (
                  <PhotoCard 
                    key={photo.id} 
                    photo={photo} 
                    albums={albums}
                    onDelete={() => deletePhoto(photo.id)}
                    onMove={() => openAlbumSelect(photo, 'move')}
                    onCopy={() => openAlbumSelect(photo, 'copy')}
                    isSelectionMode={isSelectionMode}
                    isSelected={selectedPhotoIds.includes(photo.id)}
                    onSelect={() => togglePhotoSelection(photo.id)}
                    onLongPress={() => {
                      setIsSelectionMode(true);
                      setSelectedPhotoIds([photo.id]);
                    }}
                  />
                ))}
              </div>
              
              {currentPhotos.length === 0 && (
                <div className="py-20 text-center text-zinc-600">
                  <ImageIcon size={48} className="mx-auto mb-4 opacity-20" />
                  <p>Nicio fotografie în acest album</p>
                </div>
              )}
            </motion.div>
          )}

          {view === 'schedule' && (
            <motion.div
              key="schedule"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="pt-[20px] space-y-8 pb-24"
            >
              <ScheduleSection 
                title="În cursul săptămânii" 
                type="weekday" 
              />
              <ScheduleSection 
                title="Weekend" 
                type="weekend" 
              />
              
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-sm text-emerald-400 leading-relaxed">
                <p className="font-semibold mb-1">💡 Sfat</p>
                Aplicația va opri automat ecranul în afara intervalului orar setat pentru a economisi energie și a prelungi durata de viață a display-ului.
              </div>
            </motion.div>
          )}

          {view === 'ambilight' && (
            <motion.div
              key="ambilight"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="pt-[20px] pb-24"
            >
              <AmbilightSection data={ambilightSettings} update={updateAmbilightSetting} />
            </motion.div>
          )}
        </AnimatePresence>

      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 h-20 bg-[#0A0A0A]/80 backdrop-blur-xl border-t border-zinc-800/50 px-6 flex items-center justify-between z-40">
        <button 
          onClick={() => setView('dashboard')}
          className={`flex flex-col items-center gap-1 ${view === 'dashboard' ? 'text-emerald-500' : 'text-zinc-500'}`}
        >
          <Monitor size={22} />
          <span className="text-[9px] font-bold uppercase tracking-widest">Control</span>
        </button>
        <button 
          onClick={() => setView('albums')}
          className={`flex flex-col items-center gap-1 ${view === 'albums' || view === 'album-detail' ? 'text-emerald-500' : 'text-zinc-500'}`}
        >
          <ImageIcon size={22} />
          <span className="text-[9px] font-bold uppercase tracking-widest">Albume</span>
        </button>
        <button 
          onClick={() => setView('ambilight')}
          className={`flex flex-col items-center gap-1 ${view === 'ambilight' ? 'text-emerald-500' : 'text-zinc-500'}`}
        >
          <Zap size={22} />
          <span className="text-[9px] font-bold uppercase tracking-widest">Ambilight</span>
        </button>
        <button 
          onClick={() => setView('schedule')}
          className={`flex flex-col items-center gap-1 ${view === 'schedule' ? 'text-emerald-500' : 'text-zinc-500'}`}
        >
          <Calendar size={22} />
          <span className="text-[9px] font-bold uppercase tracking-widest">Program</span>
        </button>
      </nav>

      {/* Menu Overlay */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 bg-[#0A0A0A] z-50 overflow-y-auto"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold">Configurări</h2>
                <button onClick={() => setIsMenuOpen(false)} className="p-2 bg-zinc-800 rounded-full">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <section>
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Setări Slideshow</h3>
                  <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800/50 space-y-6">
                    <Slider 
                      label="Durată Imagine" 
                      value={parseInt(settings.duration) / 1000} 
                      min={1} max={60} 
                      unit="s"
                      onChange={(v: any) => updateSetting('duration', v * 1000)} 
                    />
                    <Slider 
                      label="Crossfade" 
                      value={parseInt(settings.crossfade) / 1000} 
                      min={0} max={5} 
                      step={0.1}
                      unit="s"
                      onChange={(v: any) => updateSetting('crossfade', v * 1000)} 
                    />
                    
                    <div className="pt-4 border-t border-zinc-800/50">
                      <Toggle 
                        label="Efect Ken Burns" 
                        enabled={settings.ken_burns_enabled === '1'} 
                        onToggle={(v: boolean) => updateSetting('ken_burns_enabled', v ? '1' : '0')} 
                      />
                      {settings.ken_burns_enabled === '1' && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-4">
                          <Slider 
                            label="Intensitate Efect" 
                            value={parseFloat(settings.ken_burns_intensity)} 
                            min={0} max={1} 
                            step={0.1}
                            onChange={(v: any) => updateSetting('ken_burns_intensity', v)} 
                          />
                        </motion.div>
                      )}
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Data și Ora Sistemului</h3>
                  <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800/50 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Clock className="text-emerald-500" size={20} />
                        <div>
                          <p className="text-sm font-medium">Ora Curentă Pi</p>
                          <p className="text-xs text-zinc-500 font-mono">{piStats?.time || 'Se încarcă...'}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => {
                          const now = new Date();
                          const formatted = now.toISOString().slice(0, 19).replace('T', ' ');
                          setTimeInput(formatted);
                          setIsTimeModalOpen(true);
                        }}
                        className="px-4 py-2 bg-emerald-500/10 text-emerald-500 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-emerald-500/20 transition-colors"
                      >
                        Reglează
                      </button>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Stocare Sistem</h3>
                  <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800/50">
                    <div className="flex items-center gap-3">
                      <Database className="text-emerald-500" size={20} />
                      <div className="flex-1">
                        <div className="flex justify-between mb-1">
                          <p className="text-sm font-medium">Spațiu pe Disc</p>
                          <p className="text-xs text-zinc-500 font-mono">
                            {piStats ? `${((parseInt(piStats.storageTotal) - parseInt(piStats.storageUsed)) / 1024).toFixed(1)}GB liberi din ${(parseInt(piStats.storageTotal) / 1024).toFixed(1)}GB` : 'Se încarcă...'}
                          </p>
                        </div>
                        <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${piStats?.storagePercent || 0}%` }}
                            className={`h-full ${parseFloat(piStats?.storagePercent || '0') > 90 ? 'bg-red-500' : 'bg-emerald-500'}`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Unelte Sistem</h3>
                  <div className="bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800/50">
                    <button onClick={() => handleSystemCommand('screen_on')} className="w-full p-4 flex items-center gap-4 hover:bg-zinc-800 transition-colors border-b border-zinc-800/50">
                      <Monitor className="text-emerald-500" />
                      <span className="flex-1 text-left font-medium">Pornește Ecran</span>
                      <ChevronRight size={18} className="text-zinc-600" />
                    </button>
                    <button onClick={() => handleSystemCommand('screen_off')} className="w-full p-4 flex items-center gap-4 hover:bg-zinc-800 transition-colors border-b border-zinc-800/50">
                      <Power className="text-red-500" />
                      <span className="flex-1 text-left font-medium">Oprește Ecran</span>
                      <ChevronRight size={18} className="text-zinc-600" />
                    </button>
                    <button onClick={() => handleSystemCommand('restart_display')} className="w-full p-4 flex items-center gap-4 hover:bg-zinc-800 transition-colors border-b border-zinc-800/50">
                      <RotateCcw className="text-blue-500" />
                      <span className="flex-1 text-left font-medium">Refresh Ramă</span>
                      <ChevronRight size={18} className="text-zinc-600" />
                    </button>
                    <button onClick={() => {
                      if (confirm('Ești sigur că vrei să repornești Raspberry Pi?')) {
                        handleSystemCommand('reboot');
                      }
                    }} className="w-full p-4 flex items-center gap-4 hover:bg-zinc-800 transition-colors">
                      <Monitor className="text-orange-500" />
                      <span className="flex-1 text-left font-medium">Reboot Raspberry Pi</span>
                      <ChevronRight size={18} className="text-zinc-600" />
                    </button>
                  </div>
                </section>

                <section>
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Informații Rețea</h3>
                  <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800/50 font-mono text-sm">
                    <div className="flex justify-between mb-2">
                      <span className="text-zinc-500">IP Local:</span>
                      <span className="text-emerald-500">192.168.100.93</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Port:</span>
                      <span className="text-emerald-500">3000</span>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Modals */}
      <AnimatePresence>
        {(isCreateModalOpen || isRenameModalOpen) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-xl flex items-start pt-24 justify-center z-50 p-6"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-zinc-900 rounded-3xl p-6 border border-zinc-800 shadow-2xl"
            >
              <h3 className="text-xl font-bold mb-4">
                {isCreateModalOpen ? 'Album Nou' : 'Redenumește Album'}
              </h3>
              <input
                autoFocus
                type="text"
                value={albumNameInput}
                onChange={(e) => setAlbumNameInput(e.target.value)}
                placeholder="Nume album..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-emerald-500 transition-colors mb-6"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') isCreateModalOpen ? createAlbum() : renameAlbum();
                }}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setIsRenameModalOpen(false);
                    setAlbumNameInput("");
                  }}
                  className="flex-1 py-3 bg-zinc-800 rounded-xl font-semibold text-zinc-400"
                >
                  Anulează
                </button>
                <button
                  onClick={isCreateModalOpen ? createAlbum : renameAlbum}
                  className="flex-1 py-3 bg-emerald-500 rounded-xl font-semibold text-black"
                >
                  Salvează
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {isDeleteModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-zinc-900 rounded-3xl p-6 border border-zinc-800 shadow-2xl"
            >
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-center mb-2">Ștergi Albumul?</h3>
              <p className="text-zinc-400 text-center mb-8">
                Această acțiune va șterge definitiv albumul <span className="text-white font-semibold">"{targetAlbum?.name}"</span> și toate fotografiile din el.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 py-3 bg-zinc-800 rounded-xl font-semibold text-zinc-400"
                >
                  Anulează
                </button>
                <button
                  onClick={deleteAlbum}
                  className="flex-1 py-3 bg-red-500 rounded-xl font-semibold text-white"
                >
                  Șterge
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {isTimeModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-zinc-900 rounded-3xl p-6 border border-zinc-800 shadow-2xl"
            >
              <h3 className="text-xl font-bold mb-4">Reglează Ora Sistemului</h3>
              <p className="text-xs text-zinc-500 mb-4">Format: AAAA-LL-ZZ HH:MM:SS</p>
              <input
                autoFocus
                type="text"
                value={timeInput}
                onChange={(e) => setTimeInput(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-lg font-mono focus:outline-none focus:border-emerald-500 transition-colors mb-6"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setIsTimeModalOpen(false)}
                  className="flex-1 py-3 bg-zinc-800 rounded-xl font-semibold text-zinc-400"
                >
                  Anulează
                </button>
                <button
                  onClick={async () => {
                    await fetch('/api/system/time', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ datetime: timeInput })
                    });
                    setIsTimeModalOpen(false);
                    fetchData();
                  }}
                  className="flex-1 py-3 bg-emerald-500 rounded-xl font-semibold text-black"
                >
                  Setează
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {isAlbumSelectModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-zinc-900 rounded-3xl p-6 border border-zinc-800 shadow-2xl flex flex-col max-h-[80vh]"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold">
                  {selectAction?.includes('move') ? 'Mută în Album' : 'Copiază în Album'}
                </h3>
                <button 
                  onClick={() => {
                    setIsAlbumSelectModalOpen(false);
                    setSelectAction(null);
                  }}
                  className="p-2 bg-zinc-800 rounded-full text-zinc-400"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                {albums.map(album => (
                  <button
                    key={album.id}
                    onClick={() => {
                      if (selectAction === 'bulk-move') {
                        bulkMovePhotos(album.id);
                      } else if (selectAction === 'bulk-copy') {
                        bulkCopyPhotos(album.id);
                      } else if (targetPhoto) {
                        selectAction === 'move' 
                          ? movePhoto(targetPhoto.id, album.id)
                          : copyPhoto(targetPhoto.id, album.id);
                      }
                    }}
                    className={`w-full p-4 flex items-center gap-4 rounded-2xl transition-all border ${
                      selectedAlbum?.id === album.id 
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' 
                        : 'bg-zinc-800/50 border-transparent text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    <ImageIcon size={20} className={selectedAlbum?.id === album.id ? 'text-emerald-500' : 'text-zinc-500'} />
                    <span className="font-medium flex-1 text-left">{album.name}</span>
                    {selectedAlbum?.id === album.id && <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">Curent</span>}
                  </button>
                ))}
              </div>

              <button
                onClick={() => {
                  setIsAlbumSelectModalOpen(false);
                  setSelectAction(null);
                }}
                className="mt-6 w-full py-3 bg-zinc-800 rounded-xl font-semibold text-zinc-400"
              >
                Anulează
              </button>
            </motion.div>
          </motion.div>
        )}

        {isBulkDeleteModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-zinc-900 rounded-3xl p-6 border border-zinc-800 shadow-2xl"
            >
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-center mb-2">Ștergi {selectedPhotoIds.length} fotografii?</h3>
              <p className="text-zinc-400 text-center mb-8">
                Această acțiune va șterge definitiv fotografiile selectate.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsBulkDeleteModalOpen(false)}
                  className="flex-1 py-3 bg-zinc-800 rounded-xl font-semibold text-zinc-400"
                >
                  Anulează
                </button>
                <button
                  onClick={bulkDeletePhotos}
                  className="flex-1 py-3 bg-red-500 rounded-xl font-semibold text-white"
                >
                  Șterge
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
