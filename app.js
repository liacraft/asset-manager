const { createClient } = window.supabase;
const config = window.SUPABASE_CONFIG || {};

if (!config.url || !config.publishableKey || config.url.includes('YOUR_PROJECT_REF') || config.publishableKey.includes('YOUR_SUPABASE')) {
  console.warn('DesignHub: fill in config.js before using Supabase.');
}

const sb = createClient(config.url || 'https://placeholder.supabase.co', config.publishableKey || 'placeholder', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const BUCKET = 'design-assets';
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
let designs = [];
let currentUser = null;
let selectedFile = null;
let publicMode = false;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[char]));
const formatDate = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—';
const formatBytes = bytes => {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
};
const statusClass = status => ({ 'Approved':'approved', 'Ready for Review':'review', 'In Progress':'progress', 'Need Revision':'revision', 'New':'new' }[status] || '');
const statusOptions = ['', 'New', 'In Progress', 'Ready for Review', 'Need Revision', 'Approved'];

function getShareUrl(d) {
  return `${window.location.origin}${window.location.pathname}?share=${encodeURIComponent(d.share_token)}`;
}

function getFileUrl(d) {
  if (d.file_url) return d.file_url;
  if (!d.storage_path) return '';
  return sb.storage.from(BUCKET).getPublicUrl(d.storage_path).data.publicUrl;
}

function setAuthScreen(visible) {
  $('#authScreen').classList.toggle('hidden', !visible);
  $('#appLoading').classList.add('hidden');
}

function setIdentity(user) {
  const email = user?.email || 'Admin';
  const name = email.split('@')[0] || 'Admin';
  const initials = name.split(/[._-]/).filter(Boolean).slice(0,2).map(x => x[0]).join('').toUpperCase() || 'AD';
  $('#profileName').textContent = name;
  $('#topName').textContent = email;
  $('#profileAvatar').textContent = initials;
  $('#topAvatar').textContent = initials;
  $('#greetingTitle').textContent = `Good afternoon, ${name}`;
}

function renderCard(d) {
  const image = getFileUrl(d);
  const visual = image
    ? `<img src="${esc(image)}" alt="${esc(d.name)}" loading="lazy">`
    : `<div class="thumb-art placeholder-art"></div>`;
  return `<article class="design-card" data-id="${esc(d.id)}">
    <div class="thumb">${visual}<button class="thumb-action share-mini" data-id="${esc(d.id)}" title="Share"><i class="fa-solid fa-arrow-up-right-from-square"></i></button></div>
    <div class="card-body"><div class="card-name">${esc(d.name)}</div><div class="card-meta">${esc(d.requester)} · ${formatDate(d.request_date)}</div>
    <div class="card-bottom"><span class="tag">${esc(d.purpose)}</span><span class="status ${statusClass(d.status)}">${esc(d.status)}</span></div></div>
  </article>`;
}

function renderRecent() {
  $('#recentGrid').innerHTML = designs.slice(0, 6).map(renderCard).join('') || `<div class="empty" style="grid-column:1/-1;min-height:260px"><div class="empty-icon"><i class="fa-regular fa-images"></i></div><h2>No designs yet</h2><p>Add your first design asset.</p></div>`;
}

function filteredDesigns() {
  const q = ($('#search')?.value || '').trim().toLowerCase();
  const status = $('#statusFilter')?.value || '';
  const purpose = $('#purposeFilter')?.value || '';
  return designs.filter(d => {
    const haystack = [d.name, d.requester, d.purpose, d.status, d.folder].join(' ').toLowerCase();
    return (!q || haystack.includes(q)) && (!status || d.status === status) && (!purpose || d.purpose === purpose);
  });
}

