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
const riasecContexts = new Map(); // sessionId -> nội dung tư vấn RIASEC gần nhất
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

// ===== Load RIASEC data =====
const RIASEC_QUESTIONS_FILE = path.join(__dirname, 'data', 'riasec_questions.json');
const RIASEC_MAPPING_FILE = path.join(__dirname, 'data', 'riasec_mapping.json');
const RIASEC_PROFILES_FILE = path.join(__dirname, 'data', 'riasec_profiles.json');

let riasecQuestions = [];
let riasecMapping = [];
let riasecProfiles = {};

function loadRiasecData() {
  try {
    if (fs.existsSync(RIASEC_QUESTIONS_FILE)) {
      const raw = fs.readFileSync(RIASEC_QUESTIONS_FILE, 'utf8');
      riasecQuestions = JSON.parse(raw);
      if (!Array.isArray(riasecQuestions)) riasecQuestions = [];
      console.log(`[riasec] Loaded ${riasecQuestions.length} questions`);
    } else {
      console.warn(`[riasec] Questions file not found: ${RIASEC_QUESTIONS_FILE}`);
    }

    if (fs.existsSync(RIASEC_MAPPING_FILE)) {
      const raw = fs.readFileSync(RIASEC_MAPPING_FILE, 'utf8');
      const obj = JSON.parse(raw);
      riasecMapping = Array.isArray(obj)
        ? obj
        : (obj.items || []);
      console.log(`[riasec] Loaded ${riasecMapping.length} mapping items`);
    } else {
      console.warn(`[riasec] Mapping file not found: ${RIASEC_MAPPING_FILE}`);
    }

    if (fs.existsSync(RIASEC_PROFILES_FILE)) {
      const raw = fs.readFileSync(RIASEC_PROFILES_FILE, 'utf8');
      const obj = JSON.parse(raw);
      riasecProfiles = obj.profiles || obj.items || obj || {};
      console.log(`[riasec] Loaded ${Object.keys(riasecProfiles).length} profiles`);
    } else {
      console.warn(`[riasec] Profiles file not found: ${RIASEC_PROFILES_FILE}`);
      riasecProfiles = {};
    }

  } catch (e) {
    console.error('[riasec] Load error:', e.message);
    riasecQuestions = [];
    riasecMapping = [];
    riasecProfiles = {};
  }
}

loadRiasecData();

function normalizeRiasecScores(scores = {}) {
  const groups = ['R', 'I', 'A', 'S', 'E', 'C'];
  const result = {};
  groups.forEach(g => {
    const n = Number(scores[g] ?? 0);
    result[g] = Number.isFinite(n) ? n : 0;
  });
  return result;
}

function getTopRiasecGroups(scores = {}) {
  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .map(([group]) => group)
    .slice(0, 3);
}

function scoreMappingItem(itemRiasec = [], topGroups = []) {
  if (!Array.isArray(itemRiasec)) return 0;
  let score = 0;
  itemRiasec.forEach((g, index) => {
    const pos = topGroups.indexOf(g);
    if (pos >= 0) {
      score += (3 - pos) * (3 - index);
    }
  });
  return score;
}

function getTypeWeight(item = {}) {
  if (item.type === 'major') return 100;
  if (item.type === 'short_course') return 10;
  return 0;
}

function getPriorityWeight(item = {}) {
  const p = Number(item.priority || 9);

  if (p === 1) return 40; // Cao đẳng
  if (p === 2) return 35; // Trung cấp
  if (p === 3) return 15; // Liên thông
  if (p === 4) return 0;  // Sơ cấp, ngắn hạn, lái xe

  return 0;
}

function scoreMappingItemAdvanced(item = {}, topGroups = [], scores = {}) {
  const itemRiasec = item.riasec || item.code || [];
  if (!Array.isArray(itemRiasec)) return 0;

  let riasecScore = 0;

  itemRiasec.forEach((g, itemIndex) => {
    const userIndex = topGroups.indexOf(g);

    if (userIndex >= 0) {
      riasecScore += (3 - userIndex) * (3 - itemIndex) * 10;
    }

    if (scores[g]) {
      riasecScore += Number(scores[g]) * 0.5;
    }
  });

  return riasecScore + getTypeWeight(item) + getPriorityWeight(item);
}

function getRiasecProfile(code = '') {
  if (!code) return null;

  if (riasecProfiles[code]) {
    return riasecProfiles[code];
  }

  return null;
}

