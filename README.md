# webhook-alertas

Webhook en Node que recibe un archivo (multipart/form-data) y lo reenvía por email usando SMTP (Outlook/365).

## Variables de entorno
Ver `.env.example`.

## Ejecutar en local
```bash
cp .env.example .env   # Rellena valores reales
npm run dev            # o npm start
