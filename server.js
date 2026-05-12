import express from 'express';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON bodies
app.use(express.json());

// Serve static files from Vite build output
app.use(express.static(join(__dirname, 'dist')));

// Gmail SMTP transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
};

// ─── Booking API ──────────────────────────────────────────────
app.post('/api/booking', async (req, res) => {
  try {
    const { name, email, type, duration, date, time, notes } = req.body;

    // Validate required fields
    if (!name || !email || !type || !duration || !date || !time) {
      return res.status(400).json({ error: 'Faltan campos obligatorios.' });
    }

    const transporter = createTransporter();

    // Format date nicely
    const [year, month, day] = date.split('-');
    const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const formattedDate = `${parseInt(day)} de ${months[parseInt(month) - 1]} ${year}`;

    // ── Email to User (Confirmation) ──────────────────────────
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
            <p style="color: #a0a0a0; font-size: 15px; line-height: 1.6; margin-bottom: 30px;">
              Hola <strong style="color: #fff;">${name}</strong>, tu sesión ha sido agendada exitosamente. Aquí están los detalles:
            </p>
            
            <div style="background: #111; border: 1px solid #222; border-radius: 12px; padding: 25px; margin-bottom: 30px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 10px 0; color: #888; font-size: 14px; border-bottom: 1px solid #222;">📅 Fecha</td>
                  <td style="padding: 10px 0; color: #fff; font-size: 14px; text-align: right; font-weight: 600; border-bottom: 1px solid #222;">${formattedDate}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; color: #888; font-size: 14px; border-bottom: 1px solid #222;">🕐 Hora</td>
                  <td style="padding: 10px 0; color: #00ff41; font-size: 14px; text-align: right; font-weight: 600; border-bottom: 1px solid #222;">${time}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; color: #888; font-size: 14px; border-bottom: 1px solid #222;">🎬 Tipo</td>
                  <td style="padding: 10px 0; color: #fff; font-size: 14px; text-align: right; border-bottom: 1px solid #222;">${type}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; color: #888; font-size: 14px;">⏱️ Duración</td>
                  <td style="padding: 10px 0; color: #fff; font-size: 14px; text-align: right;">${duration} hora(s)</td>
                </tr>
              </table>
            </div>

            ${notes ? `
            <div style="background: #111; border: 1px solid #222; border-radius: 12px; padding: 20px; margin-bottom: 30px;">
              <p style="color: #888; font-size: 13px; margin: 0 0 8px 0;">📝 Notas:</p>
              <p style="color: #fff; font-size: 14px; margin: 0; line-height: 1.5;">${notes}</p>
            </div>
            ` : ''}

            <p style="color: #666; font-size: 13px; line-height: 1.6; margin-top: 30px;">
              Si necesitás modificar o cancelar tu reserva, respondé directamente a este correo.
            </p>
          </div>

          <div style="background: #080808; padding: 20px 30px; text-align: center; border-top: 1px solid #222;">
            <p style="color: #444; font-size: 12px; margin: 0;">© 2026 Birraverde. Todos los derechos reservados.</p>
          </div>
        </div>
      `,
    };

    // ── Email to Admin (Notification) ─────────────────────────
    const adminMailOptions = {
      from: `"Birraverde Booking System" <${process.env.GMAIL_USER}>`,
      to: process.env.GMAIL_USER,
      subject: `🔔 Nueva Reserva: ${name} — ${formattedDate} a las ${time}`,
      html: `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #ffffff; border-radius: 16px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #1a0a00 0%, #0a1a00 100%); padding: 30px; text-align: center; border-bottom: 2px solid #00ff41;">
            <h1 style="color: #00ff41; font-size: 20px; margin: 0;">🔔 NUEVA RESERVA</h1>
          </div>
          
          <div style="padding: 30px;">
            <div style="background: #111; border: 1px solid #222; border-radius: 12px; padding: 25px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 10px 0; color: #888; font-size: 14px; border-bottom: 1px solid #222;">👤 Cliente</td>
                  <td style="padding: 10px 0; color: #fff; font-size: 14px; text-align: right; font-weight: 600; border-bottom: 1px solid #222;">${name}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; color: #888; font-size: 14px; border-bottom: 1px solid #222;">✉️ Email</td>
                  <td style="padding: 10px 0; color: #00ff41; font-size: 14px; text-align: right; border-bottom: 1px solid #222;"><a href="mailto:${email}" style="color: #00ff41;">${email}</a></td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; color: #888; font-size: 14px; border-bottom: 1px solid #222;">📅 Fecha</td>
                  <td style="padding: 10px 0; color: #fff; font-size: 14px; text-align: right; font-weight: 600; border-bottom: 1px solid #222;">${formattedDate}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; color: #888; font-size: 14px; border-bottom: 1px solid #222;">🕐 Hora</td>
                  <td style="padding: 10px 0; color: #00ff41; font-size: 14px; text-align: right; font-weight: 600; border-bottom: 1px solid #222;">${time}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; color: #888; font-size: 14px; border-bottom: 1px solid #222;">🎬 Tipo</td>
                  <td style="padding: 10px 0; color: #fff; font-size: 14px; text-align: right; border-bottom: 1px solid #222;">${type}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; color: #888; font-size: 14px;">⏱️ Duración</td>
                  <td style="padding: 10px 0; color: #fff; font-size: 14px; text-align: right;">${duration} hora(s)</td>
                </tr>
              </table>
            </div>

            ${notes ? `
            <div style="background: #111; border: 1px solid #222; border-radius: 12px; padding: 20px; margin-top: 20px;">
              <p style="color: #888; font-size: 13px; margin: 0 0 8px 0;">📝 Notas del cliente:</p>
              <p style="color: #fff; font-size: 14px; margin: 0; line-height: 1.5;">${notes}</p>
            </div>
            ` : ''}
          </div>

          <div style="background: #080808; padding: 15px 30px; text-align: center; border-top: 1px solid #222;">
            <p style="color: #444; font-size: 11px; margin: 0;">Birraverde Booking System — Automated Notification</p>
          </div>
        </div>
      `,
    };

    // Send both emails
    await Promise.all([
      transporter.sendMail(userMailOptions),
      transporter.sendMail(adminMailOptions),
    ]);

    res.json({ success: true, message: 'Reserva confirmada y correos enviados.' });

  } catch (error) {
    console.error('Error sending booking emails:', error);
    res.status(500).json({ error: 'Error al enviar los correos. La reserva se guardó localmente.' });
  }
});

// ─── Catch-all: serve index.html for SPA-like routing ─────────
app.use((req, res) => {
  // Try to serve the exact file first, otherwise fallback to index.html
  const requestedPath = req.path.endsWith('/') ? req.path + 'index.html' : req.path;
  const filePath = join(__dirname, 'dist', requestedPath);
  
  res.sendFile(filePath, (err) => {
    if (err) {
      res.sendFile(join(__dirname, 'dist', 'index.html'));
    }
  });
});

app.listen(PORT, () => {
  console.log(`🟢 Birraverde server running on port ${PORT}`);
});
