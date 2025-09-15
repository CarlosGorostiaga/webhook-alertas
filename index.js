// ==============================
//  index.js  (ESM / Node 20+)
// ==============================

// Libs
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import multer from 'multer';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

// App
const app = express();
app.use(helmet());        // cabeceras de seguridad
app.use(morgan('tiny'));  // logs de peticiones

// Multer: subidas temporales (puedes limitar tamaño si quieres)
const upload = multer({
  dest: 'uploads/',
  // limits: { fileSize: 25 * 1024 * 1024 } // ej. 25MB
});

// ==============================
//  Destinatarios por tipo
// ==============================
const DESTINATARIOS = {
  'Alerta PRL': 'carlosgorospo@gmail.com',
  'DBC ANEXOS MANTTO AlertaPrl': 'carlosgorospo@gmail.com',
  'DBC IMAGENKLIN AlertaPrl': 'carlosgorospo@gmail.com',
  'DBC IMGSTOP GO OTROS AlertaPrl': 'carlosgorospo@gmail.com'
};

// Búsqueda de destinatarios por nombre de archivo (match sencillo, sensitivo)
function pickRecipientsByFilename(filename) {
  for (const tipo of Object.keys(DESTINATARIOS)) {
    if (filename.includes(tipo)) return DESTINATARIOS[tipo];
  }
  return null;
}

// ==============================
//  SMTP (timeouts + verify)
// ==============================
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true', // true=465, false=587 STARTTLS
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },

  // timeouts razonables para evitar cuelgues largos
  connectionTimeout: 20000,
  greetingTimeout: 20000,
  socketTimeout: 20000,
  tls: { minVersion: 'TLSv1.2' }
});

// Verificación al arrancar (verás OK o el motivo del fallo en logs)
transporter.verify()
  .then(() => console.log('SMTP ✅ verificado (listo para enviar)'))
  .catch(err => console.error('SMTP ❌ no disponible:', err.message));

// ==============================
//  API Key middleware (robusto)
// ==============================
function checkApiKey(req, res, next) {
  const key = (req.header('X-API-Key') || '').trim();
  const expected = (process.env.API_KEY || '').trim();

  if (!key || key !== expected) {
    // Log mínimo y enmascarado para depurar desalineaciones
    console.log('API_KEY mismatch. recv:', JSON.stringify(key), 'exp:', JSON.stringify(expected));
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  next();
}

// ==============================
//  Rutas
// ==============================

// Salud
app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'webhook-alertas', uptime: process.uptime() });
});

// Test SMTP sin adjuntos (diagnóstico rápido)
app.get('/mailtest', async (_req, res) => {
  try {
    await transporter.sendMail({
      from: `"${process.env.FROM_NAME || 'Automatizacion TSI'}" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
      to: process.env.SMTP_USER,
      subject: 'Test SMTP Railway',
      text: 'Hola, prueba SMTP sin adjuntos.'
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('mailtest error:', e.message);
    res.status(502).json({ ok: false, error: e.message });
  }
});

// Recibir alerta con adjunto y reenviar por email
app.post('/alerta', checkApiKey, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: 'file is required' });
  }

  try {
    const originalName = req.file.originalname || req.file.filename;
    const subject = (req.body?.subject || path.parse(originalName).name);
    const body = (req.body?.body || `Hola,

Esto es una automatización de TSI.

Se adjunta el documento indicado en Asunto.

Un saludo.`);

    let recipients = (req.body?.recipients || '').trim();
    if (!recipients) {
      const auto = pickRecipientsByFilename(originalName);
      if (!auto) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({ ok: false, error: 'No recipients matched by filename and none provided' });
      }
      recipients = auto;
    }

    const toList = recipients.split(/[;,]/).map(s => s.trim()).filter(Boolean);
    const fromName = process.env.FROM_NAME || 'Automatizacion TSI';
    const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_USER;

    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: toList,
      subject,
      text: body,
      attachments: [{ filename: originalName, path: req.file.path }]
    });

    // limpiar el archivo temporal
    fs.unlink(req.file.path, () => {});
    res.json({ ok: true, sent: { subject, to: toList, filename: originalName } });
  } catch (err) {
    // siempre intentamos limpiar si existe
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

// ==============================
//  Arranque
// ==============================
const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Webhook escuchando en puerto ${port}`));
