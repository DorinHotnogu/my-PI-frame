import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import sharp from 'sharp';
import cors from 'cors';
import { exec, execSync } from 'child_process';
import Database from 'better-sqlite3';

const app = express();
const PORT = 3000;

// Global Error Handlers to prevent silent crashes
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

// Database Setup
console.log('[DB] Initializing SQLite database (piframe.db)...');
const DB_PATH = 'piframe.db';
const BACKUP_PATH = 'piframe.db.bak';

const BACKUP_COUNT = 3; // Păstrăm 3 copii de backup
let lastBackupTime = 0;
const BACKUP_INTERVAL = 5 * 60 * 1000; // Backup maxim o dată la 5 minute

function backupDatabase(force: boolean = false) {
  try {
    const now = Date.now();
    if (!force && (now - lastBackupTime) < BACKUP_INTERVAL) {
      return;
    }
    if (!fs.existsSync(DB_PATH)) return;

    // Intai rotatie: .bak.2 devine .bak.3, .bak.1 devine .bak.2
    for (let i = BACKUP_COUNT; i >= 2; i--) {
      const older = `${DB_PATH}.bak.${i}`;
      const newer = `${DB_PATH}.bak.${i - 1}`;
      if (fs.existsSync(older)) fs.unlinkSync(older);
      if (fs.existsSync(newer)) fs.renameSync(newer, older);
    }

    // Apoi copie noua ca .bak.1
    fs.copyFileSync(DB_PATH, `${DB_PATH}.bak.1`);

    lastBackupTime = now;
    console.log('[DB] Backup rotativ creat cu succes');
  } catch (err) {
    console.error('[DB] Backup failed:', err);
  }
}


function restoreDatabase() {
  // Încearcă fiecare backup în ordine (.bak.1 = cel mai recent)
  for (let i = 1; i <= BACKUP_COUNT; i++) {
    const backupFile = `${DB_PATH}.bak.${i}`;
    try {
      if (fs.existsSync(backupFile)) {
        fs.copyFileSync(backupFile, DB_PATH);
        console.log(`[DB] Restored from backup ${i}`);
        return true;
      }
    } catch (err) {
      console.error(`[DB] Restore from backup ${i} failed:`, err);
    }
  }

  // Fallback: încearcă vechiul .bak dacă există
  if (fs.existsSync(BACKUP_PATH)) {
    try {
      fs.copyFileSync(BACKUP_PATH, DB_PATH);
      console.log('[DB] Restored from legacy backup');
      return true;
    } catch (err) {
      console.error('[DB] Legacy restore failed:', err);
    }
  }

  return false;
}

function verifyDatabase(): boolean {
  try {
    // Verifică integritatea completă a bazei de date
    const result = db.pragma('integrity_check') as any[];
    if (result[0]?.integrity_check !== 'ok') {
      console.error('[DB] Integrity check failed:', result);
      return false;
    }
    // Verifică că tabelele principale există și sunt accesibile
    db.prepare('SELECT COUNT(*) FROM settings').get();
    db.prepare('SELECT COUNT(*) FROM albums').get();
    db.prepare('SELECT COUNT(*) FROM photos').get();
    db.prepare('SELECT COUNT(*) FROM schedule').get();
    db.prepare('SELECT COUNT(*) FROM ambilight').get();
    return true;
  } catch (err) {
    console.error('[DB] Verification failed:', err);
    return false;
  }
}

