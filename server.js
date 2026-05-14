import express from 'express';
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
          text: `Nueva reserva recibida de ${name} (${email}) - Tel: ${phone} - Personas: ${people} para el ${formattedDate} a las ${time}.`
        };

        // 3. ENVIAR VIA GOOGLE APPS SCRIPT (Calendario + Gmail)
        const scriptURL = 'https://script.google.com/macros/s/AKfycbzOiS6qNNUCsUOlFdPWkOhndnIyWMb7izoVvUJScw-U-1QX0irbPnUxhSultjyfZvWu/exec';
        
        const response = await fetch(scriptURL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            token: "BIRRAVERDE_2024_SECURE",
            name,
            email,
            phone,
            people,
            type,
            duration,
            date,
            time,
            notes,
            subject: userMailOptions.subject,
            html: userMailOptions.html,
            textAdmin: adminMailOptions.text
          })
        });

        const resultText = await response.text();
        if (resultText === 'OK') {
          console.log('✅ Emails y Calendario procesados correctamente por Google Apps Script para:', name);
        } else {
          throw new Error(resultText);
        }
      } catch (err) {
        console.error('❌ ERROR EN GOOGLE APPS SCRIPT:', err);
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
