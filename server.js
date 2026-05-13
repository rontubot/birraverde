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
    const { name, email, duration, date, time, notes } = req.body;
    console.log('📩 Petición de reserva recibida para:', name, '(', email, ')');

    if (!name || !email || !duration || !date || !time) {
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
          subject: '✅ Confirmación de tu reserva en Birraverde Studio',
          text: `Hola ${name}, tu reserva ha sido confirmada para el día ${formattedDate} a las ${time} por una duración de ${duration} hora(s). ¡Te esperamos!`,
          html: `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; color: #1a1a1a; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
              <div style="background-color: #000000; padding: 30px; text-align: center;">
                <h1 style="color: #00ff41; margin: 0; letter-spacing: 2px; font-size: 24px;">BIRRAVERDE</h1>
                <p style="color: #ffffff; margin-top: 5px; font-size: 12px; text-transform: uppercase;">Creative Production Studio</p>
              </div>
              <div style="padding: 40px 30px;">
                <h2 style="font-weight: 600; color: #1a1a1a; margin-top: 0;">¡Hola, ${name}!</h2>
                <p style="font-size: 16px; line-height: 1.6; color: #444;">Tu sesión en nuestro estudio ha sido agendada con éxito. Aquí tienes los detalles:</p>
                <div style="background-color: #f9f9f9; padding: 25px; border-radius: 6px; border-left: 4px solid #00ff41; margin: 25px 0;">
                  <p style="margin: 0 0 10px 0;">📅 <strong>Fecha:</strong> ${formattedDate}</p>
                  <p style="margin: 0 0 10px 0;">🕐 <strong>Hora de inicio:</strong> ${time}</p>
                  <p style="margin: 0;">⏱️ <strong>Duración:</strong> ${duration} hora(s)</p>
                </div>
                <p style="font-size: 15px; line-height: 1.6; color: #444;">Recuerda presentarte 10 minutos antes de tu cita. Si necesitas reprogramar, por favor contáctanos con antelación.</p>
                <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eeeeee; text-align: center;">
                  <p style="font-size: 12px; color: #999;">Este es un correo automático de confirmación para tu reserva en Birraverde Studio.</p>
                  <p style="font-size: 12px; color: #999;">&copy; 2024 Birraverde Studio. Todos los derechos reservados.</p>
                </div>
              </div>
            </div>`
        };

        const adminMailOptions = {
          subject: `🔔 Nueva Reserva: ${name}`,
          text: `Nueva reserva recibida:\nCliente: ${name}\nEmail: ${email}\nFecha: ${formattedDate}\nHora: ${time}\nDuración: ${duration} hora(s)\nNotas: ${notes || 'Ninguna'}`,
          html: `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
              <h3 style="color: #333;">Nueva reserva recibida:</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Cliente:</strong></td><td>${name}</td></tr>
                <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Email:</strong></td><td>${email}</td></tr>
                <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Fecha:</strong></td><td>${formattedDate}</td></tr>
                <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Hora:</strong></td><td>${time}</td></tr>
                <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Duración:</strong></td><td>${duration} hora(s)</td></tr>
                <tr><td style="padding: 8px 0;"><strong>Notas:</strong></td><td>${notes || 'Ninguna'}</td></tr>
              </table>
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