function renderLibrary() {
  const data = filteredDesigns();
  $('#resultCount').textContent = `${data.length} design${data.length !== 1 ? 's' : ''}`;
  $('#libraryGrid').innerHTML = data.map(renderCard).join('') || `<div class="empty" style="grid-column:1/-1;min-height:300px"><div class="empty-icon"><i class="fa-solid fa-magnifying-glass"></i></div><h2>No designs found</h2><p>Try changing your search or filters.</p></div>`;
  $('#libraryList').innerHTML = `<table class="list-table"><thead><tr><th>Preview</th><th>Design</th><th>Requester</th><th>Purpose</th><th>Request Date</th><th>Status</th></tr></thead><tbody>${data.map(d => `<tr class="list-row" data-id="${esc(d.id)}"><td><div class="list-preview">${getFileUrl(d) ? `<img src="${esc(getFileUrl(d))}" alt="">` : '<div class="thumb-art placeholder-art"></div>'}</div></td><td><span class="list-name">${esc(d.name)}</span><div style="font-size:8px;color:#98A2B3;margin-top:3px">${esc(d.file_name || 'No file')}</div></td><td>${esc(d.requester)}</td><td>${esc(d.purpose)}</td><td>${formatDate(d.request_date)}</td><td><span class="status ${statusClass(d.status)}">${esc(d.status)}</span></td></tr>`).join('')}</tbody></table>`;
}

function renderAttention() {
  const items = designs.filter(d => d.status === 'Need Revision');
  $('#attentionList').innerHTML = items.slice(0, 6).map(d => `<div class="attention-item" data-id="${esc(d.id)}"><div class="attention-title"><span class="status revision">Need Revision</span> ${esc(d.name)}</div><div class="attention-desc">“${esc(d.last_feedback || 'Revision requested by reviewer.')}”</div><div class="attention-time">${esc(d.requester)} · ${formatDate(d.request_date)}</div></div>`).join('') || `<div class="empty" style="min-height:220px"><div class="empty-icon"><i class="fa-regular fa-circle-check"></i></div><h2>Nothing needs attention</h2><p>New reviewer feedback will appear here.</p></div>`;
}

async function renderNotifications() {
  const { data, error } = await sb.from('notifications').select('id, design_id, type, title, message, is_read, created_at').order('created_at', { ascending:false }).limit(6);
  if (error) return console.error(error);
  const unread = data.filter(x => !x.is_read).length;
  $('#notifBtn em').textContent = unread;
  $('#notifBtn em').classList.toggle('hidden', unread === 0);
  $('#notificationList').innerHTML = data.map(n => `<div class="notif-item" data-id="${esc(n.design_id)}" data-notification="${esc(n.id)}"><i class="fa-solid ${n.type === 'revision_requested' ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i><div><b>${esc(n.title)}</b><p>${esc(n.message || 'No comment provided.')}</p><small>${new Date(n.created_at).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</small></div></div>`).join('') || `<div class="empty" style="min-height:160px"><p>No notifications.</p></div>`;
  $('#notificationPanel .notif-head span').textContent = `${unread} new`;
}

function renderStats() {
  const counts = designs.reduce((acc, d) => { acc[d.status] = (acc[d.status] || 0) + 1; return acc; }, {});
  $('#revisionCount').textContent = counts['Need Revision'] || 0;
  const progress = counts['In Progress'] || 0;
  const approved = counts['Approved'] || 0;
  const total = designs.length;
  const statCards = $$('.stat');
  if (statCards[0]) statCards[0].querySelector('strong').textContent = total;
  if (statCards[1]) statCards[1].querySelector('strong').textContent = progress;
  if (statCards[3]) statCards[3].querySelector('strong').textContent = approved;
  const totalBytes = designs.reduce((sum, d) => sum + (Number(d.file_size) || 0), 0);
  const gb = 1024 * 1024 * 1024;
  const usedPercent = Math.min(100, totalBytes / gb * 100);
  $('.storage-top span').textContent = `${formatBytes(totalBytes)} / 1 GB`;
  $('.storage-bar span').style.width = `${Math.max(2, usedPercent)}%`;
  $('.storage small').textContent = `${formatBytes(Math.max(0, gb - totalBytes))} available`;
}

