(() => {
  'use strict';

  const form = document.getElementById('emailForm');
  const fromInput = document.getElementById('from');
  const subjectInput = document.getElementById('subject');
  const emailsInput = document.getElementById('emails');
  const messageInput = document.getElementById('message');

  const dropzone = document.getElementById('dropzone');
  const browseBtn = document.getElementById('browseBtn');
  const fileInput = document.getElementById('fileInput');

  const emailStats = document.getElementById('emailStats');
  const invalidPreview = document.getElementById('invalidPreview');

  const tabEdit = document.getElementById('tabEdit');
  const tabPreview = document.getElementById('tabPreview');
  const preview = document.getElementById('preview');

  const sendBtn = document.getElementById('sendBtn');
  const statusCard = document.getElementById('statusCard');
  const statusTitle = document.getElementById('statusTitle');
  const statusCount = document.getElementById('statusCount');
  const statusDetail = document.getElementById('statusDetail');
  const progressFill = document.getElementById('progressFill');
  const resultBanner = document.getElementById('resultBanner');
  const modeBadge = document.getElementById('modeBadge');

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // ------------------------------------------------------------------
  // Validação / estatísticas da lista de e-mails
  // ------------------------------------------------------------------
  function analyzeEmails(raw) {
    const tokens = raw.split(/[,;\n\r]+/).map((s) => s.trim()).filter(Boolean);
    const seen = new Set();
    const valid = [];
    const invalid = [];
    let duplicates = 0;

    for (const token of tokens) {
      const key = token.toLowerCase();
      if (seen.has(key)) { duplicates++; continue; }
      seen.add(key);
      if (EMAIL_REGEX.test(token)) valid.push(token);
      else invalid.push(token);
    }

    return { total: tokens.length, valid, invalid, duplicates };
  }

  function renderStats() {
    const { valid, invalid, duplicates } = analyzeEmails(emailsInput.value);
    const totalUnique = valid.length + invalid.length;

    if (totalUnique === 0) {
      emailStats.innerHTML = '';
      invalidPreview.hidden = true;
      return;
    }

    const chips = [`<span class="chip total">${totalUnique} no total</span>`];
    if (valid.length) chips.push(`<span class="chip valid">${valid.length} válidos</span>`);
    if (invalid.length) chips.push(`<span class="chip invalid">${invalid.length} inválidos</span>`);
    if (duplicates) chips.push(`<span class="chip dup">${duplicates} duplicados removidos</span>`);
    emailStats.innerHTML = chips.join('');

    if (invalid.length) {
      const sample = invalid.slice(0, 5).join(', ');
      const extra = invalid.length > 5 ? ` e mais ${invalid.length - 5}` : '';
      invalidPreview.hidden = false;
      invalidPreview.textContent = `Endereços inválidos (serão ignorados no envio): ${sample}${extra}`;
    } else {
      invalidPreview.hidden = true;
    }
  }

  emailsInput.addEventListener('input', renderStats);

  // ------------------------------------------------------------------
  // Importação de arquivo .csv / .txt (drag & drop ou seleção)
  // ------------------------------------------------------------------
  function mergeEmailsFromText(text) {
    const incoming = text.split(/[,;\n\r]+/).map((s) => s.trim()).filter(Boolean);
    const current = emailsInput.value.split(/[,;\n\r]+/).map((s) => s.trim()).filter(Boolean);
    const seen = new Set(current.map((e) => e.toLowerCase()));
    const merged = current.slice();

    for (const email of incoming) {
      const key = email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(email);
    }

    emailsInput.value = merged.join(', ');
    renderStats();
  }

  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => mergeEmailsFromText(String(reader.result || ''));
    reader.readAsText(file);
  }

  browseBtn.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('click', (e) => { if (e.target === dropzone) fileInput.click(); });
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));

  ['dragenter', 'dragover'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); });
  });
  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    handleFile(file);
  });

  // ------------------------------------------------------------------
  // Editar / Pré-visualizar mensagem
  // ------------------------------------------------------------------
  function showEdit() {
    tabEdit.classList.add('active'); tabEdit.setAttribute('aria-selected', 'true');
    tabPreview.classList.remove('active'); tabPreview.setAttribute('aria-selected', 'false');
    messageInput.hidden = false;
    preview.hidden = true;
  }

  function showPreview() {
    tabPreview.classList.add('active'); tabPreview.setAttribute('aria-selected', 'true');
    tabEdit.classList.remove('active'); tabEdit.setAttribute('aria-selected', 'false');
    const doc = preview.contentDocument;
    doc.open();
    doc.write(messageInput.value || '<p style="font-family:sans-serif;color:#888">Nada para pré-visualizar ainda.</p>');
    doc.close();
    messageInput.hidden = true;
    preview.hidden = false;
  }

  tabEdit.addEventListener('click', showEdit);
  tabPreview.addEventListener('click', showPreview);

  // ------------------------------------------------------------------
  // Envio com progresso via streaming NDJSON
  // ------------------------------------------------------------------
  function setSending(isSending) {
    sendBtn.disabled = isSending;
    sendBtn.querySelector('.btn-label').hidden = isSending;
    sendBtn.querySelector('.btn-spinner').hidden = !isSending;
  }

  function updateProgress(sent, total) {
    const ratio = total > 0 ? sent / total : 0;
    progressFill.style.transform = `scaleX(${ratio})`;
    statusCount.textContent = `${sent} / ${total}`;
  }

  function showResult(success, text) {
    resultBanner.hidden = false;
    resultBanner.textContent = text;
    resultBanner.className = 'result-banner ' + (success ? 'success' : 'error');
  }

  async function submitForm(event) {
    event.preventDefault();

    const { valid } = analyzeEmails(emailsInput.value);
    if (valid.length === 0) {
      renderStats();
      emailsInput.focus();
      return;
    }

    setSending(true);
    statusCard.hidden = false;
    resultBanner.hidden = true;
    statusTitle.textContent = 'Enviando...';
    statusDetail.textContent = 'Conectando ao servidor de e-mail...';
    updateProgress(0, valid.length);
    statusCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    const payload = {
      from: fromInput.value.trim(),
      subject: subjectInput.value.trim(),
      emails: emailsInput.value,
      message: messageInput.value
    };

    try {
      const response = await fetch('/send_emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const contentType = response.headers.get('Content-Type') || '';

      if (!response.ok || contentType.includes('application/json')) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Falha no envio (HTTP ${response.status}).`);
      }

      if (!response.body || !response.body.getReader) {
        throw new Error('Este navegador não suporta leitura de progresso em tempo real.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finished = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (!line) continue;

          let event;
          try { event = JSON.parse(line); } catch (e) { continue; }

          if (event.type === 'start') {
            updateProgress(0, event.total);
            statusDetail.textContent = `0 de ${event.totalBatches} lotes enviados.`;
            if (event.invalidCount) {
              statusDetail.textContent += ` (${event.invalidCount} endereço(s) inválido(s) ignorado(s))`;
            }
          } else if (event.type === 'progress') {
            updateProgress(event.sent, event.total);
            statusDetail.textContent = `Lote ${event.batch} de ${event.totalBatches} enviado.`;
          } else if (event.type === 'error') {
            finished = true;
            statusTitle.textContent = 'Envio interrompido';
            showResult(false, `Erro: ${event.message} (${event.sentBeforeError} e-mail(s) já haviam sido enviados antes da falha)`);
          } else if (event.type === 'done') {
            finished = true;
            statusTitle.textContent = 'Envio concluído';
            updateProgress(event.sent, event.sent);
            statusDetail.textContent = 'Todos os lotes foram processados.';
            showResult(true, `${event.sent} e-mail(s) enviados com sucesso.`);
          }
        }
      }

      if (!finished) {
        statusTitle.textContent = 'Conexão encerrada';
        showResult(false, 'A conexão foi encerrada antes da confirmação final. Verifique sua caixa de saída.');
      }
    } catch (err) {
      statusTitle.textContent = 'Falha no envio';
      showResult(false, err.message || 'Erro desconhecido ao enviar.');
    } finally {
      setSending(false);
    }
  }

  form.addEventListener('submit', submitForm);

  // ------------------------------------------------------------------
  // Indicador de modo de teste (definido pelo servidor via meta tag opcional)
  // ------------------------------------------------------------------
  fetch('/health').then((r) => r.json()).then((data) => {
    if (data && data.testMode) modeBadge.hidden = false;
  }).catch(() => {});
})();
