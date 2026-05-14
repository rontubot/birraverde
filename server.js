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

const timeToMinutes = (timeStr) => {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

const overlaps = (start1, duration1, start2, duration2) => {
  const s1 = timeToMinutes(start1);
  const e1 = s1 + (Number(duration1) * 60);
  const s2 = timeToMinutes(start2);
  const e2 = s2 + (Number(duration2) * 60);
  return Math.max(s1, s2) < Math.min(e1, e2);
};

app.get('/api/bookings', (req, res) => {
  res.json(bookings.map(b => ({ date: b.date, time: b.time, duration: b.duration })));
});

app.post('/api/booking', async (req, res) => {
  try {
    const { name, email, phone, people, duration, date, time, notes } = req.body;
    
    if (!name || !email || !phone || !duration || !date || !time) {
      return res.status(400).json({ error: 'Faltan campos obligatorios.' });
    }

    const isOccupied = bookings.some(b => 
      b.date === date && overlaps(b.time, b.duration, time, duration)
    );

    if (isOccupied) {
      return res.status(409).json({ error: 'Parte del horario seleccionado ya está ocupado.' });
    }

    bookings.push({ name, email, duration, date, time, notes, createdAt: new Date() });
    saveBookings();

    res.json({ success: true, message: 'Reserva registrada.' });

    (async () => {
      try {
        const [year, month, day] = date.split('-');
        const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        const formattedDate = `${parseInt(day)} de ${months[parseInt(month) - 1]} ${year}`;

        // DISEÑO BASE PARA AMBOS CORREOS
        const createHtml = (userName, detailsHtml) => `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #000; color: #fff; border-radius: 12px; overflow: hidden; border: 1px solid #222;">
            <div style="padding: 30px; text-align: center; border-bottom: 2px solid #00ff41;">
              <h1 style="color: #00ff41; margin: 0; letter-spacing: 4px; font-size: 24px;">BIRRAVERDE</h1>
            </div>
            <div style="padding: 30px;">
              <h2 style="font-weight: 300;">Hola, ${userName}</h2>
              ${detailsHtml}
              <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #222; text-align: center; font-size: 10px; color: #555;">
                Birraverde Studio | Buenos Aires
              </div>
            </div>
          </div>`;

        const userDetails = `
          <p style="color: #ccc;">Tu reserva ha sido confirmada:</p>
          <div style="background: #111; padding: 20px; border-radius: 8px; border: 1px solid #333;">
            <p style="margin: 5px 0;">Fecha: <strong>${formattedDate}</strong></p>
            <p style="margin: 5px 0;">Hora: <strong>${time}</strong></p>
            <p style="margin: 5px 0;">Duracion: <strong>${duration} hora(s)</strong></p>
          </div>`;

        const adminDetails = `
          <p style="color: #00ff41;">¡Nueva reserva recibida!</p>
          <div style="background: #111; padding: 20px; border-radius: 8px; border: 1px solid #333;">
            <p style="margin: 5px 0;">Cliente: <strong>${name}</strong></p>
            <p style="margin: 5px 0;">Email: <strong>${email}</strong></p>
            <p style="margin: 5px 0;">Telefono: <strong>${phone}</strong></p>
            <p style="margin: 5px 0;">Personas: <strong>${people}</strong></p>
            <p style="margin: 5px 0;">Fecha: <strong>${formattedDate}</strong></p>
            <p style="margin: 5px 0;">Hora: <strong>${time}</strong></p>
            <p style="margin: 5px 0;">Notas: ${notes || 'Ninguna'}</p>
          </div>`;

        const scriptURL = 'https://script.google.com/macros/s/AKfycbzOiS6qNNUCsUOlFdPWkOhndnIyWMb7izoVvUJScw-U-1QX0irbPnUxhSultjyfZvWu/exec';
        
        await fetch(scriptURL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            token: "BIRRAVERDE_2024_SECURE",
            name, email, phone, people, duration, date, time, notes,
            subject: 'Reserva Confirmada - Birraverde Studio',
            html: createHtml(name, userDetails),
            htmlAdmin: createHtml('Administrador', adminDetails),
            textAdmin: `Nueva reserva de ${name} para el ${formattedDate}`
          })
        });
      } catch (err) {
        console.error('Error en proceso de email:', err);
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