function showView(view) {
  $$('.view').forEach(x => x.classList.add('hidden'));
  $$('.nav-item').forEach(x => x.classList.toggle('active', x.dataset.view === view));
  if (view === 'dashboard') {
    $('#dashboardView').classList.remove('hidden'); $('#pageTitle').textContent = 'Dashboard';
  } else if (view === 'library') {
    $('#libraryView').classList.remove('hidden'); $('#pageTitle').textContent = 'Design Library'; renderLibrary();
  } else if (view === 'shared') {
    $('#otherView').classList.remove('hidden'); $('#pageTitle').textContent = 'Shared'; $('#otherTitle').textContent = 'Shared'; $('#otherDesc').textContent = 'Designs currently available through public links.'; $('#emptyTitle').textContent = 'Use the Share action'; $('#emptyText').textContent = 'Shared designs are marked public and keep the same stable share link.';
  } else if (view === 'folders') {
    $('#otherView').classList.remove('hidden'); $('#pageTitle').textContent = 'Folders'; $('#otherTitle').textContent = 'Folders'; $('#otherDesc').textContent = 'Organize assets by campaign or project.'; $('#emptyTitle').textContent = 'Folder management'; $('#emptyText').textContent = 'Folder CRUD can be added after the core asset workflow is stable.';
  } else if (view === 'trash') {
    $('#otherView').classList.remove('hidden'); $('#pageTitle').textContent = 'Trash'; $('#otherTitle').textContent = 'Trash'; $('#otherDesc').textContent = 'Deleted assets are kept here temporarily.'; $('#emptyTitle').textContent = 'Trash is ready'; $('#emptyText').textContent = 'Soft-delete is reserved for the next iteration.';
  }
}

async function loadDesigns() {
  const { data, error } = await sb.from('designs').select('*').is('deleted_at', null).order('request_date', { ascending:false }).order('created_at', { ascending:false });
  if (error) throw error;
  designs = data || [];
  renderRecent(); renderLibrary(); renderAttention(); renderStats();
  await renderNotifications();
}

function openDrawer(id) {
  const d = designs.find(x => x.id === id); if (!d) return;
  const image = getFileUrl(d);
  $('#drawerTitle').textContent = d.name;
  $('#drawerBody').innerHTML = `<div class="drawer-preview">${image ? `<img src="${esc(image)}" alt="${esc(d.name)}">` : '<div class="thumb-art placeholder-art"></div>'}</div>
    <span class="status ${statusClass(d.status)}">${esc(d.status)}</span>
    <div class="detail-section"><div class="detail-row"><span class="detail-label">Requester</span><span class="detail-value">${esc(d.requester)}</span></div><div class="detail-row"><span class="detail-label">Purpose</span><span class="detail-value">${esc(d.purpose)}</span></div><div class="detail-row"><span class="detail-label">Request date</span><span class="detail-value">${formatDate(d.request_date)}</span></div><div class="detail-row"><span class="detail-label">Folder</span><span class="detail-value">${esc(d.folder || '—')}</span></div><div class="detail-row"><span class="detail-label">Description</span><span class="detail-value">${esc(d.description || '—')}</span></div></div>
    ${d.last_feedback ? `<div class="feedback-box"><b><i class="fa-solid fa-comment-dots"></i> Review Feedback</b><p>${esc(d.last_feedback)}</p></div>` : ''}
    <div class="detail-section"><b style="font-size:10px">Asset</b><div class="detail-row"><span class="detail-label">File</span><span class="detail-value">${esc(d.file_name || '—')}</span></div><div class="detail-row"><span class="detail-label">Size</span><span class="detail-value">${formatBytes(d.file_size)}</span></div><div class="detail-row"><span class="detail-label">Dimensions</span><span class="detail-value">${d.width && d.height ? `${d.width} × ${d.height} px` : '—'}</span></div></div>
    <div class="action-row"><button class="secondary-btn preview-btn" data-id="${esc(d.id)}">Preview</button><button class="secondary-btn download-btn" data-id="${esc(d.id)}">Download</button><button class="primary-btn share-btn" data-id="${esc(d.id)}">Share Link</button></div>`;
  $('#backdrop').classList.remove('hidden'); $('#drawer').classList.add('open');
}

function closeDrawer() { $('#backdrop').classList.add('hidden'); $('#drawer').classList.remove('open'); }

async function openShare(id) {
  const d = designs.find(x => x.id === id); if (!d) return;
  if (!d.is_public) {
    const { data, error } = await sb.from('designs').update({ is_public:true }).eq('id', id).select('*').single();
    if (error) return toast(error.message, true);
    Object.assign(d, data);
  }
  $('#shareTitle').textContent = d.name;
  const image = getFileUrl(d);
  $('#sharePreview').innerHTML = image ? `<img src="${esc(image)}" alt="${esc(d.name)}">` : '<div class="thumb-art placeholder-art"></div>';
  $('#shareUrl').textContent = getShareUrl(d);
  $('#copyState').classList.add('hidden'); $('#copyBtn').textContent = 'Copy'; $('#shareModal').classList.remove('hidden');
}

