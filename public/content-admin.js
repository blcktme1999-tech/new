'use strict';

const state = { content: null, editing: null, images: [] };
const $ = (selector, root = document) => root.querySelector(selector);

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '操作失敗');
  return data;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function rocToday() {
  const date = new Date();
  return `${date.getFullYear() - 1911}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function show(selector) { $(selector)?.classList.remove('hidden'); }
function hide(selector) { $(selector)?.classList.add('hidden'); }

function status(text, isError) {
  const node = $('#status');
  node.textContent = text || '';
  node.className = isError ? 'status error' : 'status';
}

function render() {
  const content = state.content;
  if (!content) return;
  $('#address').value = content.contact.address || '';
  $('#mapUrl').value = content.contact.mapUrl || '';
  $('#servicePhone').value = content.contact.servicePhone || '';
  $('#reportPhonePrimary').value = content.contact.reportPhones?.[0] || '';
  $('#reportPhoneSecondary').value = content.contact.reportPhones?.[1] || '';
  const emails = $('#unitEmails');
  emails.innerHTML = content.units.map((unit) => `<label>${escapeHtml(unit.name)}<input data-unit="${escapeHtml(unit.key)}" type="email" value="${escapeHtml(unit.email)}" placeholder="name@example.com" autocomplete="off"></label>`).join('');
  const news = $('#newsBoard');
  news.innerHTML = content.categories ? '' : '';
  const categories = [
    ['breaking', '破案快訊'],
    ['clarification', '即時新聞澄清'],
    ['notice', '公告事項'],
    ['crime', '最新犯罪手法']
  ];
  news.innerHTML = categories.map(([key, label]) => {
    const items = content.news.filter((item) => item.category === key).sort((a, b) => a.sortOrder - b.sortOrder);
    const rows = items.map((item, index) => `<li><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.publishedOn)}　${index < 4 ? '首頁' : '列表後面'}</span></div><div class="row-actions"><button type="button" data-move="up" data-id="${escapeHtml(item.id)}">上移</button><button type="button" data-move="down" data-id="${escapeHtml(item.id)}">下移</button><button type="button" data-edit="${escapeHtml(item.id)}">編輯</button><button type="button" data-delete="${escapeHtml(item.id)}">刪除</button></div></li>`).join('');
    return `<section class="news-column"><header><h2>${label}</h2><button type="button" data-add="${key}">新增</button></header><ol>${rows || '<li class="empty">這個分類還沒有新聞</li>'}</ol></section>`;
  }).join('');
}

function openEditor(item) {
  state.editing = item;
  state.images = [...(item.images || [])];
  $('#editorTitle').textContent = item.id ? '編輯新聞' : '新增新聞';
  $('#newsCategory').value = item.category;
  $('#newsTitle').value = item.title || '';
  $('#newsPublished').value = item.publishedOn || rocToday();
  $('#newsUpdated').value = item.updatedOn || item.publishedOn || rocToday();
  $('#newsPublisher').value = item.publisher || '刑事警察局公共關係室';
  $('#newsBody').value = item.body || '';
  renderImages();
  $('#editor').showModal();
  $('#newsTitle').focus();
}

function renderImages() {
  $('#newsImages').innerHTML = state.images.map((url, index) => `<figure><img src="${escapeHtml(url)}" alt=""><button type="button" data-remove-image="${index}">移除</button></figure>`).join('') || '<p class="muted">尚未上傳照片</p>';
}

async function loadContent() {
  state.content = await api('/api/site-content');
  render();
}

async function saveContact(event) {
  event.preventDefault();
  status('儲存中…');
  try {
    state.content = await api('/api/site-content', { method: 'PUT', body: JSON.stringify({
      contact: {
        address: $('#address').value,
        mapUrl: $('#mapUrl').value,
        servicePhone: $('#servicePhone').value,
        reportPhones: [$('#reportPhonePrimary').value, $('#reportPhoneSecondary').value]
      },
      units: [...$('#unitEmails').querySelectorAll('[data-unit]')].map((input) => ({ key: input.dataset.unit, email: input.value }))
    }) });
    render();
    status('聯絡資料已更新');
  } catch (error) {
    status(error.message, true);
  }
}

async function newsAction(body) {
  status('處理中…');
  state.content = await api('/api/site-news', { method: 'POST', body: JSON.stringify(body) });
  render();
  status('新聞已更新');
}

async function uploadImages(files) {
  for (const file of files) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('無法讀取圖片'));
      reader.readAsDataURL(file);
    });
    const result = await api('/api/site-news', { method: 'POST', body: JSON.stringify({ action: 'image', dataUrl }) });
    state.images.push(result.url);
  }
  renderImages();
}

$('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  status('');
  try {
    await api('/api/staff/login', { method: 'POST', body: JSON.stringify({ username: $('#username').value, password: $('#password').value }) });
    const me = await api('/api/me');
    if (me.user?.role !== 'admin') throw new Error('這個內容後台需要管理員帳號');
    hide('#loginPanel');
    show('#workspace');
    $('#logoutButton').classList.remove('hidden');
    $('#who').textContent = me.user.displayName || me.user.username;
    await loadContent();
  } catch (error) {
    status(error.message, true);
  }
});

$('#logoutButton').addEventListener('click', async () => {
  await api('/api/staff/logout', { method: 'POST', body: '{}' }).catch(() => {});
  location.reload();
});

$('#contactForm').addEventListener('submit', saveContact);
$('#newsBoard').addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  try {
    if (button.dataset.add) return openEditor({ category: button.dataset.add, images: [] });
    if (button.dataset.edit) return openEditor(state.content.news.find((item) => item.id === button.dataset.edit));
    if (button.dataset.delete) {
      const item = state.content.news.find((entry) => entry.id === button.dataset.delete);
      if (!item || !window.confirm(`刪除「${item.title}」？`)) return;
      await newsAction({ action: 'delete', id: item.id });
      return;
    }
    if (button.dataset.move) await newsAction({ action: 'move', id: button.dataset.id, direction: button.dataset.move });
  } catch (error) {
    status(error.message, true);
  }
});

$('#newsForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await newsAction({
      action: state.editing?.id ? 'update' : 'create',
      id: state.editing?.id,
      category: $('#newsCategory').value,
      title: $('#newsTitle').value,
      publishedOn: $('#newsPublished').value,
      updatedOn: $('#newsUpdated').value,
      publisher: $('#newsPublisher').value,
      body: $('#newsBody').value,
      images: state.images
    });
    $('#editor').close();
  } catch (error) {
    status(error.message, true);
  }
});

$('#newsPhotos').addEventListener('change', async (event) => {
  const files = [...event.target.files];
  event.target.value = '';
  if (!files.length) return;
  try {
    status('上傳照片中…');
    await uploadImages(files);
    status('照片已加入，請按儲存新聞');
  } catch (error) {
    status(error.message, true);
  }
});

$('#newsImages').addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove-image]');
  if (!button) return;
  state.images.splice(Number(button.dataset.removeImage), 1);
  renderImages();
});

$('#closeEditor').addEventListener('click', () => $('#editor').close());

api('/api/me').then((me) => {
  if (me.user?.role !== 'admin') return;
  hide('#loginPanel');
  show('#workspace');
  $('#logoutButton').classList.remove('hidden');
  $('#who').textContent = me.user.displayName || me.user.username;
  return loadContent();
}).catch((error) => status(error.message, true));
