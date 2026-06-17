(() => {
  const API_BASE = localStorage.getItem('API_BASE') || '';
  const APP_SECRET = localStorage.getItem('APP_SECRET') || '';
  const SAFE_APP_SECRET = (/^[\x00-\x7F]*$/.test(APP_SECRET) ? APP_SECRET : '');

  // ===== DOM =====
  const messagesEl = document.getElementById('messages');
  const inputEl = document.getElementById('input');
  const sendBtn = document.getElementById('send');
  const sessionEl = document.getElementById('session');
  const suggestionsEl = document.getElementById('suggestions');
  const clearBtn = document.getElementById('clear');
  const typingEl = document.getElementById('typing');
  const catalogEl = document.getElementById('catalog');

  // ===== Session =====
  const sessionId = (() => {
    const exist = localStorage.getItem('sessionId');
    if (exist) return exist;
    const id = 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('sessionId', id);
    return id;
  })();
  if (sessionEl) sessionEl.textContent = sessionId;

  // ===== Local history =====
  const readLocalHistory = () => {
    try { return JSON.parse(localStorage.getItem('chatHistory') || '[]'); } catch { return []; }
  };
  const writeLocalHistory = (list) => {
    try { localStorage.setItem('chatHistory', JSON.stringify(list || [])); } catch { }
  };

  // ===== UI helpers =====
  // const autosize = (el) => { if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 220) + 'px'; } };
  const autosize = (_el) => { };
  const setTyping = (on) => { if (typingEl) typingEl.style.display = on ? 'inline-block' : 'none'; };
  function addMessage(role, content, save = true) {
    const li = document.createElement('li');
    li.className = 'msg ' + role + (role === 'assistant' ? ' fade-in' : '');
    if (role === 'assistant') li.innerHTML = (window.marked ? marked.parse(content || '') : (content || ''));
    else li.textContent = content || '';
    messagesEl.appendChild(li);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    if (save) { const list = readLocalHistory(); list.push({ role, content }); writeLocalHistory(list); }
  }
  function renderLocalHistory() { readLocalHistory().forEach(m => addMessage(m.role, m.content, false)); }
  function clearHistory() { writeLocalHistory([]); if (messagesEl) messagesEl.innerHTML = ''; }

  // ===== Quick replies =====
  const defaultSuggestions = [
    '📚Danh mục ngành',
    '💰Học phí',
    '🏠Ký túc xá',
    '💼Việc làm',
    // '🚗 Lái xe',
    '🛠️ Ngắn hạn',
    '📞Liên hệ'
  ];
  function ensureSuggestions() {
    if (!suggestionsEl || suggestionsEl.children.length > 0) return;
    defaultSuggestions.forEach(q => {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.q = q; b.textContent = q; b.className = 'suggestion-btn';
      suggestionsEl.appendChild(b);
    });
  }

  // ===== History (backend) — public GET, bỏ header để tránh 401 =====
  async function loadHistoryFromBackend() {
    try {
      const res = await fetch(`${API_BASE}/api/history?sessionId=${encodeURIComponent(sessionId)}`);
      if (!res.ok) return;
      const data = await res.json();
      const backendMsgs = data.messages || [];
      if (readLocalHistory().length === 0 && backendMsgs.length) {
        backendMsgs.forEach(m => addMessage(m.role, m.content, false));
        writeLocalHistory(backendMsgs.map(m => ({ role: m.role, content: m.content })));
      }
    } catch {/* bỏ qua */ }
  }

  // ===== Catalog (majors) — public GET =====
  const MAJORS_CACHE_KEY = 'majors_cache_v1';
  const cacheMajors = (data) => { try { localStorage.setItem(MAJORS_CACHE_KEY, JSON.stringify({ t: Date.now(), data })); } catch { } };
  const readMajorsCache = (maxAgeMs = 10 * 60 * 1000) => {
    try {
      const raw = localStorage.getItem(MAJORS_CACHE_KEY); if (!raw) return null;
      const obj = JSON.parse(raw); if (!obj || !obj.t || !obj.data) return null; if (Date.now() - obj.t > maxAgeMs) return null; return obj.data;
    } catch { return null; }
  };
  async function fetchMajors() {
    const cached = readMajorsCache(); if (cached) return cached;
    const res = await fetch(`${API_BASE}/api/majors`);
    if (!res.ok) throw new Error('majors_fetch_failed');
    const data = await res.json(); cacheMajors(data); return data;
  }
  const fmtVND = (n) => (typeof n === 'number' ? n.toLocaleString('vi-VN') : n);
  function formatMajorBrief(m) {
    const fee = Array.isArray(m.tuition_range_vnd_per_term) && m.tuition_range_vnd_per_term.length === 2
      ? `${fmtVND(m.tuition_range_vnd_per_term[0])}–${fmtVND(m.tuition_range_vnd_per_term[1])}` : 'Cập nhật sau';
    return `**${m.name} – ${m.level}**
- Nhóm nghề: ${m.career_group || '—'}
- Mô tả: ${m.description || '—'}
- Kỹ năng: ${(m.skills || []).slice(0, 6).join(', ') || '—'}
- Học phần: ${(m.core_modules || []).slice(0, 5).join(', ') || '—'}
- Cơ hội việc làm: ${(m.jobs || []).join(', ') || '—'}
- Thời gian: ~${m.duration_months || '—'} tháng
- Tuyển sinh: ${(m.admission?.target) || '—'}
- Học phí/kỳ (ước tính): ${fee}
- Liên hệ: ${(m.contacts?.unit) || '—'} — ${(m.contacts?.phone) || ''}`.trim();
  }
  function injectMajorToChat(m) { addMessage('assistant', formatMajorBrief(m)); messagesEl.scrollTop = messagesEl.scrollHeight; inputEl.focus(); }
  function renderCatalogItems(items) {
    if (!catalogEl) return;
    if (!items || !items.length) { catalogEl.innerHTML = `<div class="card"><p>Chưa có dữ liệu ngành.</p></div>`; return; }
    catalogEl.innerHTML = items.map(m => `
      <div class="card" data-slug="${m.slug}">
        <h4>${m.name} <small>— ${m.level}</small></h4>
        <div class="meta">Nhóm: ${m.career_group || '—'} · RIASEC: <span class="riasec">${(m.riasec || []).join(', ') || '—'}</span></div>
        <div class="desc">${(m.description || '').slice(0, 220)}${(m.description && m.description.length > 220 ? '...' : '')}</div>
        <div class="meta">Thời gian: ${m.duration_months || '—'} tháng</div>
        <div class="actions">
          <button class="btn primary" data-act="detail" data-slug="${m.slug}">Xem chi tiết</button>
          <button class="btn" data-act="ask" data-name="${m.name}">Hỏi thêm</button>
        </div>
      </div>`).join('');
    catalogEl.onclick = (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      if (btn.dataset.act === 'detail') {
        const slug = btn.dataset.slug; const chosen = items.find(x => x.slug === slug); if (chosen) injectMajorToChat(chosen);
      } else if (btn.dataset.act === 'ask') {
        inputEl.value = `Ngành ${btn.dataset.name} học gì?`; autosize(inputEl); sendMessage();
      }
    };
  }
  async function toggleCatalog() {
    if (!catalogEl) return;
    if (catalogEl.classList.contains('hidden')) {
      try { setTyping(true); const data = await fetchMajors(); renderCatalogItems(data.items || []); catalogEl.classList.remove('hidden'); }
      catch { addMessage('assistant', 'Không tải được Danh mục ngành. Vui lòng thử lại sau.'); }
      finally { setTyping(false); }
    } else catalogEl.classList.add('hidden');
  }

  // ===== Send message =====
  async function sendMessage() {
    if (sendBtn && sendBtn.disabled) return;
    const text = (inputEl.value || '').trim(); if (!text) return;
    inputEl.value = ''; autosize(inputEl); addMessage('user', text); if (suggestionsEl) suggestionsEl.classList.add('hidden');
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '...'; } setTyping(true);
    try {
      const res = await fetch(`${API_BASE}/api/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(SAFE_APP_SECRET ? { 'x-app-key': SAFE_APP_SECRET } : {})
        },
        body: JSON.stringify({ sessionId, userMessage: text, meta: { userAgent: navigator.userAgent } })
      });
      if (!res.ok) { const t = await res.text().catch(() => ''); addMessage('assistant', `Lỗi kết nối backend (${res.status}). ${t.slice(0, 180)}`); return; }
      const data = await res.json();
      addMessage('assistant', data.reply || '(không có phản hồi)');
    } catch (err) { addMessage('assistant', 'Lỗi kết nối backend. Vui lòng thử lại.'); }
    finally { if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Gửi'; } setTyping(false); inputEl.focus(); }
  }

  // ===== Events =====
  if (sendBtn) sendBtn.addEventListener('click', sendMessage);
  if (inputEl) {
    inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
    autosize(inputEl); inputEl.addEventListener('input', () => autosize(inputEl));
  }
  if (suggestionsEl) {
    suggestionsEl.addEventListener('click', (e) => {
      const q = e.target?.dataset?.q; if (!q) return;
      if (q.includes('Danh mục ngành')) { toggleCatalog(); return; }
      inputEl.value = q; autosize(inputEl); sendMessage();
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearHistory(); if (suggestionsEl) suggestionsEl.classList.remove('hidden'); if (catalogEl) catalogEl.classList.add('hidden');
      addMessage('assistant', 'Xin chào! Tôi là **Tư vấn viên AI, Trường Cao đẳng Miền Đông**. Bạn cần tư vấn về *ngành học*, *học phí*, *ký túc xá*, *điều kiện học tập* hay *cơ hội việc làm*?', true);
    });
  }

  // ===== Init =====
  ensureSuggestions();
  renderLocalHistory();
  if (readLocalHistory().length === 0) {
    addMessage(
      'assistant',
      'Xin chào! Tôi là **Tư vấn viên AI của Trường Cao đẳng Miền Đông**. Bạn cần tư vấn về *ngành học*, *học phí*, *ký túc xá*, *điều kiện học tập* hay *cơ hội việc làm*?',
      true
    );
  }
  loadHistoryFromBackend();
  // ===== Nút lên đầu trang =====

  const backToTopBtn = document.getElementById("backToTop");

  window.addEventListener("scroll", () => {
    if (window.scrollY > 300) {
      backToTopBtn.style.display = "block";
    } else {
      backToTopBtn.style.display = "none";
    }
  });

  backToTopBtn.addEventListener("click", () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  });
})();
