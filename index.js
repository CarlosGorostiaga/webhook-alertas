// Importamos librerías externas
import 'dotenv/config';        // Carga automáticamente variables de entorno desde el archivo .env
import express from 'express'; // Framework para crear el servidor HTTP
import helmet from 'helmet';   // Añade cabeceras de seguridad a las respuestas HTTP
import morgan from 'morgan';   // Middleware para registrar (log) las peticiones entrantes
import multer from 'multer';   // Middleware para manejar archivos subidos en formularios multipart/form-data
import nodemailer from 'nodemailer'; // Librería para enviar correos electrónicos vía SMTP
import fs from 'fs';           // Módulo para interactuar con el sistema de archivos
import path from 'path';       // Módulo para trabajar con rutas y nombres de archivos

// Creamos la app de Express
const app = express();
app.use(helmet());     // Activamos seguridad básica
app.use(morgan('tiny')); // Log de cada request en consola

// Configuración de multer: los archivos se guardan temporalmente en la carpeta "uploads/"
const upload = multer({ dest: 'uploads/' });

// Diccionario de tipos de alerta → destinatarios (emails separados por ;)
// const DESTINATARIOS = {
//   "Alerta PRL": "jose.herrero@tsigrupo.com;fernando.gomez@tsigrupo.com;beatriz.gonzalez@tsigrupo.com",
//   "DBC ANEXOS MANTTO AlertaPrl": "carlos.gmartos@tsigrupo.com;jgarcia.sanz@tsigrupo.com;ainhoa.perez@tsigrupo.com;david.baz@tsigrupo.com",
//   "DBC IMAGENKLIN AlertaPrl": "rafael.galan@tsigrupo.com;joseramon.sanchez@tsigrupo.com;david.baz@tsigrupo.com",
//   "DBC IMGSTOP GO OTROS AlertaPrl": "ainhoa.perez@tsigrupo.com;david.baz@tsigrupo.com"
// };

const DESTINATARIOS = {
  "Alerta PRL": "carlosgorospo@gmail.com",
  "DBC ANEXOS MANTTO AlertaPrl": "carlosgorospo@gmail.com",
  "DBC IMAGENKLIN AlertaPrl": "carlosgorospo@gmail.com",
  "DBC IMGSTOP GO OTROS AlertaPrl": "carlosgorospo@gmail.com"
};

// Configuración del cliente SMTP con credenciales de Outlook/Office 365
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true', // true para puerto 465, false para 587 (STARTTLS)
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

// Función auxiliar: detecta destinatarios según el nombre del archivo
function pickRecipientsByFilename(filename) {
  for (const tipo of Object.keys(DESTINATARIOS)) {
    if (filename.includes(tipo)) return DESTINATARIOS[tipo];
  }
  return null; // Si no hay coincidencia
}

// Middleware para validar la API Key en la cabecera X-API-Key
function checkApiKey(req, res, next) {
  const key = req.header('X-API-Key');
  if (!key || key !== process.env.API_KEY) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' }); // Acceso denegado
  }
  next(); // Si la clave es válida, pasa al siguiente middleware/controlador
}

// Ruta principal POST /alerta → recibe archivo y lo reenvía por email
app.post('/alerta', checkApiKey, upload.single('file'), async (req, res) => {
  // Validación: debe llegar un archivo
  if (!req.file) return res.status(400).json({ ok: false, error: 'file is required' });

  try {
    // Nombre original del archivo subido
    const originalName = req.file.originalname || req.file.filename;

    // Asunto del correo: viene en el body o se usa el nombre del archivo
    const subject = req.body?.subject || path.parse(originalName).name;

    // Cuerpo del correo: se usa uno genérico si no viene en el body
    const body = req.body?.body || `Hola,

Esto es una automatización de TSI.

Se adjunta el documento indicado en Asunto.

Un saludo.`;

    // Determinar destinatarios: si vienen en el body se usan, si no, se intentan deducir del nombre del archivo
    let recipients = (req.body?.recipients || '').trim();
    if (!recipients) {
      const auto = pickRecipientsByFilename(originalName);
      if (!auto) {
        // Si no se encuentran destinatarios, borrar el archivo temporal y devolver error
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({ ok: false, error: 'No recipients matched by filename and none provided' });
      }
      recipients = auto;
    }

    // Convertir lista de emails a array
    const toList = recipients.split(/[;,]/).map(s => s.trim()).filter(Boolean);

    // Configurar remitente
    const fromName = process.env.FROM_NAME || 'Automatizacion TSI';
    const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_USER;

    // Enviar correo con nodemailer
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: toList,
      subject,
      text: body,
      attachments: [{ filename: originalName, path: req.file.path }] // Se adjunta el archivo
    });

    // Eliminar archivo temporal después de enviar
    fs.unlink(req.file.path, () => {});

    // Responder OK al cliente
    res.json({ ok: true, sent: { subject, to: toList, filename: originalName } });
  } catch (err) {
    // En caso de error, borrar archivo temporal si existe
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

// Ruta GET / → simple “ping” de salud del servicio
app.get('/', (_req, res) => 
  res.json({ ok: true, service: 'webhook-alertas', uptime: process.uptime() })
);

// Arrancar el servidor en el puerto definido en .env o 3000
const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Webhook escuchando en puerto ${port}`));
