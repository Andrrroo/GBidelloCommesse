import { Router } from 'express';
import { randomUUID } from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { logger } from '../lib/logger.js';
import { requireAuth } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const uploadsRouter = Router();

const uploadsDir = path.join(__dirname, '..', '..', 'uploads', 'pdf');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Solo file PDF sono consentiti'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});

uploadsRouter.post('/api/upload/pdf', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nessun file caricato' });
    }
    const fileUrl = `/uploads/pdf/${req.file.filename}`;
    res.json({
      url: fileUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size
    });
  } catch (error) {
    logger.error('Upload error', { err: error });
    res.status(500).json({ error: 'Errore durante l\'upload del file' });
  }
});

// Root assoluto della directory uploads, usato per verificare che le
// richieste NON risolvano path fuori dalla directory consentita.
const UPLOADS_ROOT = path.resolve(path.join(__dirname, '..', '..', 'uploads'));

// Richiede auth per il download: /uploads non è sotto il prefisso /api dove
// il middleware auth globale è montato, quindi va protetto esplicitamente.
uploadsRouter.use('/uploads', requireAuth, (req, res) => {
  // path.join risolve i segmenti ma su Windows i backslash nei nomi file
  // o i simboli '..' negli URL potrebbero portare fuori dalla root.
  // Usiamo path.resolve + prefix-check per blocco totale del path traversal.
  const requested = path.resolve(path.join(UPLOADS_ROOT, req.path));
  if (!requested.startsWith(UPLOADS_ROOT + path.sep) && requested !== UPLOADS_ROOT) {
    return res.status(403).json({ error: 'Accesso non consentito' });
  }
  if (fs.existsSync(requested) && fs.statSync(requested).isFile()) {
    res.sendFile(requested);
  } else {
    res.status(404).json({ error: 'File non trovato' });
  }
});
