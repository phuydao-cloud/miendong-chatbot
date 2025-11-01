// server.js — BẢN ỔN ĐỊNH TRƯỚC BƯỚC D (ESM, chạy với "type":"module")
import express from 'express';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';


function envCheck() {
  const need = ['OPENAI_API_KEY', 'CLIENT_URL', 'ALLOWED_ORIGINS', 'GOOGLE_APPLICATION_CREDENTIALS'];
  need.forEach(k => {
    if (!process.env[k] || !String(process.env[k]).trim()) {
      console.error(`[ENV] Missing: ${k}`);
    }
  });
  console.log(
    '[ENV CHECK]',
    `NODE_ENV=${process.env.NODE_ENV}`,
    `OPENAI_API_KEY.len=${(process.env.OPENAI_API_KEY || '').length}`,
    `PROJECT=${process.env.OPENAI_PROJECT || '(empty)'}`,
    `GAC=${process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'set' : 'missing'}`
  );
}
envCheck();

// const PORT = parseInt(process.env.PORT || '10000', 10);
// app.listen(PORT, '0.0.0.0', () => {
//   console.log(`Server listening on port ${PORT}`);
// });

app.get('/healthz', (req, res) => res.status(200).json({ ok: true, ts: Date.now() }));

import admin from 'firebase-admin';
admin.initializeApp({ credential: admin.credential.applicationDefault() });



// Node 18+ có sẵn fetch toàn cục; không cần node-fetch
dotenv.config({ override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '10000', 10);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const APP_SECRET = process.env.APP_SECRET || '';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// ===== Middlewares =====
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Nếu cùng domain, có thể bỏ cors; giữ cũng không sao
app.use(cors());

// Serve frontend tĩnh
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR, { maxAge: '1h' }));


// ===== Health =====
app.get('/health', (_req, res) => res.json({ ok: true }));

// ===== In-memory history =====
const sessions = new Map(); // sessionId -> [{role, content}]
const pushHistory = (sid, msg) => {
  if (!sid) return;
  if (!sessions.has(sid)) sessions.set(sid, []);
  sessions.get(sid).push({ role: msg.role, content: msg.content });
};
const getHistory = (sid) => sessions.get(sid) || [];

// ===== Load majors.json =====
const MAJORS_FILE = process.env.MAJORS_FILE || path.join(__dirname, 'data', 'majors.json');
let majorsDB = { items: [] };

(function loadMajors() {
  try {
    if (fs.existsSync(MAJORS_FILE)) {
      const raw = fs.readFileSync(MAJORS_FILE, 'utf8');
      const obj = JSON.parse(raw);
      majorsDB.items = Array.isArray(obj) ? obj : (obj.items || obj.majors || []);
      console.log(`[majors] Loaded ${majorsDB.items.length} items from ${MAJORS_FILE}`);
    } else {
      console.warn(`[majors] File not found: ${MAJORS_FILE}`);
    }
  } catch (e) {
    console.error('[majors] Load error:', e);
  }
})();

// ===== Load thêm dữ liệu nội bộ ở thư mục /data =====
const DATA_DIR = path.join(__dirname, 'data');

/**
 * Đọc an toàn 1 file text (txt/md/json)
 */
function readFileSafe(fullPath) {
  try {
    if (!fs.existsSync(fullPath)) return '';
    const ext = path.extname(fullPath).toLowerCase();
    const raw = fs.readFileSync(fullPath, 'utf8');

    if (ext === '.json') {
      // JSON: lấy gọn 1 số trường phổ biến, tránh đẩy cả file dài
      const obj = JSON.parse(raw);
      const sample =
        Array.isArray(obj) ? obj.slice(0, 5) : (obj.items || obj.majors || []);
      return `JSON(${path.basename(fullPath)}):\n` +
        JSON.stringify(sample, null, 2).slice(0, 4000);
    }

    // txt/md: trả nguyên văn nhưng giới hạn độ dài mỗi file
    return `${path.basename(fullPath)}:\n` + raw.slice(0, 8000);
  } catch {
    return '';
  }
}

/**
 * Quét folder DATA_DIR, gom các file txt/md/json (trừ majors.json vì đã xử lý riêng)
 * Trả về chuỗi gộp để nhét vào system prompt
 */
