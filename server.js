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
          subject: 'Confirmación de Reserva - Birraverde Studio',
          text: `Hola ${name}, confirmamos tu reserva para el ${formattedDate} a las ${time}. Birraverde Studio.`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #111; line-height: 1.6;">
              <div style="padding: 20px 0; border-bottom: 1px solid #eee; margin-bottom: 30px;">
                <span style="font-size: 20px; font-weight: bold; letter-spacing: 1px;">BIRRAVERDE STUDIO</span>
              </div>
              
              <h2 style="font-size: 22px; font-weight: 700; margin-bottom: 20px;">Tu reserva está confirmada</h2>
              
              <p>Hola ${name},</p>
              <p>Este correo confirma que hemos reservado con éxito tu sesión en nuestro estudio. A continuación, los detalles de tu cita:</p>
              
              <div style="background-color: #f8f8f8; border-radius: 8px; padding: 25px; margin: 30px 0; border: 1px solid #eee;">
                <table style="width: 100%;">
                  <tr>
                    <td style="color: #666; font-size: 14px; padding-bottom: 8px;">FECHA</td>
                    <td style="font-weight: 600; text-align: right; padding-bottom: 8px;">${formattedDate}</td>
                  </tr>
                  <tr>
                    <td style="color: #666; font-size: 14px; padding-bottom: 8px;">HORA DE INICIO</td>
                    <td style="font-weight: 600; text-align: right; padding-bottom: 8px;">${time}</td>
                  </tr>
                  <tr>
                    <td style="color: #666; font-size: 14px;">DURACIÓN</td>
                    <td style="font-weight: 600; text-align: right;">${duration} hora(s)</td>
                  </tr>
                </table>
              </div>
              
              <p style="font-size: 14px;">Si necesitas cancelar o modificar tu reserva, por favor contáctanos respondiendo a este mismo correo o escribiéndonos a <strong>birraverdefilms@gmail.com</strong>.</p>
              
              <div style="margin-top: 50px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #888;">
                <p style="margin: 0;">Recibes este correo porque realizaste una reserva en <a href="https://birraverde.up.railway.app" style="color: #00ff41; text-decoration: none;">birraverde.up.railway.app</a></p>
                <p style="margin: 5px 0;">Birraverde Studio | Buenos Aires, Argentina</p>
              </div>
            </div>`
        };

        const adminMailOptions = {
          subject: `Nueva Reserva Web: ${name}`,
          text: `Nueva reserva recibida de ${name} (${email}) para el ${formattedDate} a las ${time}.`,
          html: `
            <div style="font-family: sans-serif; max-width: 500px; border: 1px solid #eee; padding: 20px; color: #333;">
              <h2 style="color: #000; border-bottom: 2px solid #00ff41; padding-bottom: 10px;">Nueva Reserva</h2>
              <p>Se ha registrado una nueva reserva a través de la web:</p>
              <ul style="list-style: none; padding: 0;">
                <li><strong>Cliente:</strong> ${name}</li>
                <li><strong>Email:</strong> ${email}</li>
                <li><strong>Fecha:</strong> ${formattedDate}</li>
                <li><strong>Hora:</strong> ${time}</li>
                <li><strong>Duración:</strong> ${duration} hora(s)</li>
                <li><strong>Notas:</strong> ${notes || 'Ninguna'}</li>
              </ul>
              <div style="margin-top: 20px; font-size: 12px; color: #999;">
                Enviado desde el sistema de reservas de Birraverde Studio.
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
