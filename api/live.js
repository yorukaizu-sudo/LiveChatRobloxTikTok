let guarded = false;
function guard() {
  if (guarded) return;
  guarded = true;
  process.on('unhandledRejection', () => {});
  process.on('uncaughtException', () => {});
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  guard();

  try {
    if (process.env.API_KEY && req.query.key !== process.env.API_KEY) {
      return res.status(401).json({ ok: false, error: 'API key salah', messages: [] });
    }

    const user = String(req.query.user || '').replace('@', '').trim();
    if (!user) {
      return res.status(400).json({ ok: false, error: 'user kosong', messages: [] });
    }

    let mod;
    try {
      mod = await import('tiktok-live-connector');
    } catch (e) {
      return res.json({
        ok: false,
        error: 'gagal memuat library: ' + String((e && e.message) || e).slice(0, 300),
        messages: [],
      });
    }

    const d0 = mod.default || {};
    const Conn =
      mod.WebcastPushConnection || mod.TikTokLiveConnection ||
      d0.WebcastPushConnection || d0.TikTokLiveConnection;
    if (!Conn) {
      return res.json({
        ok: false,
        error: 'class tidak ketemu. export: ' + Object.keys(mod).join(','),
        messages: [],
      });
    }

    const startedAt = Date.now();
    const since = Number(req.query.since) || 0; // ts pesan terakhir yang sudah diterima client
    const waitMs = Math.min(Number(req.query.wait) || 12000, 20000);
    const messages = [];
    const seenIds = new Set();
    let lastError = null;

    let conn;
    try {
      conn = new Conn(user, { processInitialData: false });
    } catch (e) {
      return res.json({ ok: false, error: 'init gagal: ' + String((e && e.message) || e), messages: [] });
    }

    conn.on('error', e => { lastError = String((e && e.message) || e); });
    conn.on('chat', d => {
      const u = d.user || {};
      const text = String(d.comment || d.content || '').slice(0, 200);
      if (!text) return;

      // waktu pesan (ms)
      let ts = Number(d.createTime || (d.common && d.common.createTime) || 0);
      if (ts > 0 && ts < 1e11) ts *= 1000; // detik -> ms

      // id unik pesan
      const id = String(d.msgId || (d.common && d.common.msgId) || '');
      if (id) {
        if (seenIds.has(id)) return;
        seenIds.add(id);
      }

      // buang pesan lama (riwayat yang ikut terkirim saat connect)
      if (ts > 0) {
        if (since > 0 ? ts <= since : ts < startedAt - 1000) return;
      }

      messages.push({
        id,
        ts,
        user: d.uniqueId || u.uniqueId || u.displayId || '',
        nick: d.nickname || u.nickname || '',
        text,
      });
    });

    try {
      await conn.connect();
    } catch (e) {
      return res.json({ ok: false, error: String((e && e.message) || e).slice(0, 300), messages: [] });
    }

    await new Promise(r => setTimeout(r, waitMs));
    try { conn.disconnect(); } catch (_) {}

    return res.json({ ok: true, messages, warn: lastError });
  } catch (e) {
    return res.status(200).json({
      ok: false,
      error: 'crash: ' + String((e && e.stack) || e).slice(0, 400),
      messages: [],
    });
  }
};