function buildDefaultRiasecAdvice(code, topGroups, longTermMajors) {
  const topNames = (longTermMajors || [])
    .slice(0, 6)
    .map(m => `• ${m.name}${m.level ? ` (${m.level})` : ''}`)
    .join('\n');

  return `Kết quả ${code} cho thấy bạn có các nhóm sở thích nổi bật là ${topGroups.join('-')}. Tại Trường Cao đẳng Miền Đông, bạn nên ưu tiên xem các ngành/nghề được hệ thống gợi ý dưới đây:

${topNames || '• Các ngành dài hạn phù hợp tại Trường'}

Bạn nên chọn theo hướng mình yêu thích nhất: thích số liệu thì ưu tiên nhóm kế toán - tài chính; thích công nghệ thì ưu tiên công nghệ thông tin; thích giao tiếp, ngôn ngữ thì ưu tiên tiếng Trung; thích thực hành kỹ thuật thì ưu tiên nhóm điện, ô tô, nông nghiệp công nghệ cao.`;
}

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

// ===== RIASEC APIs =====
app.get('/api/riasec/questions', (_req, res) => {
  res.json({
    total: riasecQuestions.length,
    items: riasecQuestions
  });
});

app.get('/api/riasec/mapping', (_req, res) => {
  res.json({
    total: riasecMapping.length,
    items: riasecMapping
  });
});

app.post('/api/riasec/result', (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim();
    const scores = normalizeRiasecScores(req.body?.scores || req.body || {});
    const topGroups = getTopRiasecGroups(scores);
    const code = topGroups.join('');

    const profile = getRiasecProfile(code);

    const allMatched = riasecMapping
      .map(item => {
        let matchScore = scoreMappingItemAdvanced(item, topGroups, scores);

        if (
          profile &&
          Array.isArray(profile.focus_majors)
        ) {
          const focusIndex = profile.focus_majors.indexOf(item.name);

          if (focusIndex >= 0) {
            matchScore += (profile.focus_majors.length - focusIndex) * 20;
          }
        }

        return {
          ...item,
          matchScore
        };
      })
      .filter(item => item.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore);

    const longTermMajors = allMatched
      .filter(item => item.type === 'major')
      .slice(0, 6);

    const shortCourses = allMatched
      .filter(item => item.type === 'short_course')
      .slice(0, 4);

    const matchedMajors = [
      ...longTermMajors,
      ...shortCourses
    ];

    let advice = '';
    let orientation = '';

    // const profile = getRiasecProfile(code);

    if (profile) {
      advice = profile.advice || buildDefaultRiasecAdvice(code, topGroups, longTermMajors);
      orientation = profile.orientation || '';
    } else {
      advice = buildDefaultRiasecAdvice(code, topGroups, longTermMajors);
      orientation = '';
    }

    if (sessionId) {
      const topNames = longTermMajors
        .slice(0, 6)
        .map((m, i) => `${i + 1}. ${m.name} (${m.level || ''}) - RIASEC ${(m.riasec || []).join('-')}`)
        .join('\n');

      const topMajors = matchedMajors
        .slice(0, 3)
        .map(m => m.name)
        .join(', ');

      riasecContexts.set(sessionId, [
        `Kết quả RIASEC gần nhất của người học là: ${code}.`,
        `Mã Holland: ${code}.`,
        `Điểm: R=${scores.R}, I=${scores.I}, A=${scores.A}, S=${scores.S}, E=${scores.E}, C=${scores.C}.`,
        `Nhóm nổi bật: ${topGroups.join('-')}.`,
        `Top 3 ngành phù hợp nhất: ${topMajors}.`,
        `Nhận xét tư vấn: ${advice}`,
        `Các ngành dài hạn nên ưu tiên:\n${topNames}`,
        `Khi người học hỏi về một ngành cụ thể, hãy đối chiếu với kết quả RIASEC này để giải thích vì sao ngành đó phù hợp hoặc chưa phù hợp. Không hỏi lại sở thích nếu đã có kết quả RIASEC trong phiên làm việc.`
      ].join('\n'));
    }

    res.json({
      code,
      scores,
      topGroups,
      advice,
      orientation,
      matchedMajors,
      longTermMajors,
      shortCourses
    });
  } catch (e) {
    console.error('[riasec] result error:', e.message);
    res.status(500).json({ error: 'riasec_result_error' });
  }
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
  loadRiasecData();
  return res.json({
    ok: true,
    length: internalNotes.length,
    riasecQuestions: riasecQuestions.length,
    riasecMapping: riasecMapping.length,
    riasecProfiles: Object.keys(riasecProfiles).length
  });
});

