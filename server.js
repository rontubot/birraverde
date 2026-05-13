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
      port: 465,
      secure: true,
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
          from: `"Birraverde Studio" <${process.env.GMAIL_USER || 'birraverdefilms@gmail.com'}>`,
          to: email,
          subject: '✅ Reserva Confirmada — Birraverde Studio',
          html: `
            <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #222;">
              <div style="background: #000; padding: 40px 30px; text-align: center; border-bottom: 2px solid #00ff41;">
                <h1 style="color: #00ff41; margin: 0;">BIRRAVERDE</h1>
              </div>
              <div style="padding: 40px 30px;">
                <h2 style="color: #ffffff;">¡Reserva Confirmada!</h2>
                <p>Hola <strong>${name}</strong>, tu sesión ha sido agendada:</p>
                <div style="background: #111; padding: 20px; border-radius: 12px; border: 1px solid #222;">
                  <p>📅 <strong>Fecha:</strong> ${formattedDate}</p>
                  <p>🕐 <strong>Inicio:</strong> ${time}</p>
                  <p>⏱️ <strong>Duración:</strong> ${duration} hora(s)</p>
                </div>
                <p style="color: #888; font-size: 12px; margin-top: 20px;">Si necesitas cancelar, contactanos a birraverdefilms@gmail.com</p>
              </div>
            </div>`
        };

        const adminMailOptions = {
          from: `"Birraverde Booking" <${process.env.GMAIL_USER || 'birraverdefilms@gmail.com'}>`,
          to: 'birraverdefilms@gmail.com',
          subject: `🔔 Nueva Reserva: ${name}`,
          html: `
            <h3>Nueva reserva recibida:</h3>
            <ul>
              <li><strong>Cliente:</strong> ${name}</li>
              <li><strong>Email:</strong> ${email}</li>
              <li><strong>Fecha:</strong> ${formattedDate}</li>
              <li><strong>Hora:</strong> ${time}</li>
              <li><strong>Duración:</strong> ${duration} hora(s)</li>
              <li><strong>Notas:</strong> ${notes || 'Ninguna'}</li>
            </ul>`
        };

        await transporter.sendMail(userMailOptions);
        await transporter.sendMail(adminMailOptions);
        console.log('✅ Emails enviados correctamente para:', name);
      } catch (err) {
        console.error('❌ ERROR CRÍTICO EN SENDGRID:', err);
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
