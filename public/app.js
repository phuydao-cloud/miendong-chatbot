(() => {
  const API_BASE = localStorage.getItem('API_BASE') || '';
  const APP_SECRET = localStorage.getItem('APP_SECRET') || '';
  const SAFE_APP_SECRET = (/^[\x00-\x7F]*$/.test(APP_SECRET) ? APP_SECRET : '');

  // ===== DOM =====
  const messagesEl = document.getElementById('messages');
  const inputEl = document.getElementById('input');
  const voiceBtn = document.getElementById('voiceBtn');
  const sendBtn = document.getElementById('send');
  const sessionEl = document.getElementById('session');
  const suggestionsEl = document.getElementById('suggestions');
  const clearBtn = document.getElementById('clear');
  const typingEl = document.getElementById('typing');
  const catalogEl = document.getElementById('catalog');

  const riasecQuizEl = document.getElementById('riasecQuiz');
  const riasecQuestionsEl = document.getElementById('riasecQuestions');
  const submitRiasecBtn = document.getElementById('submitRiasec');
  const closeRiasecBtn = document.getElementById('closeRiasec');

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
    '🎯Trắc nghiệm',
    '💰Học phí',
    '🏠Ký túc xá',
    '💼Việc làm',
    '📝Hồ sơ đăng ký',
    '🛠️Ngắn hạn',
    '🚗Học lái xe',
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
      ? (
        m.tuition_range_vnd_per_term[0] === m.tuition_range_vnd_per_term[1]
          ? fmtVND(m.tuition_range_vnd_per_term[0])
          : `${fmtVND(m.tuition_range_vnd_per_term[0])}–${fmtVND(m.tuition_range_vnd_per_term[1])}`
      )
      : 'Cập nhật sau';
    return `**${m.name} – ${m.level}**
- Nhóm nghề: ${m.career_group || '—'}
- Mô tả: ${m.description || '—'}
- Kỹ năng: ${(m.skills || []).slice(0, 6).join(', ') || '—'}
- Học phần: ${(m.core_modules || []).slice(0, 5).join(', ') || '—'}
- Cơ hội việc làm: ${(m.jobs || []).join(', ') || '—'}
- Thời gian: ~${m.duration_months || '—'} tháng
- Tuyển sinh: ${(m.admission?.target) || '—'}
- Học phí/kỳ: ${fee}
- Liên hệ: ${(m.contacts?.unit) || '—'} — ${(m.contacts?.phone) || ''}`.trim();
  }
  function injectMajorToChat(m) { addMessage('assistant', formatMajorBrief(m)); messagesEl.scrollTop = messagesEl.scrollHeight; inputEl.focus(); }
  function renderCatalogItems(items) {
    if (!catalogEl) return;
    if (!items || !items.length) { catalogEl.innerHTML = `<div class="card"><p>Chưa có dữ liệu ngành.</p></div>`; return; }
    catalogEl.innerHTML = `
  <div class="catalog-header">
    <h3>Danh mục ngành đào tạo</h3>
    <button type="button" class="catalog-close" title="Đóng danh mục">×</button>
  </div>
` + items.map(m => `

      <div class="card" data-slug="${m.slug}">
        <h4>${m.name} <small>— ${m.level}</small></h4>
        <div class="meta">Nhóm: ${m.career_group || '—'} · RIASEC: <span class="major-riasec">${(m.riasec || []).join(', ') || '—'}</span></div>
        <div class="desc">${(m.description || '').slice(0, 220)}${(m.description && m.description.length > 220 ? '...' : '')}</div>
        <div class="meta">Thời gian: ${m.duration_months || '—'} tháng</div>
        <div class="actions">
          <button class="btn primary" data-act="detail" data-slug="${m.slug}">Xem chi tiết</button>
          <button class="btn" data-act="ask" data-name="${m.name}">Hỏi thêm</button>
        </div>
      </div>`).join('');
    catalogEl.onclick = (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      if (btn.classList.contains('catalog-close')) {
        catalogEl.classList.add('hidden');
        return;
      }
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

  // ===== RIASEC Quiz =====
  const RIASEC_CACHE_KEY = 'riasec_questions_cache_v1';

  function readRiasecCache(maxAgeMs = 10 * 60 * 1000) {
    try {
      const raw = localStorage.getItem(RIASEC_CACHE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.t || !obj.data) return null;
      if (Date.now() - obj.t > maxAgeMs) return null;
      return obj.data;
    } catch {
      return null;
    }
  }

  function cacheRiasecQuestions(data) {
    try {
      localStorage.setItem(RIASEC_CACHE_KEY, JSON.stringify({ t: Date.now(), data }));
    } catch { }
  }

  async function fetchRiasecQuestions() {
    const cached = readRiasecCache();
    if (cached) return cached;

    const res = await fetch(`${API_BASE}/api/riasec/questions`);
    if (!res.ok) throw new Error('riasec_questions_fetch_failed');

    const data = await res.json();
    cacheRiasecQuestions(data);
    return data;
  }

  function groupRiasecQuestions(items = []) {
    const labels = {
      R: 'R – Kỹ thuật, thực hành',
      I: 'I – Nghiên cứu, phân tích',
      A: 'A – Sáng tạo, nghệ thuật',
      S: 'S – Xã hội, hỗ trợ',
      E: 'E – Kinh doanh, lãnh đạo',
      C: 'C – Tổ chức, quy trình'
    };

    const grouped = { R: [], I: [], A: [], S: [], E: [], C: [] };
    items.forEach(q => {
      if (grouped[q.group]) grouped[q.group].push(q);
    });

    return { labels, grouped };
  }

  function renderRiasecQuestions(items = []) {
    if (!riasecQuestionsEl) return;

    const { labels, grouped } = groupRiasecQuestions(items);

    const groupIcons = {
      R: '🔧',
      I: '🧪',
      A: '🎨',
      S: '👥',
      E: '💼',
      C: '📋'
    };

    const shortLabels = {
      R: 'Kỹ thuật',
      I: 'Nghiên cứu',
      A: 'Nghệ thuật',
      S: 'Xã hội',
      E: 'Quản lý',
      C: 'Nghiệp vụ'
    };

    riasecQuestionsEl.innerHTML = `
    <div class="riasec-tabs">
  ${Object.keys(grouped).map((group, index) => `
    <button class="riasec-tab ${index === 0 ? 'active' : ''}" type="button" data-group="${group}">
      <span>${groupIcons[group]}</span>
    <b>${group} - ${shortLabels[group]}</b>
    </button>
  `).join('')}
</div>

    ${Object.keys(grouped).map((group, index) => {
      const qs = grouped[group] || [];
      return `
        <div class="riasec-panel ${index === 0 ? 'active' : ''}" data-panel="${group}">
          <div class="riasec-panel-head">
            <div class="riasec-panel-icon">${groupIcons[group]}</div>
            <div>
              <h4>${labels[group]}</h4>
              <p>Chọn mức độ phù hợp với sở thích của bạn.</p>
            </div>
          </div>

          ${qs.map(q => `
            <div class="riasec-question" data-group="${q.group}" data-id="${q.id}">
              <div class="riasec-q-text">
                <span class="riasec-q-number">${q.id}</span>
                <span>${q.text.replaceAll('Em ', 'Bạn ').replaceAll(' em ', ' bạn ')}</span>
              </div>

              <div class="riasec-options">
                <label><input type="radio" name="q_${q.id}" value="1"> Rất không thích</label>
                <label><input type="radio" name="q_${q.id}" value="2"> Không thích</label>
                <label><input type="radio" name="q_${q.id}" value="3"> Bình thường</label>
                <label><input type="radio" name="q_${q.id}" value="4"> Thích</label>
                <label><input type="radio" name="q_${q.id}" value="5"> Rất thích</label>
              </div>
            </div>
          `).join('')}

           <div class="riasec-tip">
  💡 <b>Gợi ý:</b> Bạn nên chọn đúng cảm nhận của mình, không cần chọn theo ngành đang định học.
</div>

<div class="riasec-nav">
  ${index > 0
          ? `<button type="button" class="btn riasec-prev" data-prev="${Object.keys(grouped)[index - 1]}">← Quay về nhóm ${Object.keys(grouped)[index - 1]}</button>`
          : `<span></span>`
        }

  ${index < Object.keys(grouped).length - 1
          ? `<button type="button" class="btn primary riasec-next" data-next="${Object.keys(grouped)[index + 1]}">Tiếp tục nhóm ${Object.keys(grouped)[index + 1]} →</button>`
          : `<button type="button" class="btn primary riasec-next" data-next="submit">🎯 Xem kết quả</button>`
        }
</div>
<div class="riasec-status-row">
  <div class="riasec-current-group">
    Đang trả lời: ${labels[group]}
  </div>
</div>
        </div>
      `;
    }).join('')}
  `;

    riasecQuestionsEl.querySelectorAll('.riasec-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const group = tab.dataset.group;

        riasecQuestionsEl.querySelectorAll('.riasec-tab').forEach(t => t.classList.remove('active'));
        riasecQuestionsEl.querySelectorAll('.riasec-panel').forEach(p => p.classList.remove('active'));

        tab.classList.add('active');
        riasecQuestionsEl.querySelector(`.riasec-panel[data-panel="${group}"]`)?.classList.add('active');
        const currentGroupEl =
          document.getElementById('riasecCurrentGroup');

        const groupTitles = {
          R: 'R – Kỹ thuật, thực hành',
          I: 'I – Nghiên cứu, phân tích',
          A: 'A – Sáng tạo, nghệ thuật',
          S: 'S – Xã hội, hỗ trợ',
          E: 'E – Kinh doanh, lãnh đạo',
          C: 'C – Tổ chức, quy trình'
        };

        if (currentGroupEl) {
          currentGroupEl.textContent =
            `Đang trả lời: ${groupTitles[group]}`;
        }
      });
    });
    riasecQuestionsEl.querySelectorAll('.riasec-next').forEach(btn => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.next;

        if (next === 'submit') {
          submitRiasecResult();
          return;
        }

        riasecQuestionsEl.querySelector(`.riasec-tab[data-group="${next}"]`)?.click();

        const panel = riasecQuestionsEl.querySelector(`.riasec-panel[data-panel="${next}"]`);
        if (panel) {
          panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
    riasecQuestionsEl.querySelectorAll('.riasec-prev').forEach(btn => {
      btn.addEventListener('click', () => {
        const prev = btn.dataset.prev;

        riasecQuestionsEl.querySelector(`.riasec-tab[data-group="${prev}"]`)?.click();

        const panel = riasecQuestionsEl.querySelector(`.riasec-panel[data-panel="${prev}"]`);
        if (panel) {
          panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  async function openRiasecQuiz() {
    if (!riasecQuizEl) return;

    try {
      setTyping(true);
      if (catalogEl) catalogEl.classList.add('hidden');

      const data = await fetchRiasecQuestions();
      renderRiasecQuestions(data.items || []);

      riasecQuizEl.classList.remove('hidden');
      riasecQuizEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      addMessage('assistant', 'Chưa tải được bộ câu hỏi trắc nghiệm RIASEC. Hãy kiểm tra lại API `/api/riasec/questions` giúp tôi nhé.');
    } finally {
      setTyping(false);
    }
  }

  function calculateRiasecScores() {
    const scores = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
    const questions = riasecQuestionsEl?.querySelectorAll('.riasec-question') || [];
    let answered = 0;

    questions.forEach(qEl => {
      const group = qEl.dataset.group;
      const checked = qEl.querySelector('input[type="radio"]:checked');

      if (checked && scores[group] !== undefined) {
        scores[group] += Number(checked.value || 0);
        answered += 1;
      }
    });

    return {
      scores,
      answered,
      total: questions.length
    };
  }

  function formatRiasecResult(data) {
    const names = {
      R: 'Kỹ thuật, thực hành',
      I: 'Nghiên cứu, phân tích',
      A: 'Sáng tạo',
      S: 'Xã hội, hỗ trợ',
      E: 'Kinh doanh, lãnh đạo',
      C: 'Tổ chức, quy trình'
    };

    const scoreLines = Object.entries(data.scores || {})
      .map(([k, v]) => `- **${k} – ${names[k]}:** ${v} điểm`)
      .join('\n');

    const majorLines = (data.matchedMajors || [])
      .slice(0, 6)
      .map((m, index) => {
        return `${index + 1}. **${m.name}** (${m.level || ''})  
   - Nhóm phù hợp: ${(m.riasec || []).join('-')}  
   - Lý do: ${m.reason || 'Phù hợp với kết quả trắc nghiệm của bạn.'}`;
      })
      .join('\n\n');
    const nextSuggestions = (data.matchedMajors || [])
      .slice(0, 6)
      .map(m => `- ${m.name} (${m.level || ''})`)
      .join('\n');
    const top5 = (data.matchedMajors || [])
      .slice(0, 5)
      .map((m, index) => `${index + 1}. ${m.name} (${m.level || ''})`)
      .join('\n');

    return `## 🎯 Kết quả trắc nghiệm hướng nghiệp RIASEC

**Mã Holland/RIASEC của bạn:** ${data.code || '—'}

### Điểm từng nhóm
${scoreLines}

### Nhóm nổi bật
${(data.topGroups || []).map(g => `- **${g} – ${names[g]}**`).join('\n')}
### Nhận xét tư vấn
${data.advice || 'Bạn nên ưu tiên xem các ngành dài hạn trước, sau đó tham khảo thêm nghề ngắn hạn nếu cần.'}

### 🏆 Top 5 ngành phù hợp nhất
${top5 || 'Đang cập nhật'}

### Ngành/nghề phù hợp tại Trường Cao đẳng Miền Đông
${majorLines || 'Chưa tìm thấy ngành phù hợp. Bạn có thể hỏi thêm chatbot để được tư vấn kỹ hơn.'}

### Gợi ý tiếp theo

Bạn nên bấm **Xem chi tiết ngành** trong danh mục ngành, hoặc cho tôi biết bạn muốn tìm hiểu sâu hơn về hướng nào dưới đây:

${nextSuggestions || '- Một trong các ngành/nghề phù hợp được gợi ý ở trên'}

Tôi sẽ tư vấn ngành phù hợp nhất với kết quả ${data.code || ''} của bạn.`;
  }
  function showRiasecNotice(text) {
    let notice = document.getElementById('riasecNotice');

    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'riasecNotice';
      notice.className = 'riasec-notice';
      riasecQuizEl?.insertBefore(notice, riasecQuestionsEl);
    }

    notice.textContent = text;
    notice.style.display = 'block';

    clearTimeout(window.__riasecNoticeTimer);
    window.__riasecNoticeTimer = setTimeout(() => {
      notice.style.display = 'none';
    }, 3500);
  }

  async function submitRiasecResult() {
    const result = calculateRiasecScores();

    if (result.total === 0) {
      addMessage('assistant', 'Chưa có câu hỏi RIASEC để chấm điểm.');
      return;
    }

    if (result.answered < result.total) {
      riasecQuestionsEl?.querySelectorAll('.riasec-question.missing')
        .forEach(el => el.classList.remove('missing'));

      const firstMissing = [...(riasecQuestionsEl?.querySelectorAll('.riasec-question') || [])]
        .find(qEl => !qEl.querySelector('input[type="radio"]:checked'));

      if (firstMissing) {
        firstMissing.classList.add('missing');

        const group = firstMissing.dataset.group;
        riasecQuestionsEl.querySelector(`.riasec-tab[data-group="${group}"]`)?.click();

        setTimeout(() => {
          firstMissing.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 150);
      }

      showRiasecNotice(`Bạn còn câu chưa trả lời. Vui lòng hoàn thành câu được đánh dấu đỏ.`);
      return;
    }

    try {
      setTyping(true);

      const res = await fetch(`${API_BASE}/api/riasec/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          scores: result.scores
        })
      });

      if (!res.ok) {
        addMessage('assistant', `Lỗi chấm điểm RIASEC (${res.status}). Vui lòng thử lại.`);
        return;
      }

      const data = await res.json();

      if (riasecQuizEl) riasecQuizEl.classList.add('hidden');
      addMessage('assistant', formatRiasecResult(data));
    } catch {
      addMessage('assistant', 'Lỗi kết nối khi chấm điểm RIASEC. Vui lòng thử lại.');
    } finally {
      setTyping(false);
    }
  }
  let isSending = false;
  let currentAbortController = null;

  function setComposerState(sending) {
    isSending = sending;

    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = sending ? '■' : '▲';
      sendBtn.title = sending ? 'Dừng phản hồi' : 'Gửi câu hỏi';
      sendBtn.setAttribute('aria-label', sending ? 'Dừng phản hồi' : 'Gửi câu hỏi');
      sendBtn.classList.toggle('is-stop', sending);
    }

    if (clearBtn) {
      clearBtn.textContent = '↻';
      clearBtn.title = 'Cuộc trò chuyện mới';
      clearBtn.setAttribute('aria-label', 'Cuộc trò chuyện mới');
    }
  }

  // ===== Send message =====
  async function sendMessage() {
    if (isSending && currentAbortController) {
      currentAbortController.abort();
      return;
    }

    const text = (inputEl.value || '').trim();
    if (!text) return;

    inputEl.value = '';
    autosize(inputEl);
    addMessage('user', text);

    if (suggestionsEl) suggestionsEl.classList.add('hidden');

    currentAbortController = new AbortController();
    setComposerState(true);
    setTyping(true);

    try {
      const res = await fetch(`${API_BASE}/api/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(SAFE_APP_SECRET ? { 'x-app-key': SAFE_APP_SECRET } : {})
        },
        body: JSON.stringify({
          sessionId,
          userMessage: text,
          meta: { userAgent: navigator.userAgent }
        }),
        signal: currentAbortController.signal
      });

      if (!res.ok) {
        const t = await res.text().catch(() => '');
        addMessage('assistant', `Lỗi kết nối backend (${res.status}). ${t.slice(0, 180)}`);
        return;
      }

      const data = await res.json();
      addMessage('assistant', data.reply || '(không có phản hồi)');
    } catch (err) {
      if (err.name === 'AbortError') {
        addMessage('assistant', 'Đã dừng phản hồi.');
      } else {
        addMessage('assistant', 'Lỗi kết nối backend. Vui lòng thử lại.');
      }
    } finally {
      currentAbortController = null;
      setComposerState(false);
      setTyping(false);
      inputEl.focus();
    }
  }
  // ===== Voice input =====
  function setupVoiceInput() {
    if (!voiceBtn || !inputEl) return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      voiceBtn.style.display = 'none';
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'vi-VN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    let listening = false;

    voiceBtn.addEventListener('click', () => {
      try {
        if (listening) {
          recognition.stop();
          return;
        }

        recognition.start();
      } catch {
        // tránh lỗi khi bấm liên tục
      }
    });

    recognition.onstart = () => {
      listening = true;
      voiceBtn.classList.add('is-listening');
      voiceBtn.textContent = '●';
      voiceBtn.title = 'Đang nghe...';
    };

    recognition.onend = () => {
      listening = false;
      voiceBtn.classList.remove('is-listening');
      voiceBtn.textContent = '🎤';
      voiceBtn.title = 'Nhập bằng giọng nói';
    };

    recognition.onresult = (event) => {
      const text = event.results?.[0]?.[0]?.transcript || '';
      if (text) {
        inputEl.value = text;
        autosize(inputEl);
        inputEl.focus();
      }
    };
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
      // inputEl.value = q;
      if (q.includes('Trắc nghiệm')) { openRiasecQuiz(); return; }
      let query = q;
      if (q.includes('Học phí')) {
        query = 'Hãy tư vấn ngắn gọn, rõ ràng về học phí, chính sách miễn giảm học phí, hỗ trợ học phí, các khoản chi phí cần biết, học bổng và các đối tượng được hưởng khi học tại Trường Cao đẳng Miền Đông.';
      } else if (q.includes('Ký túc xá')) {
        query = 'Hãy giới thiệu ngắn gọn về ký túc xá của Trường Cao đẳng Miền Đông, số chỗ ở, điều kiện sinh hoạt, chi phí, đối tượng được ưu tiên và cách đăng ký';
      } else if (q.includes('Việc làm')) {
        query = 'Hãy tư vấn về cơ hội thực tập, việc làm sau tốt nghiệp, kết nối doanh nghiệp và cam kết hỗ trợ việc làm cho học sinh, sinh viên Trường Cao đẳng Miền Đông';
      } else if (q.includes('Ngắn hạn')) {
        query = 'Hãy giới thiệu các khóa đào tạo sơ cấp, nghề ngắn hạn và đào tạo lái xe của Trường Cao đẳng Miền Đông';
      } else if (q.includes('Hồ sơ đăng ký')) {
        query = 'Hãy hướng dẫn hồ sơ đăng ký xét tuyển, điều kiện tuyển sinh, cách đăng ký và quy trình nhập học tại Trường Cao đẳng Miền Đông';
      } else if (q.includes('Học lái xe')) {
        query = 'Hãy giới thiệu các khóa đào tạo lái xe, điều kiện đăng ký, hồ sơ, thời gian học và thông tin liên hệ tại Trường Cao đẳng Miền Đông';

      } else if (q.includes('Liên hệ')) {
        query = 'Hãy cung cấp thông tin liên hệ tuyển sinh của Trường Cao đẳng Miền Đông, gồm hotline, website đăng ký, địa chỉ và hướng dẫn cách để được tư vấn nhanh nhất';
      }
      inputEl.value = query;
      autosize(inputEl); sendMessage();
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearHistory(); if (suggestionsEl) suggestionsEl.classList.remove('hidden'); if (catalogEl) catalogEl.classList.add('hidden');
      addMessage('assistant', '<div class="welcome-message">Xin chào! Tôi là <b>Tư vấn viên AI của Trường Cao đẳng Miền Đông</b>. Bạn cần tư vấn về <i>ngành học</i>, <i>học phí</i>, <i>ký túc xá</i>, <i>điều kiện học tập</i>, <i>cơ hội việc làm</i> hay <i>trắc nghiệm chọn ngành phù hợp?</i></div>',
        true);
    });
  }

  if (submitRiasecBtn) {
    submitRiasecBtn.addEventListener('click', submitRiasecResult);
  }

  if (closeRiasecBtn) {
    closeRiasecBtn.addEventListener('click', () => {
      if (riasecQuizEl) riasecQuizEl.classList.add('hidden');
    });
  }

  // ===== Init =====
  ensureSuggestions();
  setupVoiceInput();
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

  // Ẩn/hiện thanh brand-bar khi cuộn trên mobile
  // const brandBar = document.querySelector('.brand-bar');

  // if (brandBar) {
  //   window.addEventListener('scroll', () => {
  //     if (window.innerWidth <= 640 && window.scrollY > 80) {
  //       brandBar.classList.add('brand-hide');
  //     } else {
  //       brandBar.classList.remove('brand-hide');
  //     }
  //   });
  // }
})();
