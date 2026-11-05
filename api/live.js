// Long-poll: connect ke TikTok LIVE sebentar, kumpulkan chat, kembalikan sebagai JSON.
// Semua error dikembalikan sebagai JSON {ok:false,error:"..."} supaya tidak jadi 500.

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

    // Muat library di dalam fungsi, supaya kalau gagal tetap bisa dilaporkan
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

    const waitMs = Math.min(Number(req.query.wait) || 12000, 20000);
    const messages = [];
    let lastError = null;

    let conn;
    try {
      conn = new Conn(user, { processInitialData: false });
    } catch (e) {
      return res.json({ ok: false, error: 'init gagal: ' + String((e && e.message) || e), messages: [] });
    }

    // Wajib ada, kalau tidak event error bisa mematikan fungsi
    conn.on('error', e => { lastError = String((e && e.message) || e); });
    conn.on('chat', d => {
      const u = d.user || {};
      const text = String(d.comment || d.content || '').slice(0, 200);
      if (!text) return;
      messages.push({
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