function resetFeedbackUI() {
  $('#feedbackText').value = '';
  $('#feedbackText').classList.add('hidden');
  $('#submitFeedback').classList.remove('hidden');
  $('#submitFeedback').disabled = false;
  $('#submitFeedback').classList.remove('is-loading');
  $('#submitFeedback').textContent = 'Submit Feedback';
  $('#feedbackSuccess').classList.add('hidden');
  $('#feedbackDone').classList.add('hidden');
  $('#feedbackSuccessTitle').textContent = 'Review submitted';
  $('#feedbackSuccessText').textContent = 'Thank you. The designer has been notified.';
  $$('.choice').forEach(x => { x.classList.remove('active'); x.disabled = false; });
  const approved = $('.choice[data-choice="approved"]');
  if (approved) approved.classList.add('active');
}

function openPublicFromDesign(d) {
  const image = getFileUrl(d);
  $('#publicArt').innerHTML = image ? `<img src="${esc(image)}" alt="${esc(d.name)}">` : '<div class="thumb-art placeholder-art"></div>';
  $('#publicTitle').textContent = d.name;
  $('#publicPurpose').textContent = d.purpose;
  $('#publicMeta').textContent = `Requested by ${d.requester} · ${formatDate(d.request_date)}`;
  resetFeedbackUI();
  $('#publicModal').classList.remove('hidden');
}

async function openPublic(id) {
  const d = designs.find(x => x.id === id); if (!d) return;
  openPublicFromDesign(d);
  $('#publicModal').dataset.designId = d.id;
}

async function loadPublicRoute(token) {
  publicMode = true;
  document.body.classList.add('public-route');
  $$('.sidebar, .main').forEach(x => x.classList.add('hidden'));
  $('#appLoading').classList.add('hidden');
  const { data, error } = await sb.from('designs').select('*').eq('share_token', token).eq('is_public', true).is('deleted_at', null).maybeSingle();
  if (error || !data) {
    $('#publicArt').innerHTML = '<div class="empty" style="height:100%;min-height:320px"><div class="empty-icon"><i class="fa-solid fa-link-slash"></i></div><h2>Link unavailable</h2><p>This design link is invalid, expired, or no longer shared.</p></div>';
    $('#publicTitle').textContent = 'Design not available'; $('#publicPurpose').textContent = 'Unavailable'; $('#publicMeta').textContent = '';
    $('#publicModal').classList.remove('hidden');
    return;
  }
  $('#publicModal').dataset.designId = data.id;
  openPublicFromDesign(data);
}

async function submitFeedback() {
  const designId = $('#publicModal').dataset.designId;
  const choice = $('.choice.active')?.dataset.choice;
  if (!designId || !choice) return;
  const design = designs.find(d => d.id === designId);
  const shareToken = design?.share_token || new URLSearchParams(location.search).get('share');
  if (!shareToken) return showFeedbackError('Invalid share link.');
  const comment = $('#feedbackText').value.trim();
  if (choice === 'revision' && !comment) return showFeedbackError('Please add a revision comment.');

  const button = $('#submitFeedback');
  button.disabled = true;
  button.classList.add('is-loading');
  button.textContent = 'Submitting...';
  $$('.choice').forEach(x => x.disabled = true);

  try {
    const { error } = await sb.from('feedback').insert({
      design_id: designId,
      share_token: shareToken,
      decision: choice === 'revision' ? 'revision' : 'approved',
      comment: comment || null
    });
    if (error) throw error;

    if (!publicMode) {
      $('#publicModal').classList.add('hidden');
      await loadDesigns();
      toast(choice === 'revision' ? 'Revision request received' : 'Design marked as approved');
      return;
    }

    showFeedbackSuccess(choice);
  } catch (error) {
    console.error('Review submission failed:', error);
    button.disabled = false;
    button.classList.remove('is-loading');
    button.textContent = 'Try Again';
    $$('.choice').forEach(x => x.disabled = false);
    showFeedbackError(error?.message || 'Unable to submit your review. Please try again.');
  }
}

