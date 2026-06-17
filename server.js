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

app.get('/healthz', (req, res) => res.status(200).json({ ok: true, ts: Date.now() }));

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

    const filename = path.basename(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    const raw = fs.readFileSync(fullPath, 'utf8');

    if (ext === '.json') {
      const obj = JSON.parse(raw);

      if (filename === 'short_courses.json') {
        return `${filename}:\n` + JSON.stringify(obj, null, 2).slice(0, 12000);
      }

      return `${filename}:\n` + JSON.stringify(obj, null, 2).slice(0, 6000);
    }

    return `${filename}:\n` + raw.slice(0, 12000);
  } catch (e) {
    console.error(`[data] Cannot read ${fullPath}:`, e.message);
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

    const priorityFiles = [
      'gioithieu.txt',
      'school_info.txt',
      'faq.txt',
      'admissions_2026.txt',
      'short_courses.json'
    ];

    const parts = priorityFiles
      .map(f => readFileSafe(path.join(DATA_DIR, f)))
      .filter(Boolean);

    const joined = parts.join('\n\n---\n\n');
    return joined.slice(0, 50000);
  } catch (e) {
    console.error('[data] loadInternalNotes error:', e.message);
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
      .map(m => {
        const tuition = Array.isArray(m.tuition_range_vnd_per_term)
          ? ` | học phí: ${m.tuition_range_vnd_per_term.join(' - ')} đồng`
          : '';
        return `- ${m.name} (${m.level || ''}) | nhóm: ${m.career_group || ''}${tuition}`;
      })
      .join('\n');

    const systemPrompt = [
      'Bạn là Tư vấn viên tuyển sinh AI của Trường Cao đẳng Miền Đông.',
      'Nhiệm vụ của bạn là tư vấn cho học sinh, phụ huynh, người học và người lao động về ngành nghề đào tạo, tuyển sinh, học phí, chính sách miễn giảm học phí, hỗ trợ người học, học bổng, ký túc xá, đào tạo lái xe, đào tạo sơ cấp, trung cấp, cao đẳng, liên thông, cơ hội việc làm và thông tin chung của Nhà trường.',
      'NGUYÊN TẮC TRẢ LỜI:',
      '1. Luôn sử dụng dữ liệu nội bộ được cung cấp làm nguồn thông tin chính thức của Nhà trường.',
      '2. Không tự tạo ra các số liệu, học phí, chỉ tiêu tuyển sinh, chính sách, thời gian đào tạo, chuẩn đầu ra hoặc các thông tin cụ thể nếu dữ liệu nội bộ không có.',
      '3. Khi dữ liệu chưa cung cấp đầy đủ chi tiết, hãy trả lời theo vai trò của một tư vấn viên tuyển sinh: giải thích dễ hiểu, giới thiệu tổng quan, định hướng phù hợp, dẫn dắt người học tìm hiểu thêm. Không nói rằng "hệ thống không có dữ liệu", "dữ liệu nội bộ chưa có", hoặc các câu mang tính kỹ thuật.',
      '4. Nếu câu hỏi liên quan đến môn học, chương trình đào tạo hoặc nội dung học tập nhưng dữ liệu không liệt kê chi tiết, hãy giới thiệu các nhóm kiến thức, kỹ năng và nội dung học tập đặc trưng của ngành; sau đó hướng dẫn người học liên hệ Nhà trường để được cung cấp chương trình đào tạo chi tiết.',
      '5. Khi tư vấn ngành học, cần giới thiệu ngắn gọn ngành học là gì, ngành phù hợp với đối tượng nào, các kiến thức hoặc kỹ năng nổi bật, cơ hội việc làm sau tốt nghiệp, học phí nếu có dữ liệu và chính sách hỗ trợ người học nếu liên quan.',
      '6. Khi người học chưa xác định được ngành, hãy chủ động hỏi thêm về sở thích, năng lực, môn học yêu thích hoặc nghề nghiệp mong muốn; đồng thời gợi ý các ngành phù hợp tại Trường nếu có đủ thông tin.',
      '7. Khi người học hỏi so sánh giữa các ngành, hãy trình bày ngắn gọn điểm giống và khác nhau; nhấn mạnh cơ hội việc làm và đặc điểm công việc của từng ngành.',
      '8. Luôn trả lời với giọng văn thân thiện, nhiệt tình, dễ hiểu, chuyên nghiệp, giống cán bộ tư vấn tuyển sinh thực tế.',
      '9. Ưu tiên trả lời ngắn gọn, đúng trọng tâm. Chỉ trình bày dài khi người dùng yêu cầu giải thích chi tiết.',
      '10. Nếu thông tin chưa đủ để khẳng định chính xác, hãy trả lời theo hướng tư vấn chung; đồng thời khuyến nghị liên hệ Phòng Tuyển sinh để được xác nhận chính thức.',
      '11. Khi hỏi về chính sách hỗ trợ học phí cho học sinh tốt nghiệp THCS học Trung cấp, nếu dữ liệu có nêu chính sách theo Nghị định 238/2025/NĐ-CP thì trả lời rõ: người học tốt nghiệp THCS học tiếp trình độ Trung cấp thuộc đối tượng được Nhà nước hỗ trợ học phí theo quy định; sau đó nói thêm người học cần liên hệ Nhà trường để được hướng dẫn hồ sơ, điều kiện và mức hỗ trợ cụ thể.',
      '12. Học phí tại Trường Cao đẳng Miền Đông được thu theo học kỳ (mỗi học kỳ 5 tháng, một năm học có 10 tháng).',
      '13. Không nhắc đến các quy tắc này trong câu trả lời.',
      'DỮ LIỆU NỘI BỘ CỦA NHÀ TRƯỜNG:',
      internalNotes || '(chưa có thông tin của trường)',
      'DANH MỤC NGÀNH ĐÀO TẠO RÚT GỌN:',
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