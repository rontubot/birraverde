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

const createTransporter = () => {
  // Using 'service: gmail' is often the most reliable way as it handles defaults
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
  const publicBookings = bookings.map(b => ({ date: b.date, time: b.time }));
  res.json(publicBookings);
});

app.post('/api/booking', async (req, res) => {
  try {
    const { name, email, duration, date, time, notes } = req.body;

    if (!name || !email || !duration || !date || !time) {
      return res.status(400).json({ error: 'Faltan campos obligatorios.' });
    }

    const isOccupied = bookings.some(b => b.date === date && b.time === time);
    if (isOccupied) {
      return res.status(409).json({ error: 'El horario ya está ocupado.' });
    }

    // 1. SAVE THE BOOKING FIRST (to mark it on the calendar for everyone)
    bookings.push({ name, email, duration, date, time, notes, createdAt: new Date() });
    saveBookings();

    // 2. Respond to the client IMMEDIATELY so they don't get stuck
    res.json({ success: true, message: 'Reserva registrada en el calendario.' });

    // 3. TRY to send emails in the background
    // We do this in a separate async block so it doesn't block the HTTP response
    (async () => {
      try {
        const transporter = createTransporter();
        const [year, month, day] = date.split('-');
        const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        const formattedDate = `${parseInt(day)} de ${months[parseInt(month) - 1]} ${year}`;

        const userMailOptions = {
          from: `"Birraverde Studio" <${process.env.GMAIL_USER}>`,
          to: email,
          subject: '✅ Reserva Confirmada — Birraverde Studio',
          html: `
            <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #ffffff; border-radius: 16px; overflow: hidden;">
              <div style="background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%); padding: 40px 30px; text-align: center; border-bottom: 2px solid #00ff41;">
                <h1 style="color: #00ff41; font-size: 28px; margin: 0; letter-spacing: 3px; text-transform: uppercase;">BIRRAVERDE</h1>
                <p style="color: #888; margin-top: 8px; font-size: 12px; letter-spacing: 2px;">STUDIO</p>
              </div>
              <div style="padding: 40px 30px;">
                <h2 style="color: #ffffff; font-size: 22px; margin: 0 0 10px 0;">¡Reserva Confirmada!</h2>
                <p style="color: #a0a0a0; font-size: 15px; line-height: 1.6; margin-bottom: 30px;">Hola <strong style="color: #fff;">${name}</strong>, tu sesión ha sido agendada exitosamente.</p>
                <div style="background: #111; border: 1px solid #222; border-radius: 12px; padding: 25px;">
                  <p>📅 <strong>Fecha:</strong> ${formattedDate}</p>
                  <p>🕐 <strong>Hora:</strong> ${time}</p>
                  <p>⏱️ <strong>Duración:</strong> ${duration} hora(s)</p>
                </div>
              </div>
            </div>`
        };

        const adminMailOptions = {
          from: `"Birraverde Booking" <${process.env.GMAIL_USER}>`,
          to: process.env.GMAIL_USER,
          subject: `🔔 Nueva Reserva: ${name}`,
          html: `<p>Nueva reserva de <strong>${name}</strong> (${email}) para el ${formattedDate} a las ${time}.</p>`
        };

        await transporter.sendMail(userMailOptions);
        await transporter.sendMail(adminMailOptions);
        console.log('✅ Emails sent successfully for:', name);
      } catch (mailError) {
        console.error('❌ Background Email Error:', mailError.message);
        // We don't crash here because the response was already sent
      }
    })();

  } catch (error) {
    console.error('Error processing booking:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
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
  console.log(`🟢 Birraverde server running on port ${PORT}`);
});