function showFeedbackError(message) {
  let el = $('#feedbackError');
  if (!el) {
    el = document.createElement('div');
    el.id = 'feedbackError';
    el.className = 'feedback-error';
    el.setAttribute('role', 'alert');
    $('#submitFeedback').insertAdjacentElement('beforebegin', el);
  }
  el.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i><span>${esc(message)}</span>`;
  el.classList.remove('hidden');
}

function showFeedbackSuccess(choice) {
  $('#feedbackError')?.classList.add('hidden');
  $('#feedbackSuccessTitle').textContent = choice === 'revision' ? 'Revision request submitted' : 'Review submitted successfully';
  $('#feedbackSuccessText').textContent = choice === 'revision'
    ? 'Your feedback has been sent to the designer.'
    : 'This design has been marked as approved. Thank you for your review.';
  $('#submitFeedback').classList.add('hidden');
  $('#feedbackText').classList.add('hidden');
  $('#feedbackSuccess').classList.remove('hidden');
  $('#feedbackDone').classList.remove('hidden');
  $('#feedbackDone').focus();
}

function closeFeedbackSuccess() {
  $('#publicModal').classList.add('hidden');
}

async function uploadFile(file) {
  if (!file) throw new Error('Please select a design file.');
  if (file.size > MAX_FILE_SIZE) throw new Error('File is larger than 20 MB.');
  const allowed = ['image/png','image/jpeg','image/webp','image/svg+xml'];
  if (!allowed.includes(file.type)) throw new Error('Only PNG, JPG, WEBP or SVG files are supported.');
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  const path = `${currentUser.id}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, file, { cacheControl:'3600', upsert:false, contentType:file.type });
  if (error) throw error;
  const publicUrl = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return { path, publicUrl };
}

function readImageSize(file) {
  return new Promise(resolve => {
    if (!file || !file.type.startsWith('image/')) return resolve({ width:null, height:null });
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { const out = { width:img.naturalWidth || null, height:img.naturalHeight || null }; URL.revokeObjectURL(url); resolve(out); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ width:null, height:null }); };
    img.src = url;
  });
}

async function createDesign(event) {
  event.preventDefault();
  event.stopPropagation();

  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  const errorBox = $('#newFormError');

  const setError = (message) => {
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
  };

  if (errorBox) {
    errorBox.textContent = '';
    errorBox.classList.add('hidden');
  }

  submit.disabled = true;
  submit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading…';

  let uploaded = null;

  try {
    // Always refresh the session before an upload. This avoids stale-session issues.
    const { data: sessionData, error: sessionError } = await sb.auth.getSession();
    if (sessionError) throw sessionError;
    currentUser = sessionData?.session?.user || currentUser;
    if (!currentUser) throw new Error('Your session has expired. Please sign in again.');

    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim();
    const requester = String(fd.get('requester') || '').trim();
    const purpose = String(fd.get('purpose') || '').trim();
    const requestDate = String(fd.get('date') || new Date().toISOString().slice(0, 10));
    const status = String(fd.get('status') || 'New');
    const folder = String(fd.get('folder') || '').trim();
    const description = String(fd.get('description') || '').trim() || null;

    if (!name) throw new Error('Please enter a design name.');
    if (!requester) throw new Error('Please enter the requester.');
    if (!selectedFile) throw new Error('Please select a design file.');

    submit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Reading file…';
    const size = await readImageSize(selectedFile);

    submit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading…';
    uploaded = await uploadFile(selectedFile);

    submit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';
    const payload = {
      name,
      requester,
      purpose,
      request_date: requestDate,
      status,
      folder: folder || null,
      description,
      file_name: selectedFile.name,
      file_size: selectedFile.size,
      file_type: selectedFile.type,
      width: size.width,
      height: size.height,
      storage_path: uploaded.path,
      file_url: uploaded.publicUrl
    };

    const { error: insertError } = await sb.from('designs').insert(payload);
    if (insertError) throw insertError;

    form.reset();
    selectedFile = null;
    resetUploadUI();
    $('#newModal').classList.add('hidden');
    await loadDesigns();
    toast('Design added to library');
  } catch (error) {
    console.error('DesignHub Add Design error:', error);
    if (uploaded?.path) {
      const { error: cleanupError } = await sb.storage.from(BUCKET).remove([uploaded.path]);
      if (cleanupError) console.warn('Upload cleanup failed:', cleanupError);
    }
    const message = error?.message || 'Unable to add design.';
    setError(message);
    toast(message, true);
  } finally {
    submit.disabled = false;
    submit.innerHTML = '<i class="fa-solid fa-plus"></i> Add Design';
  }
}

