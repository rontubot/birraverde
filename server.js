import express from 'express';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_FILE = join(__dirname, 'bookings.json');
let bookings = [];

if (fs.existsSync(DATA_FILE)) {
  try {
    bookings = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    console.error('Error reading bookings file:', e);
  }
}

const saveBookings = () => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(bookings, null, 2));
  } catch (e) {
    console.error('Error saving bookings file:', e);
  }
};

app.use(express.json());
app.use(express.static(join(__dirname, 'dist')));

// Helper to convert "HH:mm" to minutes from midnight
const timeToMinutes = (timeStr) => {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

// Helper to check if two time ranges overlap
const overlaps = (start1, duration1, start2, duration2) => {
  const s1 = timeToMinutes(start1);
  const e1 = s1 + (Number(duration1) * 60);
  const s2 = timeToMinutes(start2);
  const e2 = s2 + (Number(duration2) * 60);
  return Math.max(s1, s2) < Math.min(e1, e2);
};

const createTransporter = () => {
  // If we have a SendGrid API Key, use that (more reliable on Railway)
  if (process.env.SENDGRID_API_KEY) {
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false, // Use STARTTLS
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY
      }
    });
  }
  // Fallback to Gmail
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    }
  });
};

// ─── Booking API ──────────────────────────────────────────────

app.get('/api/bookings', (req, res) => {
  // Return all bookings with duration so frontend can calculate occupancy
  res.json(bookings.map(b => ({ date: b.date, time: b.time, duration: b.duration })));
});