let db: Database.Database;
try {
  db = new Database(DB_PATH);
  db.prepare('SELECT 1').get();
} catch (err: any) {
  if (err.code === 'SQLITE_CORRUPT') {
    console.error('[DB] Database is corrupt! Attempting restore...');
    if (restoreDatabase()) {
      try {
        db = new Database(DB_PATH);
        db.prepare('SELECT 1').get();
      } catch (retryErr) {
        console.error('[DB] Restore failed to fix corruption. Deleting...');
        fs.unlinkSync(DB_PATH);
        db = new Database(DB_PATH);
      }
    } else {
      console.error('[DB] No backup found. Deleting and recreating...');
      if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
      db = new Database(DB_PATH);
    }
  } else {
    throw err;
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    album_id INTEGER,
    filename TEXT NOT NULL,
    original_name TEXT,
    order_index INTEGER DEFAULT 0,
    FOREIGN KEY(album_id) REFERENCES albums(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS schedule (
    day_type TEXT PRIMARY KEY, -- 'weekday', 'weekend'
    start_time TEXT,
    end_time TEXT,
    enabled INTEGER DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS ambilight (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Initial Ambilight Settings
const defaultAmbilight = [
  ['enabled', '0'],
  ['brightness', '128'],
  ['leds_top', '20'],
  ['leds_right', '15'],
  ['leds_bottom', '20'],
  ['leds_left', '15'],
  ['start_corner', 'bottom-left'],
  ['direction', 'cw'],
  ['smoothing', '0.5'],
  ['sample_depth', '10'], // How deep into the image to sample for edge colors
  ['mode', 'dynamic'], // 'dynamic' or 'static'
  ['static_color', '#ffffff']
];
const insertAmbilight = db.prepare('INSERT OR IGNORE INTO ambilight (key, value) VALUES (?, ?)');
defaultAmbilight.forEach(s => insertAmbilight.run(s[0], s[1]));

// Initial Schedule
const defaultSchedule = [
  ['weekday', '08:00', '22:00', 1],
  ['weekend', '09:00', '23:00', 1]
];
const insertSchedule = db.prepare('INSERT OR IGNORE INTO schedule (day_type, start_time, end_time, enabled) VALUES (?, ?, ?, ?)');
defaultSchedule.forEach(s => insertSchedule.run(s[0], s[1], s[2], s[3]));

// Initial Settings
const defaultSettings = [
  ['duration', '10000'],
  ['crossfade', '5000'],
  ['ken_burns_enabled', '1'],
  ['ken_burns_intensity', '0.5'],
  ['current_album_id', '1'],
  ['is_playing', '1'],
  ['refresh_token', Date.now().toString()],
  ['shuffle_enabled', '0'],
  ['brightness', '1.0']
];

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
defaultSettings.forEach(s => insertSetting.run(s[0], s[1]));

// Verificare completa a bazei de date la pornire
if (verifyDatabase()) {
  console.log('[DB] Database integrity check passed');
  backupDatabase(true);
} else {
  console.error('[DB] Database integrity check FAILED - attempting restore');
  db.close();
  if (restoreDatabase()) {
    db = new Database(DB_PATH);
  }
}

// Default Album
const albumsCount = db.prepare('SELECT COUNT(*) as count FROM albums').get() as any;
if (albumsCount.count === 0) {
  db.prepare('INSERT INTO albums (id, name) VALUES (1, ?)').run('Albumul meu');
} else {
  // Migration: rename "Album Implicit" to "Albumul meu" if it exists
  db.prepare("UPDATE albums SET name = 'Albumul meu' WHERE name = 'Album Implicit'").run();
}

// Ensure directories exist
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const PROCESSED_DIR = path.join(process.cwd(), 'processed');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(PROCESSED_DIR)) fs.mkdirSync(PROCESSED_DIR);

// Multer config
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

app.use(cors());
app.use(express.json());

// Request logger for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} from ${req.ip}`);
  next();
});

app.use('/photos', express.static(PROCESSED_DIR));

// Simple ping for health check
app.get('/ping', (req, res) => {
  res.send('pong');
});

// --- LED Control Mock/Real ---
let ws281x: any = null;
let ledsInitialized = false;
let ledProcess: any = null;
let ledStateBeforeScreenOff: {
  enabled: string;
  mode: string;
  brightness: string;
  static_color: string;
} | null = null;

async function initLeds() {
  if (ledsInitialized) return;
  
  const ambilightSettings = getAmbilightSettings();
  if (ambilightSettings.enabled !== '1') return;

  const top = parseInt(ambilightSettings.leds_top) || 0;
  const right = parseInt(ambilightSettings.leds_right) || 0;
  const bottom = parseInt(ambilightSettings.leds_bottom) || 0;
  const left = parseInt(ambilightSettings.leds_left) || 0;
  const totalLeds = top + right + bottom + left;

  if (totalLeds <= 0) return;

  try {
    // Try to load the real library
    // @ts-ignore
    const mod = await import('rpi-ws281x-native');
    ws281x = mod.default || mod;
    
    ws281x.init({
      count: totalLeds,
      gpio: 18,
      brightness: parseInt(ambilightSettings.brightness) || 128,
      stripType: 'ws2812'
    });
    
    ledsInitialized = true;
    console.log(`LEDs initialized: ${totalLeds} LEDs on GPIO 18`);
  } catch (err) {
    console.warn("LED library not found or failed to init. Using mock.");
    // Mock implementation
    ws281x = {
      render: (data: Uint32Array) => {
        const settings = getAmbilightSettings();
        const top = parseInt(settings.leds_top) || 0;
        const right = parseInt(settings.leds_right) || 0;
        const bottom = parseInt(settings.leds_bottom) || 0;
        const left = parseInt(settings.leds_left) || 0;
        const totalLeds = top + right + bottom + left;
        const brightness = parseInt(settings.brightness) || 128;

        if (settings.mode === 'static') {
          const colorHex = settings.static_color || '#ffffff';
          exec(`sudo python3 led_control.py --mode static --color "${colorHex}" --brightness ${brightness} --count ${totalLeds}`, (err) => {
            if (err) console.error("LED static failed:", err.message);
          });
        } else {
          const colorsJson = JSON.stringify(Array.from(data));
          exec(`sudo python3 led_control.py --mode ambilight --colors '${colorsJson}' --brightness ${brightness} --count ${totalLeds}`, (err) => {
            if (err) console.error("LED ambilight failed:", err.message);
          });
        }
      },
      reset: () => {
        const settings = getAmbilightSettings();
        const top = parseInt(settings.leds_top) || 0;
        const right = parseInt(settings.leds_right) || 0;
        const bottom = parseInt(settings.leds_bottom) || 0;
        const left = parseInt(settings.leds_left) || 0;
        const totalLeds = top + right + bottom + left;
        console.log(`Fallback: Turning off ${totalLeds} LEDs`);
        exec(`sudo python3 led_control.py --mode off --count ${totalLeds}`, (err) => {
          if (err) console.error("Mock LED reset failed:", err.message);
        });
      },
      setBrightness: (b: number) => {}
    };
    ledsInitialized = true;
  }
}

function getAmbilightSettings() {
  const rows = db.prepare('SELECT * FROM ambilight').all();
  return rows.reduce((acc: any, curr: any) => {
    acc[curr.key] = curr.value;
    return acc;
  }, {});
}

async function updateAmbilight(photoFilename: string) {
  const startTime = Date.now();
  try {
    const settings = getAmbilightSettings();
    if (settings.enabled !== '1') {
      if (ws281x && ledsInitialized) {
        const top = parseInt(settings.leds_top) || 0;
        const right = parseInt(settings.leds_right) || 0;
        const bottom = parseInt(settings.leds_bottom) || 0;
        const left = parseInt(settings.leds_left) || 0;
        const totalLeds = top + right + bottom + left;
        if (totalLeds > 0) {
          ws281x.render(new Uint32Array(totalLeds));
        }
      }
      return;
    }

    await initLeds();

    const topCount = parseInt(settings.leds_top) || 0;
    const rightCount = parseInt(settings.leds_right) || 0;
    const bottomCount = parseInt(settings.leds_bottom) || 0;
    const leftCount = parseInt(settings.leds_left) || 0;
    const totalCount = topCount + rightCount + bottomCount + leftCount;

    if (totalCount <= 0) return;

    if (settings.mode === 'static') {
      const colorHex = settings.static_color || '#ffffff';
      const r = parseInt(colorHex.slice(1, 3), 16) || 0;
      const g = parseInt(colorHex.slice(3, 5), 16) || 0;
      const b = parseInt(colorHex.slice(5, 7), 16) || 0;
      const colorInt = (r << 16) | (g << 8) | b;
      
      const ledData = new Uint32Array(totalCount).fill(colorInt);
      if (ws281x) ws281x.render(ledData);
      return;
    }

    const photoPath = path.join(PROCESSED_DIR, photoFilename);
    if (!fs.existsSync(photoPath)) return;

    // OPTIMIZATION: Resize once to a small grid and read pixels
    // This is MUCH faster than extracting 70+ times
    const sampleSize = 40;
    const buffer = await sharp(photoPath)
      .resize(sampleSize, sampleSize, { fit: 'fill' })
      .raw()
      .toBuffer();

    const getPixel = (x: number, y: number) => {
      const ix = Math.min(sampleSize - 1, Math.max(0, Math.floor(x)));
      const iy = Math.min(sampleSize - 1, Math.max(0, Math.floor(y)));
      const idx = (iy * sampleSize + ix) * 3;
      return (buffer[idx] << 16) | (buffer[idx + 1] << 8) | buffer[idx + 2];
    };

    const segments: number[] = [];

    // TOP (Left to Right)
    for (let i = 0; i < topCount; i++) {
      segments.push(getPixel((i / topCount) * (sampleSize - 1), 0));
    }

    // RIGHT (Top to Bottom)
    for (let i = 0; i < rightCount; i++) {
      segments.push(getPixel(sampleSize - 1, (i / rightCount) * (sampleSize - 1)));
    }

    // BOTTOM (Right to Left)
    for (let i = bottomCount - 1; i >= 0; i--) {
      segments.push(getPixel((i / bottomCount) * (sampleSize - 1), sampleSize - 1));
    }

    // LEFT (Bottom to Top)
    for (let i = leftCount - 1; i >= 0; i--) {
      segments.push(getPixel(0, (i / leftCount) * (sampleSize - 1)));
    }

    let finalOrder = [...segments];
    if (settings.direction === 'ccw') finalOrder.reverse();
    
    let shift = 0;
    if (settings.start_corner === 'top-right') shift = topCount;
    if (settings.start_corner === 'bottom-right') shift = topCount + rightCount;
    if (settings.start_corner === 'bottom-left') shift = topCount + rightCount + bottomCount;
    
    if (shift > 0) {
      const part = finalOrder.splice(0, shift);
      finalOrder = [...finalOrder, ...part];
    }

    const ledData = new Uint32Array(totalCount);
    for (let i = 0; i < totalCount; i++) ledData[i] = finalOrder[i];

    if (ws281x) ws281x.render(ledData);
    // console.log(`Ambilight updated in ${Date.now() - startTime}ms`);
  } catch (err) {
    console.error("Ambilight update error:", err);
  }
}

// --- API ROUTES ---

// Settings
app.get('/api/settings', (req, res) => {
  const settings = db.prepare('SELECT * FROM settings').all();
  const settingsObj = settings.reduce((acc: any, curr: any) => {
    acc[curr.key] = curr.value;
    return acc;
  }, {});
  res.json(settingsObj);
});

app.post('/api/settings', (req, res) => {
  const { key, value } = req.body;
  db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(value.toString(), key);
  backupDatabase();
  
  if (key === 'is_playing' || key === 'duration') {
    startAutoAdvance();
  }
  
  res.json({ success: true });
});

// Albums
app.get('/api/albums', (req, res) => {
  const albums = db.prepare('SELECT * FROM albums').all();
  res.json(albums);
});

app.post('/api/albums', (req, res) => {
  const { name } = req.body;
  const result = db.prepare('INSERT INTO albums (name) VALUES (?)').run(name);
  res.json({ id: result.lastInsertRowid, name });
});

app.delete('/api/albums/:id', (req, res) => {
  const { id } = req.params;
  // Delete physical files first? For now just DB
  db.prepare('DELETE FROM albums WHERE id = ?').run(id);
  res.json({ success: true });
});

app.patch('/api/albums/:id', (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  db.prepare('UPDATE albums SET name = ? WHERE id = ?').run(name, id);
  res.json({ success: true });
});

// Photos
app.get('/api/photos/processed', (req, res) => {
  try {
    const files = fs.readdirSync(PROCESSED_DIR).filter(f => f.endsWith('.jpg'));
    const photos = db.prepare('SELECT * FROM photos').all() as any[];
    const photoMap = new Map(photos.map(p => [p.filename, p]));

    const result = files.map(filename => {
      const dbPhoto = photoMap.get(filename);
      return {
        id: dbPhoto ? dbPhoto.id : filename, // Use filename as fallback ID
        filename: filename,
        album_id: dbPhoto ? dbPhoto.album_id : null,
        original_name: dbPhoto ? dbPhoto.original_name : filename,
        is_orphaned: !dbPhoto
      };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read processed directory' });
  }
});

app.post('/api/photos/claim', (req, res) => {
  const { filename, album_id } = req.body;
  try {
    const existing = db.prepare('SELECT id FROM photos WHERE filename = ?').get(filename) as any;
    if (existing) {
      db.prepare('UPDATE photos SET album_id = ? WHERE id = ?').run(album_id, existing.id);
    } else {
      db.prepare('INSERT INTO photos (album_id, filename, original_name) VALUES (?, ?, ?)')
        .run(album_id, filename, filename);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to claim photo' });
  }
});

app.get('/api/albums/:id/photos', (req, res) => {
  const { id } = req.params;
  let photos;
  if (id === 'all') {
    photos = db.prepare('SELECT * FROM photos ORDER BY order_index ASC').all();
  } else {
    photos = db.prepare('SELECT * FROM photos WHERE album_id = ? ORDER BY order_index ASC').all(id);
  }
  res.json(photos);
});

app.post('/api/upload', upload.array('photos'), async (req, res) => {
  const { album_id } = req.body;
  const files = req.files as Express.Multer.File[];
  
  const processedFiles = [];

  for (const file of files) {
      for (const file of files) {
    // Fix extensie dubla: scoatem extensia veche inainte de a adauga .jpg
    const nameWithoutExt = file.filename.replace(/\.[^/.]+$/, '');
    const outputFilename = `processed-${nameWithoutExt}.jpg`;
    const outputPath = path.join(PROCESSED_DIR, outputFilename);

    // Image Processing: 9:16 Portrait
    // Target: 1080x1920 (standard HD portrait)
    await sharp(file.path)
      .resize({
        width: 1080,
        height: 1920,
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 90 })
      .toFile(outputPath);

    // Sterge fisierul original dupa procesare
    try {
      fs.unlinkSync(file.path);
    } catch (e) {
      console.error(`Failed to delete original: ${file.path}`, e);
    }

    const result = db.prepare('INSERT INTO photos (album_id, filename, original_name) VALUES (?, ?, ?)')
      .run(album_id, outputFilename, file.originalname);
    
    processedFiles.push({ id: result.lastInsertRowid, filename: outputFilename });
  }
  backupDatabase();

  res.json(processedFiles);
});

app.delete('/api/photos/:id', (req, res) => {
  const id = req.params.id;
  let filename = id;
  
  // Check if it's a numeric ID
  if (!isNaN(Number(id))) {
    const photo = db.prepare('SELECT filename FROM photos WHERE id = ?').get(id) as any;
    if (photo) {
      filename = photo.filename;
      db.prepare('DELETE FROM photos WHERE id = ?').run(id);
    }
  }
  
  const filePath = path.join(PROCESSED_DIR, filename);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      console.error(`Failed to delete file: ${filePath}`, e);
    }
  }
  res.json({ success: true });
});

app.post('/api/photos/:id/move', (req, res) => {
  const { album_id } = req.body;
  db.prepare('UPDATE photos SET album_id = ? WHERE id = ?').run(album_id, req.params.id);
  res.json({ success: true });
});

app.post('/api/photos/:id/copy', (req, res) => {
  const { album_id } = req.body;
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id) as any;
  if (photo) {
    db.prepare('INSERT INTO photos (album_id, filename, original_name) VALUES (?, ?, ?)')
      .run(album_id, photo.filename, photo.original_name);
  }
  res.json({ success: true });
});

// System Tools
function getDisplayCommands(state: 'on' | 'off') {
  if (state === 'on') {
    return 'DISPLAY=:0 xrandr --output HDMI-1 --auto';
  } else {
    return 'DISPLAY=:0 xrandr --output HDMI-1 --off';
  }
}

function setLedsOff() {
  try {
    if (ws281x && ledsInitialized) {
      const settings = getAmbilightSettings();
      const top = parseInt(settings.leds_top) || 0;
      const right = parseInt(settings.leds_right) || 0;
      const bottom = parseInt(settings.leds_bottom) || 0;
      const left = parseInt(settings.leds_left) || 0;
      const totalLeds = top + right + bottom + left;
      if (totalLeds > 0) {
        ws281x.render(new Uint32Array(totalLeds));
      }
    } else {
      exec(`sudo python3 led_control.py --mode off`, (err) => {
        if (err) console.error("LED off failed:", err.message);
      });
    }
  } catch (err) {
    console.error("Error setting LEDs off:", err);
  }
}

function saveAndTurnOffLeds() {
  const settings = getAmbilightSettings();
  ledStateBeforeScreenOff = {
    enabled: settings.enabled,
    mode: settings.mode,
    brightness: settings.brightness,
    static_color: settings.static_color
  };
  console.log('[LEDs] Stare salvata inainte de screen off:', ledStateBeforeScreenOff);
  setLedsOff();
}

function restoreLeds() {
  if (ledStateBeforeScreenOff && ledStateBeforeScreenOff.enabled === '1') {
    console.log('[LEDs] Restaurare stare anterioara:', ledStateBeforeScreenOff);
    updateLeds();
  } else {
    console.log('[LEDs] LED-urile erau oprite inainte de screen off, raman oprite.');
  }
  ledStateBeforeScreenOff = null;
}

function updateLeds() {
  try {
    const settings = getAmbilightSettings();
    if (settings.enabled === '1') {
      if (settings.mode === 'static') {
        // Static mode doesn't need a photo
        updateAmbilight('');
        return;
      }

      // Trigger Ambilight update for current photo
      const albumId = db.prepare('SELECT value FROM settings WHERE key = ?').get('current_album_id') as any;
      let photos;
      if (albumId.value === 'all') {
        photos = db.prepare('SELECT * FROM photos ORDER BY order_index ASC').all();
      } else {
        photos = db.prepare('SELECT * FROM photos WHERE album_id = ? ORDER BY order_index ASC').all(albumId.value);
      }
      if (photos.length > 0 && currentPhotoIndex < photos.length) {
        updateAmbilight(photos[currentPhotoIndex].filename);
      } else {
        // If no photos but enabled, we should at least clear or show static if that's the mode
        setLedsOff();
      }
    } else {
      setLedsOff();
    }
  } catch (err) {
    console.error("Error updating LEDs:", err);
  }
}

app.post('/api/system/:command', (req, res) => {
  const { command } = req.params;
  console.log(`[System] Command: ${command}`);

  if (command === 'screen_on' || command === 'screen_off') {
    manualOverride = true;
  }
  
  let shellCmd = '';
  switch (command) {
    case 'screen_on':
      shellCmd = getDisplayCommands('on');
      break;
    case 'screen_off':
      shellCmd = getDisplayCommands('off');
      break;
    case 'restart_display':
      db.prepare("UPDATE settings SET value = ? WHERE key = 'refresh_token'").run(Date.now().toString());
      // Forțează reload Chromium pe Pi
      exec('DISPLAY=:0 xdotool key F5', (err) => {
        if (err) console.error('[System] Refresh failed:', err.message);
      });
      res.json({ success: true, message: 'Refresh signal sent to frame' });
      return;
    case 'reboot':
      shellCmd = 'sudo reboot';
      break;
    default:
      return res.status(400).json({ error: 'Invalid command' });
  }

  if (process.env.NODE_ENV === 'production') {
    if (command === 'screen_off') {
      saveAndTurnOffLeds();
    }

    exec(shellCmd, (err, stdout, stderr) => {
      if (err) {
        console.error(`[System] Error: ${err.message}`);
        return res.status(500).json({ error: err.message });
      }

      if (command === 'screen_on') {
        setTimeout(() => restoreLeds(), 1000);
      }

      res.json({ success: true, stdout });
    });
  } else {
    if (command === 'screen_off') {
      saveAndTurnOffLeds();
    } else if (command === 'screen_on') {
      restoreLeds();
    }
    console.log(`[System] Simulated: ${shellCmd}`);
    res.json({ success: true, message: `Simulated: ${shellCmd}` });
  }
});

// Ambilight API
app.get('/api/ambilight', (req, res) => {
  const settings = db.prepare('SELECT * FROM ambilight').all();
  const settingsObj = settings.reduce((acc: any, curr: any) => {
    acc[curr.key] = curr.value;
    return acc;
  }, {});
  res.json(settingsObj);
});

app.post('/api/ambilight', (req, res) => {
  const { key, value } = req.body;
  db.prepare('UPDATE ambilight SET value = ? WHERE key = ?').run(value.toString(), key);
  backupDatabase();
  
  // If layout or brightness changed, force re-init
  if (key === 'enabled' || key === 'brightness' || key.startsWith('leds_')) {
    ledsInitialized = false;
    if (ws281x && ws281x.reset) ws281x.reset();
  }

  // Trigger update immediately
  updateLeds();
  
  res.json({ success: true });
});

// Schedule
app.get('/api/schedule', (req, res) => {
  const schedule = db.prepare('SELECT * FROM schedule').all();
  res.json(schedule);
});

app.post('/api/schedule', (req, res) => {
  const { day_type, start_time, end_time, enabled } = req.body;
  db.prepare(`
    INSERT INTO schedule (day_type, start_time, end_time, enabled)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(day_type) DO UPDATE SET
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      enabled = excluded.enabled
  `).run(day_type, start_time, end_time, enabled ? 1 : 0);
  res.json({ success: true });
});

// Slideshow state
let currentPhotoIndex = 0;
let lastIndices: number[] = [];
let autoAdvanceTimer: NodeJS.Timeout | null = null;

async function advanceSlideshow() {
  console.log('[Slideshow] Advancing to next slide...');
  const settings = db.prepare('SELECT value FROM settings WHERE key = ?').get('shuffle_enabled') as any;
  const albumId = db.prepare('SELECT value FROM settings WHERE key = ?').get('current_album_id') as any;
  
  let photos;
  if (albumId.value === 'all') {
    photos = db.prepare('SELECT * FROM photos ORDER BY order_index ASC').all();
  } else {
    photos = db.prepare('SELECT * FROM photos WHERE album_id = ? ORDER BY order_index ASC').all(albumId.value);
  }
  
  if (photos.length > 0) {
    if (settings?.value === '1' && photos.length > 1) {
      let nextIndex = currentPhotoIndex;
      let attempts = 0;
      const maxHistory = Math.floor(photos.length * 0.7);
      
      while (attempts < 20) {
        nextIndex = Math.floor(Math.random() * photos.length);
        if (!lastIndices.includes(nextIndex) && nextIndex !== currentPhotoIndex) break;
        attempts++;
      }
      
      currentPhotoIndex = nextIndex;
      lastIndices.push(currentPhotoIndex);
      if (lastIndices.length > maxHistory) lastIndices.shift();
    } else {
      currentPhotoIndex = (currentPhotoIndex + 1) % photos.length;
      lastIndices = [];
    }
    
    // Update Ambilight for the new photo
    updateAmbilight(photos[currentPhotoIndex].filename);
  }
  triggerRefresh();
}

function startAutoAdvance() {
  if (autoAdvanceTimer) clearInterval(autoAdvanceTimer);
  
  const settings = db.prepare('SELECT * FROM settings').all();
  const settingsObj = settings.reduce((acc: any, curr: any) => {
    acc[curr.key] = curr.value;
    return acc;
  }, {});

  if (settingsObj.is_playing === '1') {
    const duration = Math.max(2000, parseInt(settingsObj.duration) || 5000);
    console.log(`[Slideshow] Auto-advance started with duration: ${duration}ms`);
    autoAdvanceTimer = setInterval(() => {
      advanceSlideshow();
    }, duration);
  }
}

// Start on boot
setTimeout(startAutoAdvance, 2000);

app.get('/api/pi/stats', (req, res) => {
  const now = new Date();
  const timeStr = now.toLocaleString('ro-RO', { hour12: false });

  if (process.env.NODE_ENV === 'production') {
    try {
      const tempOutput = execSync('vcgencmd measure_temp').toString();
      const temp = tempOutput.replace('temp=', '').replace("'C\n", '').trim();
      
      const cpuOutput = execSync("top -bn1 | grep 'Cpu(s)' | sed 's/.*, *\\([0-9.]*\\)%* id.*/\\1/' | awk '{print 100 - $1}'").toString().trim();
      
      const ramOutput = execSync("free -m | awk '/Mem:/ { print $3 \",\" $2 }'").toString().trim();
      const [ramUsed, ramTotal] = ramOutput.split(',');
      
      const storageOutput = execSync("df -m / | awk 'NR==2 {print $3 \",\" $2 \",\" $5}'").toString().trim();
      const [storageUsed, storageTotal, storagePercent] = storageOutput.split(',');
      
      res.json({ 
        temp, 
        cpu: parseFloat(cpuOutput).toFixed(1),
        ramUsed,
        ramTotal,
        storageUsed,
        storageTotal,
        storagePercent: storagePercent.replace('%', ''),
        time: timeStr
      });
    } catch (err) {
      res.json({ temp: 'N/A', cpu: 'N/A', ramUsed: '0', ramTotal: '0', storageUsed: '0', storageTotal: '0', storagePercent: '0', time: timeStr });
    }
  } else {
    // Mock for dev
    res.json({ 
      temp: (40 + Math.random() * 10).toFixed(1),
      cpu: (10 + Math.random() * 20).toFixed(1),
      ramUsed: '450',
      ramTotal: '1024',
      storageUsed: '5000',
      storageTotal: '32000',
      storagePercent: '15',
      time: timeStr
    });
  }
});

app.post('/api/system/time', (req, res) => {
  const { datetime } = req.body;
  if (!datetime) return res.status(400).json({ error: 'Missing datetime' });

  if (process.env.NODE_ENV === 'production') {
    exec(`sudo date -s "${datetime}"`, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  } else {
    console.log(`[System] Simulated time set to: ${datetime}`);
    res.json({ success: true });
  }
});

app.get('/api/slideshow/current', (req, res) => {
  const settings = db.prepare('SELECT * FROM settings').all();
  const settingsObj = settings.reduce((acc: any, curr: any) => {
    acc[curr.key] = curr.value;
    return acc;
  }, {});

  let photos;
  if (settingsObj.current_album_id === 'all') {
    photos = db.prepare('SELECT * FROM photos ORDER BY order_index ASC').all();
  } else {
    photos = db.prepare('SELECT * FROM photos WHERE album_id = ? ORDER BY order_index ASC').all(settingsObj.current_album_id);
  }
  
  if (photos.length === 0) return res.json({ photo: null, settings: settingsObj });
  
  if (currentPhotoIndex >= photos.length) currentPhotoIndex = 0;
  if (currentPhotoIndex < 0) currentPhotoIndex = photos.length - 1;
  
  const currentPhoto = photos[currentPhotoIndex];
  updateAmbilight(currentPhoto.filename);

  res.json({ 
    photo: currentPhoto, 
    settings: settingsObj,
    total: photos.length,
    index: currentPhotoIndex
  });
});

function triggerRefresh() {
  db.prepare("UPDATE settings SET value = ? WHERE key = 'refresh_token'").run(Date.now().toString());
}

app.post('/api/settings', (req, res) => {
  const { key, value } = req.body;
  db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(value.toString(), key);
  
  // Trigger refresh for all settings changes so slideshow picks them up immediately
  triggerRefresh();
  
  // Restart timer if duration or is_playing changed
  if (key === 'duration' || key === 'is_playing' || key === 'current_album_id') {
    startAutoAdvance();
  }
  
  res.json({ success: true });
});

app.post('/api/slideshow/next', (req, res) => {
  advanceSlideshow();
  // Reset timer on manual command
  startAutoAdvance();
  res.json({ success: true });
});

app.post('/api/slideshow/prev', (req, res) => {
  const albumId = db.prepare('SELECT value FROM settings WHERE key = ?').get('current_album_id') as any;
  
  let photos;
  if (albumId.value === 'all') {
    photos = db.prepare('SELECT id FROM photos ORDER BY order_index ASC').all();
  } else {
    photos = db.prepare('SELECT id FROM photos WHERE album_id = ? ORDER BY order_index ASC').all(albumId.value);
  }

  if (photos.length > 0) {
    currentPhotoIndex = (currentPhotoIndex - 1 + photos.length) % photos.length;
  }
  triggerRefresh();
  // Reset timer on manual command
  startAutoAdvance();
  res.json({ success: true });
});

// Schedule Enforcer
let lastScheduleState: 'on' | 'off' | null = null;
let manualOverride: boolean = false;
let lastScheduleWindow: boolean | null = null;

setInterval(() => {
  const now = new Date();
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const dayType = isWeekend ? 'weekend' : 'weekday';
  const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

  const schedule = db.prepare('SELECT * FROM schedule WHERE day_type = ?').get(dayType) as any;
  
  if (schedule && schedule.enabled) {
    const isWithinWindow = currentTime >= schedule.start_time && currentTime < schedule.end_time;

    // Detectăm momentul exact de tranziție (pragul)
    const windowChanged = lastScheduleWindow !== null && isWithinWindow !== lastScheduleWindow;
    lastScheduleWindow = isWithinWindow;

    // Dacă am detectat o tranziție, resetăm override-ul manual
    if (windowChanged) {
      manualOverride = false;
    }

    // Dacă utilizatorul a dat comandă manuală, nu facem nimic
    if (manualOverride) return;

    const newState = isWithinWindow ? 'on' : 'off';

    if (newState !== lastScheduleState) {
      console.log(`[Schedule] ${dayType} ${currentTime} -> ${newState}`);

      if (newState === 'off') {
        saveAndTurnOffLeds();
      }

      const shellCmd = getDisplayCommands(newState);

      if (process.env.NODE_ENV === 'production') {
        exec(shellCmd, (err) => {
          if (!err) {
            lastScheduleState = newState;
            if (newState === 'on') {
              setTimeout(() => restoreLeds(), 1000);
            }
          } else {
            console.error(`[Schedule] Error: ${err.message}`);
          }
        });
      } else {
        console.log(`[Schedule] Simulated: ${shellCmd}`);
        lastScheduleState = newState;
        if (newState === 'on') {
          restoreLeds();
        }
      }
    }
  }
}, 30000);

async function startServer() {
  try {
    console.log('[Server] Starting Express server on port 3000...');
    // Start listening immediately so the port is bound and health checks pass
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server listening on http://0.0.0.0:${PORT}`);
      
      // Disable screen blanking on startup if in production
      if (process.env.NODE_ENV === 'production') {
        exec('DISPLAY=:0 xset s off; DISPLAY=:0 xset -dpms; DISPLAY=:0 xset s noblank', (err) => {
          if (err) console.error('Failed to disable screen blanking:', err.message);
          else console.log('Screen blanking disabled');
        });
      }
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log('Starting Vite in middleware mode...');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      console.log('Vite middleware ready');
    } else {
      console.log('Starting in production mode...');
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  } catch (err) {
    console.error('FAILED TO START SERVER:', err);
  }
}

startServer();