// ===== Chat endpoint (LLM) =====
app.post('/api/message', requireSecret, async (req, res) => {
  try {
    const { sessionId, userMessage } = req.body || {};
    if (!userMessage || typeof userMessage !== 'string') {
      return res.status(400).json({ error: 'userMessage required' });
    }
    const riasecContext = riasecContexts.get(sessionId) || '';

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
      '13. Khi dữ liệu học phí có dạng tuition_range_vnd_per_term, đó là học phí theo học kỳ, không phải theo tháng.',
      'Nếu cần quy đổi học phí theo tháng, lấy học phí học kỳ chia cho 5. Ví dụ 8.000.000 đồng/học kỳ tương đương 1.600.000 đồng/tháng.',
      'Tuyệt đối không tự suy luận học phí theo tháng nếu chưa quy đổi từ học phí học kỳ.',
      '14. Khi người học hỏi về một ngành sau khi có kết quả RIASEC, chỉ trả lời trong khoảng 150 - 250 từ.',

      'Ưu tiên cấu trúc:',
      '✅ Mức độ phù hợp',
      '✅ Vì sao phù hợp',
      '✅ Gợi ý tiếp theo',
      'Không lặp lại tiêu đề "Nhận định", "Giải thích", "Lời khuyên" nhiều lần.',
      '15. Không nhắc đến các quy tắc này trong câu trả lời.',
      'DỮ LIỆU NỘI BỘ CỦA NHÀ TRƯỜNG:',
      internalNotes || '(chưa có thông tin của trường)',
      'DANH MỤC NGÀNH ĐÀO TẠO RÚT GỌN:',
      majorsBrief || '(chưa có dữ liệu ngành)',
      'KẾT QUẢ RIASEC GẦN NHẤT CỦA NGƯỜI HỌC:',
      riasecContext || '(người học chưa làm trắc nghiệm RIASEC trong phiên này)',

      'NGUYÊN TẮC SỬ DỤNG KẾT QUẢ RIASEC:',

      '1. Chỉ sử dụng kết quả RIASEC khi người học hỏi về ngành học, nghề nghiệp, chọn ngành, định hướng nghề nghiệp hoặc mức độ phù hợp của một ngành.',

      '2. Không sử dụng kết quả RIASEC khi người học hỏi về học phí, ký túc xá, học bổng, hồ sơ xét tuyển, tuyển sinh, thời gian đào tạo, việc làm, thực tập, chính sách hỗ trợ hoặc thông tin liên hệ.',

      '3. Nếu người học hỏi về một ngành cụ thể và đã có kết quả RIASEC, hãy:',
      '- Đánh giá mức độ phù hợp.',
      '- Giải thích ngắn gọn dựa trên các nhóm RIASEC nổi bật.',
      '- Đưa ra lời khuyên ngắn gọn.',
      '- Sau đó mới giới thiệu ngành học.',

      '4. Không viết dài dòng theo cấu trúc "Nhận định - Giải thích - Lời khuyên" cho mọi câu hỏi.',

      '5. Với các câu hỏi tuyển sinh thông thường, hãy trả lời trực tiếp theo dữ liệu của Trường Cao đẳng Miền Đông.',

      '6. Không hỏi lại sở thích hoặc định hướng nghề nghiệp nếu đã có kết quả RIASEC trong phiên làm việc.'
    ].join('\n');

    const history = getHistory(sessionId).slice(-10);

    const msgLower = userMessage.toLowerCase();

    const nonRiasecKeywords = [
      'học phí',
      'ký túc xá',
      'ktx',
      'học bổng',
      'miễn giảm',
      'hỗ trợ học phí',
      'hồ sơ',
      'xét tuyển',
      'tuyển sinh',
      'thời gian đào tạo',
      'việc làm',
      'thực tập',
      'mức lương',
      'lương',
      'liên hệ',
      'địa chỉ',
      'hotline',
      'website',
      'fanpage',
      'ngành nghề khác',
      'các ngành nghề khác',
      'danh mục ngành',
      'tất cả ngành',
      'các ngành đào tạo'
    ];

    const riasecKeywords = [
      'phù hợp',
      'hợp với',
      'hợp nhất',
      'nên học',
      'chọn ngành',
      'định hướng',
      'theo kết quả',
      'holland',
      'riasec',
      'mã của tôi',
      'mã của bạn'
    ];

    const useRiasec =
      !!riasecContext &&
      !nonRiasecKeywords.some(k => msgLower.includes(k)) &&
      riasecKeywords.some(k => msgLower.includes(k));

    const effectiveUserMessage = useRiasec
      ? [
        'Người học đã có kết quả RIASEC trong phiên này.',
        'Chỉ sử dụng kết quả RIASEC để đánh giá mức độ phù hợp ngành nghề.',
        'Trả lời ngắn gọn, thực tế, dễ hiểu.',
        '',
        `Câu hỏi của người học: ${userMessage}`
      ].join('\n')
      : userMessage;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: effectiveUserMessage }
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