function loadInternalNotes() {
  try {
    if (!fs.existsSync(DATA_DIR)) return '';
    const files = fs.readdirSync(DATA_DIR)
      .filter(f => /\.(txt|md|json)$/i.test(f) && f !== 'majors.json');

    const parts = files.map(f => readFileSafe(path.join(DATA_DIR, f)))
      .filter(Boolean);

    // Giới hạn tổng dung lượng đưa lên prompt (tránh quá dài)
    const joined = parts.join('\n\n---\n\n');
    return joined.slice(0, 20000); // ~20k ký tự
  } catch {
    return '';
  }
}

let internalNotes = loadInternalNotes();
console.log(`[data] internal notes length: ${internalNotes.length}`);

// (Tuỳ chọn) Theo dõi thay đổi file để tự reload (dev)
try {
  fs.watch(DATA_DIR, { recursive: false }, (evt, fname) => {
    if (!fname) return;
    if (!/\.(txt|md|json)$/i.test(fname)) return;
    // debounce nhỏ
    clearTimeout(global.__reloadTimer);
    global.__reloadTimer = setTimeout(() => {
      internalNotes = loadInternalNotes();
      console.log(`[data] reloaded, length: ${internalNotes.length}`);
    }, 250);
  });
} catch { }

// ===== Public read APIs (không yêu cầu APP_SECRET) =====
app.get('/api/majors', (_req, res) => {
  res.json({ total: majorsDB.items.length, items: majorsDB.items });
});

app.get('/api/majors/:slug', (req, res) => {
  const slug = String(req.params.slug || '').toLowerCase();
  const item = majorsDB.items.find(m => (m.slug || '').toLowerCase() === slug);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

app.get('/api/history', (req, res) => {
  const sessionId = String(req.query.sessionId || '').trim();
  res.json({ messages: getHistory(sessionId) });
});

// ===== ONLY protect /api/message with APP_SECRET (nếu có) =====
// function requireSecret(req, res, next) {
//   if (!APP_SECRET) return next();               // không cấu hình thì bỏ qua
//   const got = req.headers['x-app-key'];        // FE gửi header này khi gọi chat
//   if (got === APP_SECRET) return next();
//   return res.status(401).json({ error: 'Unauthorized' });
// }

function requireSecret(_req, _res, next) { return next(); }

// Admin: reload dữ liệu nội bộ thủ công (POST)
// Gửi header x-app-key nếu .env có APP_SECRET
app.post('/admin/reload-data', (req, res) => {
  if (process.env.APP_SECRET) {
    const key = req.headers['x-app-key'];
    if (key !== process.env.APP_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  internalNotes = loadInternalNotes();
  return res.json({ ok: true, length: internalNotes.length });
});

// ===== Chat endpoint (LLM) =====
app.post('/api/message', requireSecret, async (req, res) => {
  try {
    const { sessionId, userMessage } = req.body || {};
    if (!userMessage || typeof userMessage !== 'string') {
      return res.status(400).json({ error: 'userMessage required' });
    }

    // Ưu tiên dữ liệu nội bộ (tóm tắt danh mục)
    const majorsBrief = (majorsDB.items || [])
      .slice(0, 20)
      .map(m => `- ${m.name} (${m.level || ''}) | nhóm: ${m.career_group || ''}`)
      .join('\n');

    const systemPrompt = [
      'Bạn là Tư vấn viên Miền Đông AI.',
      'Luôn ưu tiên trả lời dựa trên dữ liệu nội bộ của nhà trường (ngành học, học phí, KTX, việc làm...).',
      'Nếu chưa chắc chắn, hãy nói sẽ kiểm tra lại thay vì suy đoán.',
      '',
      internalNotes || '(chưa có thông tin của trường)',
      'Danh mục ngành (rút gọn):',
      majorsBrief || '(chưa có dữ liệu ngành)'
    ].join('\n');

    const history = getHistory(sessionId).slice(-10);
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userMessage }
    ];

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        messages
      })
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return res.status(r.status).send(txt || 'Upstream error');
    }

    const data = await r.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || 'Mình đã nhận câu hỏi, xin trả lời sau.';
    if (sessionId) {
      pushHistory(sessionId, { role: 'user', content: userMessage });
      pushHistory(sessionId, { role: 'assistant', content: reply });
    }
    res.json({ reply });
  } catch (e) {
    console.error('message error:', e);
    res.status(500).json({ error: 'server_error' });
  }
});

// ===== Start =====
app.listen(PORT, () => {
  console.log(`✅ Chatbot backend running at http://localhost:${PORT}`);
});

// SPA fallback cho mọi đường dẫn KHÔNG phải /api
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});