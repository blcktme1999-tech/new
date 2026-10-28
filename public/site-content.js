'use strict';

const HOME_LIMIT = 4;
const TABS = { breaking: 'tab01', clarification: 'tab02', notice: 'tab03', crime: 'tab04' };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function pathKey(value) {
  return String(value || '').replace(/\/+$/, '').replace(/\.html$/, '');
}

function samePath(left, right) {
  return pathKey(left) === pathKey(right);
}

function byOrder(left, right) {
  return left.sortOrder - right.sortOrder || String(left.id).localeCompare(String(right.id));
}

function categoryOf(pathname) {
  const path = pathKey(pathname);
  if (path.endsWith('/breaking-news')) return 'breaking';
  if (path.endsWith('/clarifications')) return 'clarification';
  if (path.endsWith('/notices')) return 'notice';
  if (path.endsWith('/crime-methods')) return 'crime';
  return '';
}

function isHome(pathname) {
  const path = pathKey(pathname);
  return path === '' || path === '/' || path.endsWith('/index');
}

function phoneHref(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits ? `tel:${digits}` : '';
}

function mapHref(contact) {
  if (contact.mapUrl) return contact.mapUrl;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address)}`;
}

function walkText(node, visitor) {
  if (node.nodeType === Node.ELEMENT_NODE && /^(SCRIPT|STYLE|TEXTAREA|NOSCRIPT)$/.test(node.tagName)) return;
  if (node.nodeType === Node.TEXT_NODE) visitor(node);
  else [...node.childNodes].forEach((child) => walkText(child, visitor));
}

function applyContact(contact) {
  walkText(document.body, (node) => {
    const text = node.textContent || '';
    if (text.length > 180) return;
    if (/地址\s*[:：]/.test(text)) node.textContent = text.replace(/地址\s*[:：][^\n]*/, `地址：${contact.address}`);
    if (/服務電話\s*[:：]/.test(text) && !/檢舉/.test(text)) {
      const label = /偵防/.test(text) ? '偵防中心服務電話' : '服務電話';
      node.textContent = text.replace(/((?:偵防中心)?服務電話)\s*[:：][^\n]*/, `${label}：${contact.servicePhone}`);
    }
  });
  document.querySelectorAll('a').forEach((link) => {
    const label = `${link.getAttribute('title') || ''} ${link.textContent || ''}`;
    if (!/Map|地圖/.test(label)) return;
    link.href = mapHref(contact);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  });
  document.querySelectorAll('p, li, div, td').forEach((element) => {
    const text = element.textContent || '';
    if (text.length > 400 || !/檢舉電話\s*[:：]/.test(text)) return;
    if ([...element.children].some((child) => /檢舉電話\s*[:：]/.test(child.textContent || ''))) return;
    const links = [...element.querySelectorAll('a[href^="tel:"]')].filter((link) => link.getAttribute('href') !== 'tel:110');
    (contact.reportPhones || []).forEach((phone, index) => {
      const link = links[index];
      if (!link) return;
      link.textContent = phone;
      link.href = phoneHref(phone);
    });
  });
}

function applyUnitEmail(units) {
  const unit = units.find((item) => samePath(location.pathname, item.path));
  let slot = document.querySelector('[data-site-unit-email]');
  if (!unit?.email) {
    slot?.remove();
    return;
  }
  if (!slot) {
    slot = document.createElement('p');
    slot.dataset.siteUnitEmail = '1';
    slot.style.cssText = 'margin:16px;padding:12px 16px;background:#f4f7fb;border-left:4px solid #0b4f8a;color:#16325c;font-size:16px;line-height:1.6;';
    const footer = document.querySelector('footer');
    if (footer?.parentNode) footer.parentNode.insertBefore(slot, footer);
    else document.body.appendChild(slot);
  }
  slot.innerHTML = `電子信箱：<a href="mailto:${escapeHtml(unit.email)}">${escapeHtml(unit.email)}</a>`;
}

function homeItem(item) {
  const href = escapeHtml(item.path);
  const title = escapeHtml(item.title);
  return `<li><a href="${href}" title="${title}"><p class="color01">${escapeHtml(item.publishedOn)}</p><p class="color02">${escapeHtml(item.publisher)}</p><p class="item">${title}</p></a></li>`;
}

function listItem(item, index) {
  const href = escapeHtml(item.path);
  const title = escapeHtml(item.title);
  if (document.querySelector('ul.news-index')) {
    return `<li><a href="${href}"><span>${escapeHtml(item.publishedOn)}</span>${title}</a></li>`;
  }
  return `<li><a href="${href}" title="${title}"><div class="info"><p class="color02">發布日期：${escapeHtml(item.publishedOn)}</p><p class="color01">發布單位：${escapeHtml(item.publisher)}</p></div><p class="subject">${index + 1}.${title}</p></a></li>`;
}

function applyNews(news) {
  if (!Array.isArray(news) || !news.length) return;
  if (isHome(location.pathname)) {
    Object.entries(TABS).forEach(([category, tab]) => {
      const list = document.querySelector(`#${tab} .news ul`);
      if (!list) return;
      const visible = news.filter((item) => item.category === category).sort(byOrder).slice(0, HOME_LIMIT);
      list.innerHTML = visible.map(homeItem).join('');
    });
    return;
  }
  const category = categoryOf(location.pathname);
  if (!category) return;
  const list = document.querySelector('ul.news-index') || document.querySelector('a[id^="listImageNum"]')?.closest('ul');
  if (!list) return;
  const visible = news.filter((item) => item.category === category).sort(byOrder);
  list.innerHTML = visible.map(listItem).join('');
}