function resetUploadUI() {
  $('#fileInput').value = ''; $('#uploadTitle').textContent = 'Drop your design here'; $('#uploadHint').textContent = 'PNG, JPG, WEBP, SVG up to 20 MB'; $('#uploadZone').classList.remove('has-file');
}

function selectFile(file) {
  if (!file) return;
  if (file.size > MAX_FILE_SIZE) return toast('File is larger than 20 MB.', true);
  selectedFile = file;
  $('#uploadTitle').textContent = file.name;
  $('#uploadHint').textContent = `${formatBytes(file.size)} · Ready to upload`;
  $('#uploadZone').classList.add('has-file');
}

function toast(message, error = false) {
  const node = $('#toast'); node.textContent = message; node.style.background = error ? '#C2413A' : '#172033'; node.classList.remove('hidden');
  clearTimeout(window.__toastTimer); window.__toastTimer = setTimeout(() => node.classList.add('hidden'), 2600);
}

async function markNotificationRead(id) {
  if (!id) return;
  await sb.from('notifications').update({ is_read:true }).eq('id', id);
}

function closeSidebar() {
  const sidebar = $('#sidebar');
  const backdrop = $('#sidebarBackdrop');
  const toggle = $('#sidebarToggle');
  if (!sidebar) return;
  sidebar.classList.remove('open');
  backdrop?.classList.add('hidden');
  toggle?.setAttribute('aria-expanded', 'false');
  toggle?.setAttribute('aria-label', 'Open navigation');
}