app.post('/api/booking', async (req, res) => {
  try {
    const { name, email, phone, people, type, duration, date, time, notes } = req.body;
    console.log('📩 Petición de reserva recibida para:', name, '(', email, ')');

    if (!name || !email || !phone || !duration || !date || !time) {
      return res.status(400).json({ error: 'Faltan campos obligatorios.' });
    }

    // Check if any existing booking on that date overlaps with the new range
    const isOccupied = bookings.some(b => 
      b.date === date && overlaps(b.time, b.duration, time, duration)
    );

    if (isOccupied) {
      return res.status(409).json({ error: 'Parte del horario seleccionado ya está ocupado.' });
    }

    // 1. SAVE THE BOOKING
    bookings.push({ name, email, duration, date, time, notes, createdAt: new Date() });
    saveBookings();

    res.json({ success: true, message: 'Reserva registrada.' });

    // 2. BACKGROUND EMAILS
    (async () => {
      console.log('🚀 Iniciando proceso de envío de email...');
      try {
        const transporter = createTransporter();
        const [year, month, day] = date.split('-');
        const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        const formattedDate = `${parseInt(day)} de ${months[parseInt(month) - 1]} ${year}`;

        const userMailOptions = {
          subject: '✅ Reserva Confirmada - Birraverde Studio',
          text: `Hola ${name}, tu reserva ha sido confirmada para el día ${formattedDate} a las ${time} por una duración de ${duration} hora(s). ¡Te esperamos!`,
          html: `
            <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #000000; color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #222;">
              <div style="padding: 40px 30px; text-align: center; border-bottom: 2px solid #00ff41;">
                <h1 style="color: #00ff41; margin: 0; letter-spacing: 4px; font-size: 28px; font-weight: 900;">BIRRAVERDE</h1>
                <p style="color: #666; margin-top: 5px; font-size: 10px; text-transform: uppercase; letter-spacing: 2px;">Creative Production Studio</p>
              </div>
              <div style="padding: 40px 30px;">
                <h2 style="color: #ffffff; font-weight: 300;">¡Hola, ${name}!</h2>
                <p style="color: #ccc; font-size: 16px; line-height: 1.6;">Tu reserva ha sido confirmada con éxito. Te esperamos en el estudio:</p>
                
                <div style="background-color: #111; padding: 25px; border-radius: 8px; border: 1px solid #222; margin: 30px 0;">
                  <p style="margin: 0 0 15px 0; color: #888; font-size: 12px; text-transform: uppercase;">Detalles de la sesión</p>
                  <p style="margin: 0 0 10px 0; font-size: 18px;">📅 <strong>${formattedDate}</strong></p>
                  <p style="margin: 0 0 10px 0; font-size: 18px;">🕐 <strong>${time}</strong></p>
                  <p style="margin: 0; font-size: 18px;">⏱️ <strong>${duration} hora(s)</strong></p>
                </div>
                
                <p style="color: #666; font-size: 13px;">Si necesitas cancelar o modificar tu reserva, responde a este correo o escríbenos a birraverdefilms@gmail.com</p>
                
                <div style="margin-top: 50px; padding-top: 20px; border-top: 1px solid #222; text-align: center; font-size: 11px; color: #444;">
                  <p style="margin: 0;">Birraverde Studio | Buenos Aires, Argentina</p>
                  <p style="margin: 5px 0;">Estás recibiendo este correo por una reserva en birraverde.up.railway.app</p>
                </div>
              </div>
            </div>`
        };

        const adminMailOptions = {
          subject: `🔔 Nueva Reserva: ${name}`,
          text: `Nueva reserva recibida de ${name} (${email}) - Tel: ${phone} - Personas: ${people} para el ${formattedDate} a las ${time}.`,
          html: `
            <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #000000; color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #222;">
              <div style="padding: 25px; text-align: center; border-bottom: 2px solid #00ff41; background-color: #0a0a0a;">
                <h1 style="color: #ffffff; margin: 0; font-size: 16px; letter-spacing: 2px;">NUEVA RESERVA WEB</h1>
              </div>
              <div style="padding: 30px;">
                <table style="width: 100%; border-collapse: collapse; color: #ccc; font-size: 15px;">
                  <tr><td style="padding: 10px 0; border-bottom: 1px solid #111; color: #666;">Cliente:</td><td style="padding: 10px 0; border-bottom: 1px solid #111; color: #fff;">${name}</td></tr>
                  <tr><td style="padding: 10px 0; border-bottom: 1px solid #111; color: #666;">Email:</td><td style="padding: 10px 0; border-bottom: 1px solid #111;"><a href="mailto:${email}" style="color: #00ff41; text-decoration: none;">${email}</a></td></tr>
                  <tr><td style="padding: 10px 0; border-bottom: 1px solid #111; color: #666;">Teléfono:</td><td style="padding: 10px 0; border-bottom: 1px solid #111; color: #fff;">${phone}</td></tr>
                  <tr><td style="padding: 10px 0; border-bottom: 1px solid #111; color: #666;">Personas:</td><td style="padding: 10px 0; border-bottom: 1px solid #111; color: #fff;">${people}</td></tr>
                  <tr><td style="padding: 10px 0; border-bottom: 1px solid #111; color: #666;">Sesión:</td><td style="padding: 10px 0; border-bottom: 1px solid #111; color: #fff;">${type}</td></tr>
                  <tr><td style="padding: 10px 0; border-bottom: 1px solid #111; color: #666;">Fecha:</td><td style="padding: 10px 0; border-bottom: 1px solid #111; color: #fff;">${formattedDate}</td></tr>
                  <tr><td style="padding: 10px 0; border-bottom: 1px solid #111; color: #666;">Horario:</td><td style="padding: 10px 0; border-bottom: 1px solid #111; color: #fff;">${time} (${duration}h)</td></tr>
                  <tr><td style="padding: 10px 0; color: #666; vertical-align: top;">Notas:</td><td style="padding: 10px 0; font-style: italic;">${notes || 'Sin notas'}</td></tr>
                </table>
                <div style="margin-top: 30px; text-align: center;">
                  <a href="https://birraverde.up.railway.app" style="color: #00ff41; font-size: 12px; text-decoration: none; border: 1px solid #333; padding: 8px 15px; border-radius: 4px;">Abrir Panel Web</a>
                </div>
              </div>
            </div>`
        };

        // 3. SEND VIA SENDGRID API (Avoids SMTP Port Blocks)
        const sendEmail = async (to, subject, text, html) => {
          const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: to }] }],
              from: { 
                email: process.env.GMAIL_USER || 'birraverdefilms@gmail.com',
                name: 'Birraverde Studio'
              },
              reply_to: { email: 'birraverdefilms@gmail.com', name: 'Birraverde Support' },
              subject: subject,
              content: [
                { type: 'text/plain', value: text },
                { type: 'text/html', value: html }
              ]
            })
          });
          if (!response.ok) {
            const error = await response.json();
            throw new Error(JSON.stringify(error));
          }
        };

        await sendEmail(email, userMailOptions.subject, userMailOptions.text, userMailOptions.html);
        await sendEmail('birraverdefilms@gmail.com', adminMailOptions.subject, adminMailOptions.text, adminMailOptions.html);
        
        console.log('✅ Emails enviados correctamente vía API para:', name);
      } catch (err) {
        console.error('❌ ERROR EN LA API DE SENDGRID:', err);
      }
    })();

  } catch (error) {
    console.error('Error:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Error del servidor.' });
  }
});

app.use((req, res) => {
  const requestedPath = req.path.endsWith('/') ? req.path + 'index.html' : req.path;
  const filePath = join(__dirname, 'dist', requestedPath);
  res.sendFile(filePath, (err) => {
    if (err) res.sendFile(join(__dirname, 'dist', 'index.html'));
  });
});

app.listen(PORT, () => {
  console.log(`🟢 Server on port ${PORT}`);
});
