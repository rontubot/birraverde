import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = 'birraverde_super_secret_jwt_2026';

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

const USERS_FILE = join(__dirname, 'users.json');
let users = [];

if (fs.existsSync(USERS_FILE)) {
  try {
    users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) {
    console.error('Error reading users file:', e);
  }
}

const saveUsers = () => {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (e) {
    console.error('Error saving users file:', e);
  }
};

// Asegurar Super Usuario por defecto
const ensureAdminUser = () => {
  const adminEmail = 'birraverdefilms@gmail.com';
  const adminExists = users.some(u => u.email === adminEmail);
  if (!adminExists) {
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync('AdminBirra2026!', salt);
    users.push({
      id: 'admin-superuser',
      name: 'Super Usuario Admin',
      email: adminEmail,
      password: passwordHash,
      role: 'admin',
      createdAt: new Date()
    });
    saveUsers();
    console.log('🔴 Default Admin created: birraverdefilms@gmail.com / AdminBirra2026!');
  }
};
ensureAdminUser();

// Middlewares de autenticación y autorización
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decodedUser) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido o expirado.' });
    }
    const user = users.find(u => u.id === decodedUser.id);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    req.user = user;
    next();
  });
};

const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'No tienes permisos para realizar esta acción.' });
    }
    next();
  };
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

    // Opcionalmente asociar userId si hay token
    let userId = null;
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.id;
      } catch (e) {
        // Ignorar token no válido
      }
    }

    const newBooking = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 5),
      userId,
      name,
      email,
      phone,
      people,
      duration,
      date,
      time,
      notes,
      createdAt: new Date()
    };

    bookings.push(newBooking);
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

// --- RUTAS DE AUTENTICACIÓN ---

app.post('/api/auth/register', (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Faltan campos obligatorios.' });
    }
    
    const emailLower = email.trim().toLowerCase();
    const userExists = users.some(u => u.email === emailLower);
    if (userExists) {
      return res.status(409).json({ error: 'El correo electrónico ya está registrado.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    const newUser = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 5),
      name: name.trim(),
      email: emailLower,
      password: passwordHash,
      role: 'client',
      createdAt: new Date()
    };

    users.push(newUser);
    saveUsers();

    res.json({ success: true, message: 'Usuario registrado con éxito.' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Correo y contraseña obligatorios.' });
    }

    const emailLower = email.trim().toLowerCase();
    const user = users.find(u => u.email === emailLower);
    if (!user) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }

    const isPasswordValid = bcrypt.compareSync(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role
    }
  });
});

// --- RUTAS DE ADMINISTRACIÓN ---

app.get('/api/admin/bookings', authenticateToken, requireRole(['admin', 'worker']), (req, res) => {
  res.json(bookings);
});

app.delete('/api/admin/bookings/:id', authenticateToken, requireRole(['admin']), (req, res) => {
  const bookingId = req.params.id;
  const index = bookings.findIndex(b => b.id === bookingId);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Reserva no encontrada.' });
  }

  bookings.splice(index, 1);
  saveBookings();
  res.json({ success: true, message: 'Reserva eliminada con éxito.' });
});

app.get('/api/admin/users', authenticateToken, requireRole(['admin']), (req, res) => {
  const sanitizedUsers = users.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role
  }));
  res.json(sanitizedUsers);
});

app.post('/api/admin/users/role', authenticateToken, requireRole(['admin']), (req, res) => {
  const { userId, role } = req.body;
  if (!userId || !role) {
    return res.status(400).json({ error: 'Faltan campos obligatorios.' });
  }

  const allowedRoles = ['client', 'worker', 'admin'];
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ error: 'Rol no permitido.' });
  }

  const user = users.find(u => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado.' });
  }

  if (user.email === 'birraverdefilms@gmail.com') {
    return res.status(403).json({ error: 'No se puede modificar el rol del Super Usuario.' });
  }

  user.role = role;
  saveUsers();
  res.json({ success: true, message: 'Rol de usuario actualizado con éxito.' });
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