function bindEvents() {
  document.addEventListener('click', async event => {
    const toggle = event.target.closest('#sidebarToggle');
    if (toggle) {
      const sidebar = $('#sidebar');
      const backdrop = $('#sidebarBackdrop');
      const isOpen = sidebar.classList.toggle('open');
      backdrop.classList.toggle('hidden', !isOpen);
      toggle.setAttribute('aria-expanded', String(isOpen));
      toggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
      return;
    }
    if (event.target.closest('#sidebarBackdrop')) {
      closeSidebar();
      return;
    }
    const view = event.target.closest('[data-view]'); if (view) { showView(view.dataset.view); if (window.innerWidth <= 760) closeSidebar(); return; }
    const card = event.target.closest('.design-card'); if (card && !event.target.closest('.share-mini')) return openDrawer(card.dataset.id);
    const shareMini = event.target.closest('.share-mini'); if (shareMini) return openShare(shareMini.dataset.id);
    const row = event.target.closest('.list-row'); if (row) return openDrawer(row.dataset.id);
    const attention = event.target.closest('.attention-item,.notif-item');
    if (attention) { $('#notificationPanel').classList.add('hidden'); await markNotificationRead(attention.dataset.notification); await renderNotifications(); return openDrawer(attention.dataset.id); }
    const preview = event.target.closest('.preview-btn'); if (preview) { closeDrawer(); return openPublic(preview.dataset.id); }
    const share = event.target.closest('.share-btn'); if (share) { closeDrawer(); return openShare(share.dataset.id); }
    const download = event.target.closest('.download-btn');
    if (download) { const d = designs.find(x => x.id === download.dataset.id); const url = d && getFileUrl(d); if (url) { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.download = d.file_name || 'design'; document.body.appendChild(a); a.click(); a.remove(); } else toast('File is not available.', true); return; }
    if (event.target.closest('[data-open-new]')) { $('#newModal').classList.remove('hidden'); return; }
    if (event.target.closest('[data-close-new]')) { $('#newModal').classList.add('hidden'); return; }
    if (event.target.closest('[data-close-drawer]') || event.target.id === 'backdrop') return closeDrawer();
    if (event.target.closest('[data-close-share]')) { $('#shareModal').classList.add('hidden'); return; }
    if (event.target.closest('[data-close-public]')) { $('#publicModal').classList.add('hidden'); return; }
    if (event.target.closest('#notifBtn')) { $('#notificationPanel').classList.toggle('hidden'); return; }
    if (event.target.closest('#filterBtn')) { $('#filterPanel').classList.toggle('hidden'); return; }
    if (event.target.closest('#gridBtn')) { $('#gridBtn').classList.add('active'); $('#listBtn').classList.remove('active'); $('#libraryGrid').classList.remove('hidden'); $('#libraryList').classList.add('hidden'); return; }
    if (event.target.closest('#listBtn')) { $('#listBtn').classList.add('active'); $('#gridBtn').classList.remove('active'); $('#libraryList').classList.remove('hidden'); $('#libraryGrid').classList.add('hidden'); return; }
    if (event.target.closest('#clearFilters')) { $('#statusFilter').value=''; $('#purposeFilter').value=''; return renderLibrary(); }
    if (event.target.closest('#copyBtn')) { try { await navigator.clipboard.writeText($('#shareUrl').textContent); $('#copyState').classList.remove('hidden'); $('#copyBtn').textContent='Copied'; setTimeout(() => $('#copyBtn').textContent='Copy', 1600); } catch { toast('Copy failed. Please copy the link manually.', true); } return; }
    const choice = event.target.closest('.choice');
    if (choice) { $$('.choice').forEach(x => x.classList.remove('active')); choice.classList.add('active'); $('#feedbackText').classList.toggle('hidden', choice.dataset.choice !== 'revision'); $('#feedbackError')?.classList.add('hidden'); return; }
    if (event.target.closest('#submitFeedback')) return submitFeedback();
    if (event.target.closest('#feedbackDone')) return closeFeedbackSuccess();
    if (event.target.closest('#logoutBtn')) { await sb.auth.signOut(); return; }
    if (event.target.closest('#togglePassword')) { const input = $('#loginPassword'); input.type = input.type === 'password' ? 'text' : 'password'; return; }
  });

  $('#search').addEventListener('input', renderLibrary);
  $('#statusFilter').addEventListener('change', renderLibrary);
  $('#purposeFilter').addEventListener('change', renderLibrary);
  $('#newForm').addEventListener('submit', createDesign);
  $('#loginForm').addEventListener('submit', login);
  $('#fileInput').addEventListener('change', e => selectFile(e.target.files[0]));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeSidebar(); });
  window.addEventListener('resize', () => { if (window.innerWidth > 760) closeSidebar(); });
  const zone = $('#uploadZone');
  zone.addEventListener('click', () => $('#fileInput').click());
  zone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') $('#fileInput').click(); });
  ['dragenter','dragover'].forEach(type => zone.addEventListener(type, e => { e.preventDefault(); zone.classList.add('dragging'); }));
  ['dragleave','drop'].forEach(type => zone.addEventListener(type, e => { e.preventDefault(); zone.classList.remove('dragging'); }));
  zone.addEventListener('drop', e => selectFile(e.dataTransfer.files[0]));
}

async function login(event) {
  event.preventDefault();
  $('#loginError').classList.add('hidden'); $('#loginSpinner').classList.remove('hidden'); $('#loginLabel').classList.add('hidden');
  const email = $('#loginEmail').value.trim(); const password = $('#loginPassword').value;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  $('#loginSpinner').classList.add('hidden'); $('#loginLabel').classList.remove('hidden');
  if (error) { $('#loginError').textContent = error.message; $('#loginError').classList.remove('hidden'); }
}

async function boot() {
  bindEvents();
  const share = new URLSearchParams(window.location.search).get('share');
  if (share) return loadPublicRoute(share);
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    currentUser = session.user; setIdentity(currentUser); setAuthScreen(false); await loadDesigns();
  } else setAuthScreen(true);
  sb.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) {
      currentUser = session.user; setIdentity(currentUser); setAuthScreen(false);
      try { await loadDesigns(); } catch (e) { console.error(e); toast(e.message || 'Unable to load DesignHub.', true); }
    } else if (!publicMode) { currentUser = null; setAuthScreen(true); }
  });
}

boot().catch(error => {
  console.error(error);
  $('#appLoading').classList.add('hidden');
  if (!publicMode) { setAuthScreen(true); $('#loginError').textContent = error.message || 'Unable to initialize DesignHub.'; $('#loginError').classList.remove('hidden'); }
});
