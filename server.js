import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import multer from 'multer';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = 'birraverde_super_secret_jwt_2026';

// Configurar almacenamiento estático para /uploads y el middleware multer
const UPLOADS_DIR = join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

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

const MEETINGS_FILE = join(__dirname, 'reuniones.json');
let meetings = [];

if (fs.existsSync(MEETINGS_FILE)) {
  try {
    meetings = JSON.parse(fs.readFileSync(MEETINGS_FILE, 'utf8'));
  } catch (e) {
    console.error('Error reading meetings file:', e);
  }
}

const saveMeetings = () => {
  try {
    fs.writeFileSync(MEETINGS_FILE, JSON.stringify(meetings, null, 2));
  } catch (e) {
    console.error('Error saving meetings file:', e);
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

// --- CONFIGURACIÓN DE POSTGRESQL ---
const isPostgres = !!process.env.DATABASE_URL;
let pgPool = null;

if (isPostgres) {
  pgPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
}

const initDatabase = async () => {
  if (!isPostgres) {
    // Asegurar Super Usuario por defecto en JSON si no se usa Postgres
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
      console.log('🔴 Default Admin created (JSON): birraverdefilms@gmail.com / AdminBirra2026!');
    }
    return;
  }
  
  try {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(100) UNIQUE,
        password VARCHAR(255),
        role VARCHAR(50),
        "resetPasswordToken" VARCHAR(255),
        "resetPasswordExpires" BIGINT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id VARCHAR(100) PRIMARY KEY,
        "userId" VARCHAR(100),
        name VARCHAR(100),
        email VARCHAR(100),
        phone VARCHAR(100),
        people INTEGER,
        duration INTEGER,
        date VARCHAR(50),
        time VARCHAR(20),
        notes TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS meetings (
        id VARCHAR(100) PRIMARY KEY,
        "hostId" VARCHAR(100),
        "hostName" VARCHAR(100),
        "hostEmail" VARCHAR(100),
        subject VARCHAR(255),
        duration INTEGER,
        date VARCHAR(50),
        time VARCHAR(20),
        notes TEXT,
        "invitedUsers" JSONB,
        files JSONB,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ PostgreSQL tables checked/created.');

    const adminEmail = 'birraverdefilms@gmail.com';
    const res = await pgPool.query('SELECT * FROM users WHERE email = $1', [adminEmail]);
    if (res.rowCount === 0) {
      const salt = bcrypt.genSaltSync(10);
      const passwordHash = bcrypt.hashSync('AdminBirra2026!', salt);
      await pgPool.query(`
        INSERT INTO users (id, name, email, password, role, "createdAt")
        VALUES ($1, $2, $3, $4, $5, $6)
      `, ['admin-superuser', 'Super Usuario Admin', adminEmail, passwordHash, 'admin', new Date()]);
      console.log('🔴 Default Admin created in PostgreSQL: birraverdefilms@gmail.com / AdminBirra2026!');
    }
  } catch (err) {
    console.error('❌ Error initializing PostgreSQL database:', err);
  }
};
initDatabase();

// --- STORAGE LAYER HELPERS ---

const dbGetUsers = async () => {
  if (isPostgres) {
    const res = await pgPool.query('SELECT * FROM users');
    return res.rows;
  }
  return users;
};

const dbGetUserByEmail = async (email) => {
  const emailLower = email.trim().toLowerCase();
  if (isPostgres) {
    const res = await pgPool.query('SELECT * FROM users WHERE LOWER(email) = $1', [emailLower]);
    return res.rows[0] || null;
  }
  return users.find(u => u.email.toLowerCase() === emailLower) || null;
};

const dbGetUserById = async (id) => {
  if (isPostgres) {
    const res = await pgPool.query('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows[0] || null;
  }
  return users.find(u => u.id === id) || null;
};

const dbGetUserByToken = async (token) => {
  if (isPostgres) {
    const res = await pgPool.query('SELECT * FROM users WHERE "resetPasswordToken" = $1 AND "resetPasswordExpires" > $2', [token, Date.now()]);
    return res.rows[0] || null;
  }
  return users.find(u => u.resetPasswordToken === token && u.resetPasswordExpires && u.resetPasswordExpires > Date.now()) || null;
};

const dbCreateUser = async (user) => {
  if (isPostgres) {
    await pgPool.query(
      `INSERT INTO users (id, name, email, password, role, "createdAt") 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.id, user.name, user.email, user.password, user.role, user.createdAt || new Date()]
    );
  } else {
    users.push(user);
    saveUsers();
  }
  return user;
};

const dbUpdateUserRole = async (userId, role) => {
  if (isPostgres) {
    await pgPool.query('UPDATE users SET role = $1 WHERE id = $2', [role, userId]);
  } else {
    const user = users.find(u => u.id === userId);
    if (user) {
      user.role = role;
      saveUsers();
    }
  }
};

const dbUpdateUserToken = async (userId, token, expires) => {
  if (isPostgres) {
    await pgPool.query('UPDATE users SET "resetPasswordToken" = $1, "resetPasswordExpires" = $2 WHERE id = $3', [token, expires, userId]);
  } else {
    const user = users.find(u => u.id === userId);
    if (user) {
      user.resetPasswordToken = token;
      user.resetPasswordExpires = expires;
      saveUsers();
    }
  }
};

const dbResetUserPassword = async (userId, passwordHash) => {
  if (isPostgres) {
    await pgPool.query('UPDATE users SET password = $1, "resetPasswordToken" = NULL, "resetPasswordExpires" = NULL WHERE id = $2', [passwordHash, userId]);
  } else {
    const user = users.find(u => u.id === userId);
    if (user) {
      user.password = passwordHash;
      delete user.resetPasswordToken;
      delete user.resetPasswordExpires;
      saveUsers();
    }
  }
};

const dbGetBookings = async () => {
  if (isPostgres) {
    const res = await pgPool.query('SELECT * FROM bookings');
    return res.rows;
  }
  return bookings;
};

const dbCreateBooking = async (booking) => {
  if (isPostgres) {
    await pgPool.query(
      `INSERT INTO bookings (id, "userId", name, email, phone, people, duration, date, time, notes, "createdAt") 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [booking.id, booking.userId, booking.name, booking.email, booking.phone, Number(booking.people), Number(booking.duration), booking.date, booking.time, booking.notes, booking.createdAt || new Date()]
    );
  } else {
    bookings.push(booking);
    saveBookings();
  }
  return booking;
};

const dbDeleteBooking = async (id) => {
  if (isPostgres) {
    const res = await pgPool.query('DELETE FROM bookings WHERE id = $1', [id]);
    return res.rowCount > 0;
  } else {
    const index = bookings.findIndex(b => b.id === id);
    if (index === -1) return false;
    bookings.splice(index, 1);
    saveBookings();
    return true;
  }
};

const dbGetMeetings = async () => {
  if (isPostgres) {
    const res = await pgPool.query('SELECT * FROM meetings');
    return res.rows.map(row => ({
      ...row,
      invitedUsers: typeof row.invitedUsers === 'string' ? JSON.parse(row.invitedUsers) : row.invitedUsers,
      files: typeof row.files === 'string' ? JSON.parse(row.files) : row.files
    }));
  }
  return meetings;
};

const dbCreateMeeting = async (meeting) => {
  if (isPostgres) {
    await pgPool.query(
      `INSERT INTO meetings (id, "hostId", "hostName", "hostEmail", subject, duration, date, time, notes, "invitedUsers", files, "createdAt") 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        meeting.id, 
        meeting.hostId, 
        meeting.hostName, 
        meeting.hostEmail, 
        meeting.subject, 
        Number(meeting.duration), 
        meeting.date, 
        meeting.time, 
        meeting.notes, 
        JSON.stringify(meeting.invitedUsers), 
        JSON.stringify(meeting.files), 
        meeting.createdAt || new Date()
      ]
    );
  } else {
    meetings.push(meeting);
    saveMeetings();
  }
  return meeting;
};

const dbDeleteMeeting = async (id) => {
  if (isPostgres) {
    const res = await pgPool.query('DELETE FROM meetings WHERE id = $1 RETURNING files', [id]);
    return { success: res.rowCount > 0, meeting: res.rows[0] || null };
  } else {
    const index = meetings.findIndex(m => m.id === id);
    if (index === -1) return { success: false, meeting: null };
    const meeting = meetings[index];
    meetings.splice(index, 1);
    saveMeetings();
    return { success: true, meeting };
  }
};

// Middlewares de autenticación y autorización
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
  }

  jwt.verify(token, JWT_SECRET, async (err, decodedUser) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido o expirado.' });
    }
    try {
      const user = await dbGetUserById(decodedUser.id);
      if (!user) {
        return res.status(404).json({ error: 'Usuario no encontrado.' });
      }
      req.user = user;
      next();
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
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

app.use((req, res, next) => {
  console.log(`[REQUEST] ${new Date().toISOString()} - ${req.method} ${req.url}`);
  res.on('finish', () => {
    console.log(`[RESPONSE] ${req.method} ${req.url} - Status: ${res.statusCode}`);
  });
  next();
});

app.use(express.json());
app.use('/uploads', express.static(join(__dirname, 'uploads')));
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

app.get('/api/bookings', async (req, res) => {
  try {
    const allB = await dbGetBookings();
    const allM = await dbGetMeetings();
    const publicBookings = allB.map(b => ({ date: b.date, time: b.time, duration: b.duration }));
    const internalMeetings = allM.map(m => ({ date: m.date, time: m.time, duration: m.duration }));
    res.json([...publicBookings, ...internalMeetings]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor.' });
  }
});

app.post('/api/booking', async (req, res) => {
  try {
    const { name, email, phone, people, duration, date, time, notes } = req.body;
    
    if (!name || !email || !phone || !duration || !date || !time) {
      return res.status(400).json({ error: 'Faltan campos obligatorios.' });
    }

    const allB = await dbGetBookings();
    const allM = await dbGetMeetings();

    const isOccupied = allB.some(b => 
      b.date === date && overlaps(b.time, b.duration, time, duration)
    ) || allM.some(m => 
      m.date === date && overlaps(m.time, m.duration, time, duration)
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

    await dbCreateBooking(newBooking);

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

        const scriptURL = process.env.GOOGLE_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbzOiS6qNNUCsUOlFdPWkOhndnIyWMb7izoVvUJScw-U-1QX0irbPnUxhSultjyfZvWu/exec';
        
        console.log(`[EMAIL] Dispatching booking email to Google Apps Script for ${email}...`);
        const emailRes = await fetch(scriptURL, {
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
        const resText = await emailRes.text();
        console.log(`[EMAIL] Google Apps Script response status: ${emailRes.status}. Body: ${resText}`);
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

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'El correo electrónico es obligatorio.' });
    }

    const emailLower = email.trim().toLowerCase();
    const user = await dbGetUserByEmail(emailLower);
    
    // Por seguridad, no indicamos si el correo existe o no, pero solo lo enviamos si existe
    if (!user) {
      return res.json({ success: true, message: 'Si el correo está registrado, recibirás un enlace de recuperación pronto.' });
    }

    // Generar token seguro
    const token = crypto.randomBytes(20).toString('hex');
    const expires = Date.now() + 3600000; // 1 hora
    await dbUpdateUserToken(user.id, token, expires);

    // Enlace de restablecimiento
    const resetURL = `${req.protocol}://${req.get('host')}/reset-password.html?token=${token}`;
    
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #000; color: #fff; border-radius: 12px; overflow: hidden; border: 1px solid #222;">
        <div style="padding: 30px; text-align: center; border-bottom: 2px solid #00ff41;">
          <h1 style="color: #00ff41; margin: 0; letter-spacing: 4px; font-size: 24px;">BIRRAVERDE</h1>
        </div>
        <div style="padding: 30px;">
          <h2 style="font-weight: 300;">Hola, ${user.name}</h2>
          <p style="color: #ccc; line-height: 1.6;">Has solicitado restablecer tu contraseña para tu cuenta de Birraverde Studio.</p>
          <p style="color: #ccc; line-height: 1.6;">Haz clic en el siguiente botón para elegir una nueva contraseña. Este enlace expira en 1 hora.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetURL}" style="background-color: #00ff41; color: #000; padding: 12px 24px; border-radius: 100px; text-decoration: none; font-weight: bold; display: inline-block;">Restablecer Contraseña</a>
          </div>
          <p style="color: #555; font-size: 11px;">Si no solicitaste este cambio, por favor ignora este correo.</p>
          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #222; text-align: center; font-size: 10px; color: #555;">
            Birraverde Studio | Buenos Aires
          </div>
        </div>
      </div>`;

    const scriptURL = process.env.GOOGLE_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbzOiS6qNNUCsUOlFdPWkOhndnIyWMb7izoVvUJScw-U-1QX0irbPnUxhSultjyfZvWu/exec';
    
    console.log(`[EMAIL] Dispatching forgot-password email to Google Apps Script for ${user.email}...`);
    const emailRes = await fetch(scriptURL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        token: "BIRRAVERDE_2024_SECURE",
        name: user.name,
        email: user.email,
        phone: "Recuperación",
        people: "1",
        duration: "0",
        date: "2026-01-01",
        time: "00:00",
        notes: "Recuperación de contraseña",
        subject: 'Recuperar Contraseña - Birraverde Studio',
        html: emailHtml,
        htmlAdmin: 'Nueva solicitud de restablecimiento de contraseña para ' + user.email,
        textAdmin: 'Solicitud de contraseña.'
      })
    });
    const resText = await emailRes.text();
    console.log(`[EMAIL] Google Apps Script response status: ${emailRes.status}. Body: ${resText}`);

    res.json({ success: true, message: 'Si el correo está registrado, recibirás un enlace de recuperación pronto.' });
  } catch (e) {
    console.error('Error en recuperar contraseña:', e);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Token y contraseña son obligatorios.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    const user = await dbGetUserByToken(token);

    if (!user) {
      return res.status(400).json({ error: 'El enlace de recuperación es inválido o ha expirado.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    await dbResetUserPassword(user.id, passwordHash);

    res.json({ success: true, message: 'Contraseña restablecida con éxito.' });
  } catch (e) {
    console.error('Error al restablecer contraseña:', e);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Faltan campos obligatorios.' });
    }
    
    const emailLower = email.trim().toLowerCase();
    const userExists = await dbGetUserByEmail(emailLower);
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

    await dbCreateUser(newUser);

    res.json({ success: true, message: 'Usuario registrado con éxito.' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Correo y contraseña obligatorios.' });
    }

    const emailLower = email.trim().toLowerCase();
    const user = await dbGetUserByEmail(emailLower);
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

app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
    }

    const user = await dbGetUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const isPasswordValid = bcrypt.compareSync(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'La contraseña actual es incorrecta.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(newPassword, salt);

    await dbResetUserPassword(user.id, passwordHash);

    res.json({ success: true, message: 'Contraseña actualizada con éxito.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// --- RUTAS DE ADMINISTRACIÓN ---

app.get('/api/admin/bookings', authenticateToken, requireRole(['admin', 'worker']), async (req, res) => {
  try {
    const allBookings = await dbGetBookings();
    res.json(allBookings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener reservas.' });
  }
});

app.delete('/api/admin/bookings/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const bookingId = req.params.id;
    const deleted = await dbDeleteBooking(bookingId);
    if (!deleted) {
      return res.status(404).json({ error: 'Reserva no encontrada.' });
    }
    res.json({ success: true, message: 'Reserva eliminada con éxito.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar reserva.' });
  }
});

app.get('/api/admin/users', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const allUsers = await dbGetUsers();
    const sanitizedUsers = allUsers.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role
    }));
    res.json(sanitizedUsers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener usuarios.' });
  }
});

app.post('/api/admin/users/role', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { userId, role } = req.body;
    if (!userId || !role) {
      return res.status(400).json({ error: 'Faltan campos obligatorios.' });
    }

    const allowedRoles = ['client', 'worker', 'admin'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Rol no permitido.' });
    }

    const user = await dbGetUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    if (user.email === 'birraverdefilms@gmail.com') {
      return res.status(403).json({ error: 'No se puede modificar el rol del Super Usuario.' });
    }

    await dbUpdateUserRole(userId, role);
    res.json({ success: true, message: 'Rol de usuario actualizado con éxito.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar rol.' });
  }
});

// --- RUTAS DE REUNIONES INTERNAS ---

app.get('/api/internal/users', authenticateToken, requireRole(['admin', 'worker']), async (req, res) => {
  try {
    const allUsers = await dbGetUsers();
    const internalUsers = allUsers
      .filter(u => u.role === 'admin' || u.role === 'worker')
      .map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role }));
    res.json(internalUsers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener personal.' });
  }
});

app.post('/api/reunion-interna', authenticateToken, requireRole(['admin', 'worker']), upload.array('files'), async (req, res) => {
  try {
    const { subject, duration, date, time, notes } = req.body;
    let invitedUsersRaw = req.body.invitedUsers;

    if (!subject || !duration || !date || !time) {
      return res.status(400).json({ error: 'Faltan campos obligatorios.' });
    }

    let invitedUsers = [];
    if (invitedUsersRaw) {
      try {
        invitedUsers = typeof invitedUsersRaw === 'string' ? JSON.parse(invitedUsersRaw) : invitedUsersRaw;
      } catch (e) {
        invitedUsers = [];
      }
    }

    const allB = await dbGetBookings();
    const allM = await dbGetMeetings();

    const isOccupied = allB.some(b => 
      b.date === date && overlaps(b.time, b.duration, time, duration)
    ) || allM.some(m => 
      m.date === date && overlaps(m.time, m.duration, time, duration)
    );

    if (isOccupied) {
      return res.status(409).json({ error: 'Parte del horario seleccionado ya está ocupado.' });
    }

    const uploadedFiles = (req.files || []).map(f => ({
      filename: f.filename,
      originalname: f.originalname,
      path: `/uploads/${f.filename}`
    }));

    const newMeeting = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 5),
      hostId: req.user.id,
      hostName: req.user.name,
      hostEmail: req.user.email,
      subject,
      duration,
      date,
      time,
      notes: notes || '',
      invitedUsers,
      files: uploadedFiles,
      createdAt: new Date()
    };

    await dbCreateMeeting(newMeeting);

    res.json({ success: true, message: 'Reunión interna agendada con éxito.' });

    // Envío de correos asíncronos en segundo plano
    (async () => {
      try {
        const [year, month, day] = date.split('-');
        const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        const formattedDate = `${parseInt(day)} de ${months[parseInt(month) - 1]} ${year}`;

        const baseUrl = `${req.protocol}://${req.get('host')}`;

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

        let filesHtml = '';
        if (uploadedFiles.length > 0) {
          filesHtml = `<p style="margin: 15px 0 5px 0; color: #00ff41;">Archivos adjuntos para la reunión:</p><ul style="margin: 0; padding-left: 20px;">`;
          uploadedFiles.forEach(f => {
            filesHtml += `<li><a href="${baseUrl}/uploads/${f.filename}" style="color: #00ff41; text-decoration: underline;" target="_blank">${f.originalname}</a></li>`;
          });
          filesHtml += `</ul>`;
        }

        const invitedNamesList = invitedUsers.map(u => `<strong>${u.name}</strong> (${u.email})`).join(', ') || 'Ninguno';

        const hostDetails = `
          <p style="color: #ccc;">Has convocado una nueva reunión interna:</p>
          <div style="background: #111; padding: 20px; border-radius: 8px; border: 1px solid #333;">
            <p style="margin: 5px 0;">Asunto: <strong>${subject}</strong></p>
            <p style="margin: 5px 0;">Fecha: <strong>${formattedDate}</strong></p>
            <p style="margin: 5px 0;">Hora: <strong>${time}</strong></p>
            <p style="margin: 5px 0;">Duración: <strong>${duration} hora(s)</strong></p>
            <p style="margin: 5px 0;">Invitados: ${invitedNamesList}</p>
            <p style="margin: 5px 0;">Notas: ${notes || 'Ninguna'}</p>
            ${filesHtml}
          </div>`;

        const scriptURL = process.env.GOOGLE_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbzOiS6qNNUCsUOlFdPWkOhndnIyWMb7izoVvUJScw-U-1QX0irbPnUxhSultjyfZvWu/exec';

        // 1. Enviar correo al Host/Convocante
        console.log(`[EMAIL] Dispatching host meeting email to Google Apps Script for host ${req.user.email}...`);
        const hostRes = await fetch(scriptURL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            token: "BIRRAVERDE_2024_SECURE",
            name: req.user.name,
            email: req.user.email,
            phone: "Interno",
            people: "1",
            duration,
            date,
            time,
            notes: notes || '',
            subject: `Reunión Interna Convocada: ${subject}`,
            html: createHtml(req.user.name, hostDetails),
            htmlAdmin: 'Nueva reunión interna registrada por ' + req.user.name,
            textAdmin: `Reunión interna: ${subject} el ${formattedDate}`
          })
        });
        const hostResText = await hostRes.text();
        console.log(`[EMAIL] Google Apps Script host response status: ${hostRes.status}. Body: ${hostResText}`);

        // 2. Enviar correo a cada invitado
        for (const guest of invitedUsers) {
          const guestDetails = `
            <p style="color: #ccc;">Has sido invitado a una reunión interna convocada por <strong>${req.user.name}</strong>:</p>
            <div style="background: #111; padding: 20px; border-radius: 8px; border: 1px solid #333;">
              <p style="margin: 5px 0;">Asunto: <strong>${subject}</strong></p>
              <p style="margin: 5px 0;">Fecha: <strong>${formattedDate}</strong></p>
              <p style="margin: 5px 0;">Hora: <strong>${time}</strong></p>
              <p style="margin: 5px 0;">Duración: <strong>${duration} hora(s)</strong></p>
              <p style="margin: 5px 0;">Convocante: <strong>${req.user.name}</strong> (${req.user.email})</p>
              <p style="margin: 5px 0;">Notas del convocante: ${notes || 'Ninguna'}</p>
              ${filesHtml}
            </div>`;

          console.log(`[EMAIL] Dispatching guest meeting email to Google Apps Script for guest ${guest.email}...`);
          const guestRes = await fetch(scriptURL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
              token: "BIRRAVERDE_2024_SECURE",
              name: guest.name,
              email: guest.email,
              phone: "Interno",
              people: "1",
              duration,
              date,
              time,
              notes: notes || '',
              subject: `Invitación a Reunión Interna: ${subject}`,
              html: createHtml(guest.name, guestDetails),
              htmlAdmin: 'Invitación a reunión interna para ' + guest.name,
              textAdmin: `Reunión interna: ${subject} el ${formattedDate}`
            })
          });
          const guestResText = await guestRes.text();
          console.log(`[EMAIL] Google Apps Script guest response status: ${guestRes.status}. Body: ${guestResText}`);
        }
      } catch (err) {
        console.error('Error enviando correos de reunión interna:', err);
      }
    })();

  } catch (error) {
    console.error('Error al agendar reunión interna:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Error del servidor.' });
  }
});

app.get('/api/admin/meetings', authenticateToken, requireRole(['admin', 'worker']), async (req, res) => {
  try {
    const allMeetings = await dbGetMeetings();
    res.json(allMeetings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener reuniones.' });
  }
});

app.delete('/api/admin/meetings/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const meetingId = req.params.id;
    const { success, meeting } = await dbDeleteMeeting(meetingId);
    
    if (!success || !meeting) {
      return res.status(404).json({ error: 'Reunión no encontrada.' });
    }

    // Eliminar archivos del disco
    if (meeting.files && meeting.files.length > 0) {
      meeting.files.forEach(f => {
        const filePath = join(UPLOADS_DIR, f.filename);
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch (err) {
            console.error(`Error deleting file ${filePath}:`, err);
          }
        }
      });
    }

    res.json({ success: true, message: 'Reunión interna eliminada con éxito.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar reunión.' });
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
