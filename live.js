// Long-poll: connect ke TikTok LIVE sebentar, kumpulkan chat, kembalikan.
const lib = require('tiktok-live-connector');
const Conn = lib.WebcastPushConnection || lib.TikTokLiveConnection;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  // Opsional: set API_KEY di Environment Variables Vercel
  if (process.env.API_KEY && req.query.key !== process.env.API_KEY) {
    return res.status(401).json({ ok: false, error: 'API key salah', messages: [] });
  }

  const user = String(req.query.user || '').replace('@', '').trim();
  if (!user) return res.status(400).json({ ok: false, error: 'user kosong', messages: [] });

  const waitMs = Math.min(Number(req.query.wait) || 12000, 20000);
  const messages = [];
  const conn = new Conn(user);

  conn.on('chat', d => {
    messages.push({
      user: d.uniqueId || (d.user && d.user.uniqueId) || '',
      nick: d.nickname || (d.user && d.user.nickname) || '',
      text: String(d.comment || '').slice(0, 200),
    });
  });

  try {
    await conn.connect();
  } catch (e) {
    return res.json({ ok: false, error: String((e && e.message) || e), messages: [] });
  }

  await new Promise(r => setTimeout(r, waitMs));
  try { conn.disconnect(); } catch (_) {}

  res.json({ ok: true, messages });
};
