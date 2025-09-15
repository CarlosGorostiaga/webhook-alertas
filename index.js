import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import multer from 'multer';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(helmet());
app.use(morgan('tiny'));

const upload = multer({ dest: 'uploads/' }); // almacenamiento temporal

// Mapeo “tipo → destinatarios”
const DESTINATARIOS = {
  "Alerta PRL": "jose.herrero@tsigrupo.com;fernando.gomez@tsigrupo.com;beatriz.gonzalez@tsigrupo.com",
  "DBC ANEXOS MANTTO AlertaPrl": "carlos.gmartos@tsigrupo.com;jgarcia.sanz@tsigrupo.com;ainhoa.perez@tsigrupo.com;david.baz@tsigrupo.com",
  "DBC IMAGENKLIN AlertaPrl": "rafael.galan@tsigrupo.com;joseramon.sanchez@tsigrupo.com;david.baz@tsigrupo.com",
  "DBC IMGSTOP GO OTROS AlertaPrl": "ainhoa.perez@tsigrupo.com;david.baz@tsigrupo.com"
};

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true', // false para 587 (STARTTLS)
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

function pickRecipientsByFilename(filename) {
  for (const tipo of Object.keys(DESTINATARIOS)) {
    if (filename.includes(tipo)) return DESTINATARIOS[tipo];
  }
  return null;
}

function checkApiKey(req, res, next) {
  const key = req.header('X-API-Key');
  if (!key || key !== process.env.API_KEY) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  next();
}

app.post('/alerta', checkApiKey, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'file is required' });

  try {
    const originalName = req.file.originalname || req.file.filename;
    const subject = req.body?.subject || path.parse(originalName).name;
    const body = req.body?.body || `Hola,

Esto es una automatización de TSI.

Se adjunta el documento indicado en Asunto.

Un saludo.`;

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

    fs.unlink(req.file.path, () => {});
    res.json({ ok: true, sent: { subject, to: toList, filename: originalName } });
  } catch (err) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

app.get('/', (_req, res) => res.json({ ok: true, service: 'webhook-alertas', uptime: process.uptime() }));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Webhook escuchando en puerto ${port}`));