function articleBody(item) {
  const text = escapeHtml(item.body).split('\n').map((line) => `<p>${line || '&nbsp;'}</p>`).join('');
  const images = (item.images || []).map((url) => `<p><img src="${escapeHtml(url)}" alt=""></p>`).join('');
  return text + images;
}

function applyArticle(news) {
  const view = document.querySelector('[data-article-view]');
  if (view) {
    const id = new URLSearchParams(location.search).get('id');
    const item = news.find((entry) => entry.id === id);
    if (!item) {
      view.innerHTML = '<p>找不到這則新聞。</p>';
      return;
    }
    document.title = item.title;
    view.innerHTML = `<p class="meta">${escapeHtml(item.publishedOn)}　${escapeHtml(item.publisher)}</p><h1>${escapeHtml(item.title)}</h1><div class="body">${articleBody(item)}</div>`;
    return;
  }
  const item = news.find((entry) => entry.legacyPath && samePath(location.pathname, entry.legacyPath));
  if (!item) return;
  const title = document.querySelector('.d_title');
  if (title) title.textContent = item.title;
  document.querySelectorAll('p').forEach((element) => {
    const text = element.textContent || '';
    if (text.length > 120) return;
    if (text.includes('發布日期')) element.textContent = `發布日期：${item.publishedOn}`;
    if (text.includes('更新日期')) element.textContent = `更新日期：${item.updatedOn || item.publishedOn}`;
    if (text.includes('發布單位')) element.textContent = `發布單位：${item.publisher}`;
  });
  if (!item.customized) return;
  const body = document.querySelector('.editor') || document.querySelector('.d_sub');
  if (body) body.innerHTML = articleBody(item);
}

async function applySiteContent() {
  let payload;
  try {
    const response = await fetch('/api/site-content', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) return;
    payload = await response.json();
  } catch (_error) {
    return;
  }
  if (!payload || typeof payload !== 'object') return;
  if (payload.contact) applyContact(payload.contact);
  if (Array.isArray(payload.units)) applyUnitEmail(payload.units);
  if (Array.isArray(payload.news)) {
    applyNews(payload.news);
    applyArticle(payload.news);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { applySiteContent(); });
else applySiteContent();
