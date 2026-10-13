(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  const tenantStorageKey = 'asl_tenant_id';
  let bootstrap = null;

  function currentTenantID() {
    return localStorage.getItem(tenantStorageKey) || '';
  }

  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!url.includes('/api/admin/')) return nativeFetch(input, init);
    const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
    const tenantID = currentTenantID();
    if (tenantID) headers.set('X-Tenant-ID', tenantID);
    return nativeFetch(input, { ...init, headers, credentials: init.credentials || 'same-origin' });
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const isZh = () => (localStorage.getItem('asl_lang') || navigator.language || 'zh').toLowerCase().startsWith('zh');
  const text = (zh, en) => isZh() ? zh : en;
  const content = () => $('#content');

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (!(options.body instanceof FormData) && options.body !== undefined) headers.set('Content-Type', 'application/json');
    const response = await window.fetch(path, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const error = new Error(data.message || data.error || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function toast(message, error = false) {
    const node = document.createElement('div');
    node.className = `toast${error ? ' error' : ''}`;
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 3000);
  }

  async function loadBootstrap(force = false) {
    if (bootstrap && !force) return bootstrap;
    bootstrap = await api('/api/admin/saas/bootstrap');
    const selected = String(bootstrap.current_tenant?.id || '');
    if (selected && currentTenantID() !== selected) localStorage.setItem(tenantStorageKey, selected);
    updateWorkspaceSwitcher();
    updateSaaSNav();
    return bootstrap;
  }

  function updateWorkspaceSwitcher() {
    let host = $('#saasWorkspaceSwitcher');
    if (!host) {
      host = document.createElement('label');
      host.id = 'saasWorkspaceSwitcher';
      host.className = 'saas-workspace-switcher';
      host.innerHTML = `<span>${text('工作空间', 'Workspace')}</span><select aria-label="${text('切换工作空间', 'Switch workspace')}"></select>`;
      const brand = $('.sidebar .brand');
      brand?.insertAdjacentElement('afterend', host);
      $('select', host)?.addEventListener('change', async event => {
        localStorage.setItem(tenantStorageKey, event.target.value);
        bootstrap = null;
        try {
          await loadBootstrap(true);
          location.reload();
        } catch (err) {
          toast(err.message, true);
        }
      });
    }
    const select = $('select', host);
    if (!select || !bootstrap) return;
    select.innerHTML = (bootstrap.tenants || []).map(access => {
      const tenant = access.tenant || access.Tenant || access;
      const role = access.role || '';
      return `<option value="${tenant.id}" ${String(tenant.id) === String(bootstrap.current_tenant?.id) ? 'selected' : ''}>${esc(tenant.name)} · ${esc(role)}</option>`;
    }).join('');
  }

  function updateSaaSNav() {
    if (!bootstrap || $('#saasNavGroup')) return;
    const nav = $('.sidebar nav');
    if (!nav) return;
    const group = document.createElement('div');
    group.id = 'saasNavGroup';
    group.className = 'nav-group';
    group.innerHTML = `
      <p class="nav-section-title">${text('工作空间', 'Workspace')}</p>
      <button class="nav" data-saas-view="workspace"><i class="ph ph-buildings"></i><span>${text('租户与成员', 'Tenant & members')}</span></button>
      <button class="nav" data-saas-view="routing"><i class="ph ph-git-branch"></i><span>${text('流量路由', 'Traffic routing')}</span></button>
      <button class="nav" data-saas-view="subscription"><i class="ph ph-credit-card"></i><span>${text('订阅与额度', 'Subscription')}</span></button>
      <button class="nav" data-saas-view="approvals"><i class="ph ph-seal-check"></i><span>${text('租户审批', 'Tenant approval')}</span></button>
      ${bootstrap.platform_admin ? `<button class="nav" data-saas-view="platform"><i class="ph ph-shield-check"></i><span>${text('平台终审', 'Platform review')}</span></button>` : ''}`;
    const management = $$('.nav-group', nav).find(item => item.querySelector('.admin-only'));
    if (management) nav.insertBefore(group, management); else nav.appendChild(group);
  }

  function setPage(title, description, view) {
    $('#pageTitle').textContent = title;
    $('#pageDesc').textContent = description;
    $$('.nav').forEach(item => item.classList.toggle('active', item.dataset.saasView === view));
    const create = $('#createBtn');
    if (create) create.style.display = 'none';
    const menu = $('#createMenu');
    if (menu) menu.style.display = 'none';
  }

  function quotaBar(label, used, limit) {
    const unlimited = Number(limit || 0) === 0;
    const ratio = unlimited ? 0 : Math.min(100, Math.round((Number(used || 0) / Number(limit)) * 100));
    return `<div class="saas-quota-row"><div><strong>${esc(label)}</strong><span>${Number(used || 0).toLocaleString()} / ${unlimited ? '∞' : Number(limit).toLocaleString()}</span></div><div class="saas-meter"><i style="width:${ratio}%"></i></div></div>`;
  }

  async function renderWorkspace() {
    const data = await loadBootstrap(true);
    setPage(text('租户与成员', 'Tenant & members'), text('切换工作空间、维护成员及租户角色。', 'Switch workspaces and manage tenant roles.'), 'workspace');
    let members = [];
    if (['owner', 'admin'].includes(data.tenant_role)) {
      members = (await api(`/api/admin/saas/tenants/${data.current_tenant.id}/members`)).data || [];
    }
    content().innerHTML = `<section class="saas-page">
      <div class="saas-grid two">
        <article class="card saas-card"><div class="saas-card-head"><div><small>${text('当前工作空间', 'Current workspace')}</small><h2>${esc(data.current_tenant.name)}</h2></div><span class="type-pill">${esc(data.tenant_role)}</span></div><dl class="saas-definition"><div><dt>Slug</dt><dd>${esc(data.current_tenant.slug)}</dd></div><div><dt>${text('类型', 'Kind')}</dt><dd>${esc(data.current_tenant.kind)}</dd></div><div><dt>${text('状态', 'Status')}</dt><dd>${esc(data.current_tenant.status)}</dd></div></dl></article>
        <article class="card saas-card"><div class="saas-card-head"><div><small>${text('可访问工作空间', 'Accessible workspaces')}</small><h2>${(data.tenants || []).length}</h2></div><button class="primary" id="saasCreateTenant">${text('新建工作空间', 'New workspace')}</button></div><div class="saas-tenant-list">${(data.tenants || []).map(access => { const t = access.tenant; return `<button data-switch-tenant="${t.id}" class="saas-tenant-item ${t.id === data.current_tenant.id ? 'active' : ''}"><strong>${esc(t.name)}</strong><span>${esc(access.role)}</span></button>`; }).join('')}</div></article>
      </div>
      <article class="card saas-card"><div class="saas-card-head"><div><small>${text('成员权限', 'Member permissions')}</small><h2>${text('租户成员', 'Tenant members')}</h2></div>${['owner', 'admin'].includes(data.tenant_role) ? `<button class="primary" id="saasAddMember">${text('添加成员', 'Add member')}</button>` : ''}</div>
      ${members.length ? `<div class="saas-table-wrap"><table><thead><tr><th>${text('账户', 'Account')}</th><th>${text('角色', 'Role')}</th><th>${text('状态', 'Status')}</th><th>${text('操作', 'Actions')}</th></tr></thead><tbody>${members.map(m => `<tr><td><strong>${esc(m.name || '-')}</strong><small>${esc(m.email || `#${m.account_id}`)}</small></td><td><span class="type-pill">${esc(m.role)}</span></td><td>${esc(m.status)}</td><td><button class="ghost" data-edit-member="${m.account_id}" data-member-role="${esc(m.role)}" data-member-status="${esc(m.status)}">${text('编辑', 'Edit')}</button><button class="ghost danger" data-remove-member="${m.account_id}">${text('移除', 'Remove')}</button></td></tr>`).join('')}</tbody></table></div>` : `<div class="empty">${text('当前角色无成员管理权限。', 'Your role cannot manage members.')}</div>`}
      </article>
    </section>`;

    $('#saasCreateTenant')?.addEventListener('click', createTenant);
    $('#saasAddMember')?.addEventListener('click', addMember);
    $$('[data-switch-tenant]').forEach(button => button.addEventListener('click', () => switchTenant(button.dataset.switchTenant)));
    $$('[data-edit-member]').forEach(button => button.addEventListener('click', () => editMember(button.dataset.editMember, button.dataset.memberRole, button.dataset.memberStatus)));
    $$('[data-remove-member]').forEach(button => button.addEventListener('click', () => removeMember(button.dataset.removeMember)));
  }

  async function createTenant() {
    const name = prompt(text('工作空间名称', 'Workspace name'));
    if (!name?.trim()) return;
    try {
      const result = await api('/api/admin/saas/tenants', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
      await switchTenant(result.data.id);
    } catch (err) { toast(err.message, true); }
  }

  async function switchTenant(id) {
    localStorage.setItem(tenantStorageKey, String(id));
    bootstrap = null;
    await loadBootstrap(true);
    location.reload();
  }

  async function addMember() {
    const email = prompt(text('输入系统中已存在账户的邮箱', 'Enter an existing account email'));
    if (!email?.trim()) return;
    const role = prompt(text('角色：owner / admin / reviewer / member / analyst', 'Role: owner / admin / reviewer / member / analyst'), 'member');
    if (!role) return;
    try {
      await api(`/api/admin/saas/tenants/${bootstrap.current_tenant.id}/members`, { method: 'POST', body: JSON.stringify({ email: email.trim(), role: role.trim(), status: 'active' }) });
      toast(text('成员已添加', 'Member added'));
      await renderWorkspace();
    } catch (err) { toast(err.message, true); }
  }

  async function editMember(accountID, oldRole, oldStatus) {
    const role = prompt(text('新角色', 'New role'), oldRole);
    if (!role) return;
    const status = prompt(text('状态：active / disabled', 'Status: active / disabled'), oldStatus);
    if (!status) return;
    try {
      await api(`/api/admin/saas/tenants/${bootstrap.current_tenant.id}/members/${accountID}`, { method: 'PUT', body: JSON.stringify({ role, status }) });
      toast(text('成员权限已更新', 'Member updated'));
      await renderWorkspace();
    } catch (err) { toast(err.message, true); }
  }

  async function removeMember(accountID) {
    if (!confirm(text('确定移除该成员？', 'Remove this member?'))) return;
    try {
      await api(`/api/admin/saas/tenants/${bootstrap.current_tenant.id}/members/${accountID}`, { method: 'DELETE' });
      toast(text('成员已移除', 'Member removed'));
      await renderWorkspace();
    } catch (err) { toast(err.message, true); }
  }

  async function renderSubscription() {
    const data = await loadBootstrap(true);
    const [plansResult, requestsResult] = await Promise.all([api('/api/admin/saas/plans'), api('/api/admin/saas/subscription/requests')]);
    const quota = data.quota;
    const plan = quota.plan;
    setPage(text('订阅与额度', 'Subscription & quota'), text('查看套餐、当前用量并提交套餐变更申请。', 'Review limits and request a plan change.'), 'subscription');
    content().innerHTML = `<section class="saas-page">
      <div class="saas-grid two"><article class="card saas-card"><div class="saas-card-head"><div><small>${text('当前套餐', 'Current plan')}</small><h2>${esc(plan.name)}</h2></div><span class="status active">${esc(quota.subscription.status)}</span></div><p>${esc(plan.description)}</p><strong class="saas-price">${plan.price_monthly_cents ? `¥${(plan.price_monthly_cents / 100).toFixed(2)} / ${text('月', 'month')}` : text('免费或人工报价', 'Free or custom')}</strong></article>
      <article class="card saas-card"><h2>${text('本周期使用量', 'Current usage')}</h2>${quotaBar(text('成员', 'Members'), quota.members_used, plan.max_members)}${quotaBar(text('短链', 'Short links'), quota.short_links_used, plan.max_short_links)}${quotaBar(text('活码', 'Live QR'), quota.live_qrs_used, plan.max_live_qrs)}${quotaBar(text('月访问量', 'Monthly visits'), quota.monthly_visits_used, plan.monthly_visits)}</article></div>
      <div class="saas-plan-grid">${(plansResult.data || []).map(item => `<article class="card saas-card ${item.id === plan.id ? 'selected' : ''}"><small>${esc(item.code)}</small><h2>${esc(item.name)}</h2><p>${esc(item.description)}</p><ul><li>${text('成员', 'Members')}: ${item.max_members || '∞'}</li><li>${text('短链', 'Links')}: ${item.max_short_links || '∞'}</li><li>${text('每条目标', 'Targets/link')}: ${item.max_targets_per_link || '∞'}</li><li>${text('月访问', 'Monthly visits')}: ${item.monthly_visits || '∞'}</li></ul>${item.id !== plan.id ? `<button class="primary" data-request-plan="${item.id}">${text('申请此套餐', 'Request plan')}</button>` : `<span class="status active">${text('当前套餐', 'Current')}</span>`}</article>`).join('')}</div>
      <article class="card saas-card"><h2>${text('变更记录', 'Change requests')}</h2><div class="saas-table-wrap"><table><thead><tr><th>${text('套餐', 'Plan')}</th><th>${text('状态', 'Status')}</th><th>${text('说明', 'Note')}</th><th>${text('时间', 'Time')}</th></tr></thead><tbody>${(requestsResult.data || []).map(item => `<tr><td>${esc(item.from_plan)} → ${esc(item.to_plan)}</td><td><span class="type-pill">${esc(item.status)}</span></td><td>${esc(item.review_note || item.note || '-')}</td><td>${new Date(item.created_at).toLocaleString()}</td></tr>`).join('') || `<tr><td colspan="4">${text('暂无申请', 'No requests')}</td></tr>`}</tbody></table></div></article>
    </section>`;
    $$('[data-request-plan]').forEach(button => button.addEventListener('click', async () => {
      const note = prompt(text('申请说明（可选）', 'Request note (optional)')) || '';
      try {
        await api('/api/admin/saas/subscription/requests', { method: 'POST', body: JSON.stringify({ plan_id: Number(button.dataset.requestPlan), note }) });
        toast(text('套餐申请已提交平台审核', 'Plan request submitted'));
        await renderSubscription();
      } catch (err) { toast(err.message, true); }
    }));
  }

  async function renderRouting() {
    await loadBootstrap(true);
    setPage(text('流量路由', 'Traffic routing'), text('一个稳定短码对应多个目标，支持轮询、随机、权重、最少使用和 IP Hash。', 'Route one stable code across multiple destinations.'), 'routing');
    const result = await api('/api/admin/short-links?limit=200');
    const items = result.data || [];
    content().innerHTML = `<section class="saas-page"><article class="card saas-card"><div class="saas-card-head"><div><small>${text('多目标短链', 'Multi-target links')}</small><h2>${items.length}</h2></div></div><div class="saas-table-wrap"><table><thead><tr><th>${text('短码', 'Code')}</th><th>${text('标题', 'Title')}</th><th>${text('策略', 'Strategy')}</th><th>${text('审批', 'Approval')}</th><th>${text('操作', 'Actions')}</th></tr></thead><tbody>${items.map(item => `<tr><td><code>${esc(item.code)}</code></td><td>${esc(item.title || '-')}</td><td><span class="type-pill">${esc(item.routing_strategy || 'single')}</span></td><td>${esc(item.approval_status)}</td><td><button class="primary" data-manage-targets="${item.id}">${text('管理目标池', 'Manage targets')}</button></td></tr>`).join('') || `<tr><td colspan="5">${text('暂无短链', 'No short links')}</td></tr>`}</tbody></table></div></article></section>`;
    $$('[data-manage-targets]').forEach(button => button.addEventListener('click', () => openTargets(Number(button.dataset.manageTargets))));
  }

  function targetRow(item = {}) {
    return `<div class="saas-target-row" data-target-id="${Number(item.id || 0)}"><input data-field="name" placeholder="${text('名称', 'Name')}" value="${esc(item.name || '')}"><input data-field="url" type="url" placeholder="https://..." value="${esc(item.target_url || '')}"><select data-field="status"><option value="active" ${item.status !== 'disabled' ? 'selected' : ''}>active</option><option value="disabled" ${item.status === 'disabled' ? 'selected' : ''}>disabled</option></select><input data-field="weight" type="number" min="1" max="10000" value="${Number(item.weight || 1)}"><input data-field="max" type="number" min="0" value="${Number(item.max_hits || 0)}"><select data-field="health"><option value="unknown" ${item.health_status === 'unknown' || !item.health_status ? 'selected' : ''}>unknown</option><option value="healthy" ${item.health_status === 'healthy' ? 'selected' : ''}>healthy</option><option value="unhealthy" ${item.health_status === 'unhealthy' ? 'selected' : ''}>unhealthy</option></select><button class="ghost danger" data-remove-target>×</button></div>`;
  }

  async function openTargets(id) {
    try {
      const result = await api(`/api/admin/short-links/${id}/targets`);
      const modal = $('#modal');
      $('#modalTitle').textContent = text('短链目标池', 'Short-link target pool');
      $('#modalBody').innerHTML = `<div class="saas-target-editor"><label class="field"><span>${text('路由策略', 'Routing strategy')}</span><select id="saasRoutingStrategy"><option value="single">single</option><option value="round_robin">round_robin</option><option value="random">random</option><option value="weighted_random">weighted_random</option><option value="least_used">least_used</option><option value="ip_hash">ip_hash</option></select></label><div class="saas-target-head"><span>${text('名称', 'Name')}</span><span>URL</span><span>${text('状态', 'Status')}</span><span>${text('权重', 'Weight')}</span><span>${text('上限', 'Limit')}</span><span>${text('健康', 'Health')}</span><span></span></div><div id="saasTargetRows">${(result.data || []).map(targetRow).join('')}</div><div class="form-actions"><button class="ghost" id="saasAddTarget">${text('添加目标', 'Add target')}</button><button class="primary" id="saasSaveTargets">${text('保存并重新送审', 'Save & resubmit')}</button></div></div>`;
      $('#saasRoutingStrategy').value = result.routing_strategy || 'single';
      modal.hidden = false;
      modal.querySelector('.modal-card')?.classList.add('wide');
      $('#saasAddTarget').onclick = () => $('#saasTargetRows').insertAdjacentHTML('beforeend', targetRow());
      $('#saasTargetRows').onclick = event => event.target.closest('[data-remove-target]')?.closest('.saas-target-row')?.remove();
      $('#saasSaveTargets').onclick = async () => {
        const targets = $$('.saas-target-row').map((row, index) => ({ id: Number(row.dataset.targetId || 0), name: $('[data-field="name"]', row).value.trim(), target_url: $('[data-field="url"]', row).value.trim(), status: $('[data-field="status"]', row).value, weight: Number($('[data-field="weight"]', row).value || 1), max_hits: Number($('[data-field="max"]', row).value || 0), health_status: $('[data-field="health"]', row).value, sort_order: (index + 1) * 10 }));
        await api(`/api/admin/short-links/${id}/targets`, { method: 'PUT', body: JSON.stringify({ routing_strategy: $('#saasRoutingStrategy').value, targets }) });
        modal.hidden = true;
        toast(text('目标池已保存，内容已回到租户待审状态', 'Targets saved and resubmitted'));
        await renderRouting();
      };
    } catch (err) { toast(err.message, true); }
  }

  const resourceLabel = type => ({ short_link: text('短链', 'Short link'), live_qr: text('活码', 'Live QR'), live_qr_item: text('二维码项', 'QR item') }[type] || type);
  const dateText = value => value && !Number.isNaN(new Date(value).getTime()) ? esc(new Date(value).toLocaleString(isZh() ? 'zh-CN' : 'en-US')) : '-';
  const limitText = value => Number(value || 0) === 0 ? text('不限', 'Unlimited') : Number(value).toLocaleString();
  const accountText = account => account ? esc([account.name, account.email].filter(Boolean).join(' · ') || `#${account.id}`) : '-';
  const statusText = value => ({ tenant_pending: text('待初审', 'Tenant review'), platform_pending: text('待终审', 'Final review'), tenant_rejected: text('初审驳回', 'Tenant rejected'), platform_rejected: text('终审驳回', 'Final rejected'), pending: text('待审批', 'Pending'), approved: text('已通过', 'Approved'), rejected: text('已驳回', 'Rejected'), active: text('启用', 'Active'), disabled: text('停用', 'Disabled') }[value] || esc(value || '-'));
  const strategyText = value => ({ single: text('单一目标', 'Single destination'), round_robin: text('顺序轮换', 'Round robin'), random: text('随机轮换', 'Random'), weighted_random: text('按权重随机', 'Weighted random'), least_used: text('最少访问优先', 'Least used'), ip_hash: text('按 IP 固定', 'IP hash') }[value] || esc(value || '-'));

  function safeURL(value) {
    if (!value) return '';
    try {
      const url = new URL(value, location.origin);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  }

  function urlHTML(value) {
    const url = safeURL(value);
    return url ? `<a class="saas-review-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(value)}<i class="ph ph-arrow-up-right" aria-hidden="true"></i></a>` : esc(value || '-');
  }

  const definitionHTML = rows => `<dl class="saas-review-facts">${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
  const reviewSection = (title, body) => `<section class="saas-review-block"><h3>${title}</h3>${body}</section>`;

  function openReviewDialog(title) {
    $('.saas-review-dialog')?.close();
    const dialog = document.createElement('dialog');
    dialog.className = 'saas-review-dialog';
    dialog.setAttribute('aria-labelledby', 'saasReviewTitle');
    dialog.innerHTML = `<header class="saas-review-header"><h2 id="saasReviewTitle">${title}</h2><button class="icon" type="button" data-review-close aria-label="${text('关闭', 'Close')}" title="${text('关闭', 'Close')}"><i class="ph ph-x" aria-hidden="true"></i></button></header><div class="saas-review-body" aria-live="polite">${text('正在加载详情…', 'Loading details…')}</div>`;
    const previousFocus = document.activeElement;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    dialog.addEventListener('close', () => { document.documentElement.style.overflow = previousOverflow; dialog.remove(); previousFocus?.focus(); });
    dialog.addEventListener('cancel', event => { if (dialog.dataset.busy === 'true') event.preventDefault(); });
    dialog.addEventListener('click', event => { if (event.target.closest('[data-review-close]') && dialog.dataset.busy !== 'true') dialog.close(); });
    document.body.appendChild(dialog);
    dialog.showModal();
    return dialog;
  }

  function reviewFooter(canReview, approveLabel, includeItems = '') {
    if (!canReview) return `<footer class="saas-review-footer"><p>${text('该申请已处理或已进入其他审核阶段。', 'This request has been processed or moved to another review stage.')}</p><button class="ghost" data-review-close>${text('关闭', 'Close')}</button></footer>`;
    return `<footer class="saas-review-footer">${includeItems}<label class="field"><span>${text('审批意见', 'Review note')}</span><textarea id="saasReviewNote" rows="2" maxlength="2000" placeholder="${text('通过时可选，驳回时请说明原因', 'Optional for approval; required for rejection')}"></textarea></label><p class="saas-review-error" role="alert" hidden></p><div class="saas-review-buttons"><button class="ghost" data-review-close>${text('取消', 'Cancel')}</button><button class="ghost danger icon-label-button" data-review-decision="reject"><i class="ph ph-x" aria-hidden="true"></i>${text('驳回', 'Reject')}</button><button class="primary icon-label-button" data-review-decision="approve"><i class="ph ph-check" aria-hidden="true"></i>${approveLabel}</button></div></footer>`;
  }

  function bindReviewDecision(dialog, endpoint, payload, refresh) {
    $$('[data-review-decision]', dialog).forEach(button => button.addEventListener('click', async () => {
      if (dialog.dataset.busy === 'true') return;
      const noteInput = $('#saasReviewNote', dialog);
      const note = noteInput.value.trim();
      noteInput.setCustomValidity(button.dataset.reviewDecision === 'reject' && !note ? text('请填写驳回原因', 'Enter a reason for rejection') : '');
      if (!noteInput.reportValidity()) return;
      dialog.dataset.busy = 'true';
      $$('button, textarea, input', dialog).forEach(control => { control.disabled = true; });
      const errorNode = $('.saas-review-error', dialog);
      errorNode.hidden = true;
      try {
        const includeCheckbox = $('#saasIncludeItems', dialog);
        const decision = { ...payload, action: button.dataset.reviewDecision, note, ...(includeCheckbox ? { include_items: includeCheckbox.checked } : {}) };
        await api(endpoint, { method: 'POST', body: JSON.stringify(decision) });
      } catch (err) {
        errorNode.textContent = err.status === 409 ? text('内容或审批状态已变更，请关闭后重新查看详情。', 'Content or review status changed. Close and reopen the details.') : err.message;
        errorNode.hidden = false;
        return;
      } finally {
        dialog.dataset.busy = 'false';
        $$('button, textarea, input', dialog).forEach(control => { control.disabled = false; });
      }
      dialog.close();
      toast(text('审批已完成', 'Review completed'));
      try { await refresh(); } catch (err) { toast(err.message, true); }
    }));
    $('#saasReviewNote', dialog)?.addEventListener('input', event => event.target.setCustomValidity(''));
  }

  function qrItemHTML(item) {
    const imageURL = safeURL(item.qr_image_url);
    return `<article class="saas-review-qr-item"><figure>${imageURL ? `<a href="${esc(imageURL)}" target="_blank" rel="noopener noreferrer" title="${text('查看原图', 'View original image')}"><img src="${esc(imageURL)}" alt="${esc(item.title || text('待审二维码', 'QR under review'))}" loading="lazy" referrerpolicy="no-referrer"></a>` : `<p>${text('未提供二维码图片', 'No QR image')}</p>`}<figcaption>${imageURL ? `<a class="saas-review-link" href="${esc(imageURL)}" target="_blank" rel="noopener noreferrer">${text('查看原图', 'View original image')}<i class="ph ph-arrow-up-right" aria-hidden="true"></i></a>` : '-'}</figcaption></figure><div><h4>${esc(item.title || `#${item.id}`)}</h4>${definitionHTML([
      [text('审核状态', 'Review status'), statusText(item.approval_status)],
      [text('启用状态', 'Availability'), statusText(item.status)],
      [text('目标链接', 'Target URL'), urlHTML(item.target_url)],
      [text('开始时间', 'Starts'), dateText(item.starts_at)],
      [text('到期时间', 'Expires'), dateText(item.expires_at)],
      [text('展示上限 / 已展示', 'View limit / used'), `${limitText(item.max_views)} / ${Number(item.view_count || 0).toLocaleString()}`],
      [text('排序 / 权重', 'Order / weight'), `${Number(item.sort_order)} / ${Number(item.weight)}`],
    ])}</div></article>`;
  }

  function contentDetailsHTML(detail) {
    const resource = detail.resource;
    if (detail.resource_type === 'live_qr_item') return reviewSection(text('二维码内容', 'QR content'), qrItemHTML(resource)) + reviewSection(text('所属活码', 'Parent live QR'), definitionHTML([[text('标题', 'Title'), esc(detail.parent.title || detail.parent.code)], [text('公开入口', 'Public entry'), urlHTML(`/q/${encodeURIComponent(detail.parent.code)}`)], [text('审核状态', 'Review status'), statusText(detail.parent.approval_status)]]));
    if (detail.resource_type === 'short_link') {
      const targets = resource.targets || [];
      return reviewSection(text('短链内容', 'Short-link content'), definitionHTML([
        [text('公开入口', 'Public entry'), urlHTML(`/s/${encodeURIComponent(resource.code)}`)],
        [text('原链接', 'Original URL'), urlHTML(resource.target_url)],
        [text('路由策略', 'Routing strategy'), strategyText(resource.routing_strategy)],
        [text('跳转方式', 'Redirect'), String(Number(resource.redirect_type))],
        [text('开始时间', 'Starts'), dateText(resource.starts_at)], [text('到期时间', 'Expires'), dateText(resource.expires_at)],
        [text('访问上限 / 已访问', 'Visit limit / used'), `${limitText(resource.max_visits)} / ${Number(resource.visit_count || 0).toLocaleString()}`],
        [text('备用链接', 'Fallback URL'), urlHTML(resource.fallback_url)], [text('备注', 'Remark'), esc(resource.remark || '-')],
      ])) + reviewSection(`${text('目标池', 'Target pool')} · ${targets.length}`, targets.length ? `<div class="saas-review-targets">${targets.map(target => `<article><h4>${esc(target.name || `#${target.id}`)}</h4>${definitionHTML([[text('目标链接', 'Target URL'), urlHTML(target.target_url)], [text('状态 / 健康', 'Status / health'), `${statusText(target.status)} / ${esc(target.health_status)}`], [text('排序 / 权重', 'Order / weight'), `${Number(target.sort_order)} / ${Number(target.weight)}`], [text('开始时间', 'Starts'), dateText(target.starts_at)], [text('到期时间', 'Expires'), dateText(target.expires_at)], [text('访问上限 / 已访问', 'Hit limit / used'), `${limitText(target.max_hits)} / ${Number(target.hit_count || 0).toLocaleString()}`]])}</article>`).join('')}</div>` : `<p class="muted">${text('未配置目标池，使用原链接。', 'No target pool; the original URL is used.')}</p>`);
    }
    return reviewSection(`${text('二维码池', 'QR pool')} · ${(resource.items || []).length}`, (resource.items || []).map(qrItemHTML).join('') || `<p class="muted">${text('暂无二维码项', 'No QR items')}</p>`) + reviewSection(text('活码内容', 'Live QR content'), definitionHTML([
      [text('公开入口', 'Public entry'), urlHTML(`/q/${encodeURIComponent(resource.code)}`)],
      [text('描述', 'Description'), esc(resource.description || '-')], [text('轮换策略', 'Rotation strategy'), strategyText(resource.rotation_strategy)],
      [text('引导标题', 'Guide title'), esc(resource.guide_title || '-')], [text('引导文案', 'Guide text'), esc(resource.guide_text || '-')],
      [text('备用链接', 'Fallback URL'), urlHTML(resource.fallback_url)],
    ]));
  }

  function reviewHistoryHTML(events) {
    return reviewSection(text('审核记录', 'Review history'), events.length ? `<ol class="saas-review-history">${events.map(event => `<li><div><strong>${event.stage === 'tenant' ? text('租户初审', 'Tenant review') : text('平台终审', 'Platform review')} · ${event.action === 'approve' ? text('通过', 'Approved') : text('驳回', 'Rejected')}</strong><span>v${event.content_version} · ${esc(event.actor_name || `#${event.actor_account_id}`)} · ${dateText(event.created_at)}</span></div><p>${esc(event.note || text('未填写意见', 'No review note'))}</p></li>`).join('')}</ol>` : `<p class="muted">${text('暂无审核记录', 'No review history')}</p>`);
  }

  async function openContentReview(type, id, platform, refresh) {
    const dialog = openReviewDialog(text('内容审批详情', 'Content review details'));
    const endpoint = `${platform ? '/api/admin/saas/platform/reviews' : '/api/admin/saas/reviews'}/${type}/${id}`;
    try {
      const detail = (await api(endpoint)).data;
      if (!dialog.open) return;
      const resource = detail.resource;
      const eligibleStates = platform ? ['platform_pending', 'platform_rejected'] : ['tenant_pending', 'tenant_rejected'];
      const eligibleItems = (resource.items || []).filter(item => eligibleStates.includes(item.approval_status));
      const includeItems = type === 'live_qr' && eligibleItems.length ? `<label class="saas-review-checkbox"><input id="saasIncludeItems" type="checkbox" checked><span>${text('同时审核本阶段的二维码项', 'Also review QR items at this stage')} (${eligibleItems.length})</span></label>` : '';
      $('.saas-review-body', dialog).innerHTML = `<div class="saas-review-summary"><span class="type-pill">${resourceLabel(type)} · v${detail.content_version}</span><h3>${esc(resource.title || resource.code || `#${resource.id}`)}</h3><span>${statusText(resource.approval_status)}</span><p>${esc(detail.tenant.name)} · ${accountText(detail.owner)}</p></div>${contentDetailsHTML(detail)}${reviewSection(text('提交信息', 'Submission'), definitionHTML([[text('租户', 'Tenant'), `${esc(detail.tenant.name)} · ${esc(detail.tenant.slug)}`], [text('内容所有者', 'Content owner'), accountText(detail.owner)], [text('创建时间', 'Created'), dateText(resource.created_at)], [text('最近修改', 'Last updated'), dateText(resource.updated_at)], [text('启用状态', 'Availability'), statusText(resource.status)]]))}${reviewHistoryHTML(detail.events || [])}`;
      dialog.insertAdjacentHTML('beforeend', reviewFooter(eligibleStates.includes(resource.approval_status), platform ? text('终审通过', 'Approve final review') : text('提交终审', 'Send to final review'), includeItems));
      $$('img', dialog).forEach(img => img.addEventListener('error', () => { img.closest('figure').querySelector('figcaption').insertAdjacentHTML('afterbegin', `<p>${text('图片加载失败', 'Image unavailable')}</p>`); img.remove(); }));
      bindReviewDecision(dialog, endpoint, { content_version: detail.content_version }, refresh);
    } catch (err) { if (dialog.open) $('.saas-review-body', dialog).textContent = err.message; }
  }

  function priceText(plan) {
    const amount = Number(plan.price_monthly_cents || 0) / 100;
    let formatted;
    try {
      formatted = new Intl.NumberFormat(isZh() ? 'zh-CN' : 'en-US', { style: 'currency', currency: plan.currency || 'CNY' }).format(amount);
    } catch { formatted = `${esc(plan.currency || 'CNY')} ${amount.toFixed(2)}`; }
    return `${formatted} / ${text('月', 'month')}`;
  }

  function featuresText(plan) {
    try {
      const features = JSON.parse(plan.features_json || '{}');
      const labels = { analytics: text('统计分析', 'Analytics'), approval: text('内容审批', 'Content approval'), routing: text('流量路由', 'Traffic routing'), audit: text('审计日志', 'Audit logs'), custom: text('定制服务', 'Customization') };
      return esc(Array.isArray(features) ? features.join(', ') : Object.entries(features).map(([key, value]) => `${labels[key] || key}: ${typeof value === 'boolean' ? (value ? text('支持', 'Enabled') : text('不支持', 'Disabled')) : JSON.stringify(value)}`).join(' · ') || '-');
    } catch { return esc(plan.features_json || '-'); }
  }

  async function openSubscriptionReview(id) {
    const dialog = openReviewDialog(text('套餐申请详情', 'Plan request details'));
    const endpoint = `/api/admin/saas/platform/subscription-requests/${id}`;
    try {
      const detail = (await api(endpoint)).data;
      if (!dialog.open) return;
      const request = detail.request, quota = detail.quota, from = detail.from_plan, to = detail.to_plan;
      const limits = [
        ['max_members', text('成员', 'Members'), quota.members_used], ['max_short_links', text('短链', 'Short links'), quota.short_links_used],
        ['max_live_qrs', text('活码', 'Live QR'), quota.live_qrs_used], ['max_targets_per_link', text('每条短链目标数', 'Targets per link'), null],
        ['monthly_visits', text('月访问量', 'Monthly visits'), quota.monthly_visits_used],
      ];
      const exceeded = limits.filter(([key, , used]) => used !== null && Number(to[key]) > 0 && used > to[key]);
      const warnings = [
        ...(exceeded.length ? [text('当前用量超出申请套餐额度：', 'Current usage exceeds requested limits: ') + exceeded.map(([, label]) => label).join('、')] : []),
        ...(quota.plan.id !== from.id ? [text('租户当前套餐已与提交时不同，请核对后再审批。', 'The current plan has changed since this request was submitted.')] : []),
        ...(to.status !== 'active' ? [text('申请套餐目前已停用。', 'The requested plan is currently disabled.')] : []),
      ];
      const requestInfo = reviewSection(text('申请信息', 'Request'), definitionHTML([
        [text('租户', 'Tenant'), `${esc(detail.tenant.name)} · ${esc(detail.tenant.slug)}`],
        [text('租户状态', 'Tenant status'), statusText(detail.tenant.status)],
        [text('申请人', 'Requested by'), accountText(detail.requester)], [text('租户所有者', 'Tenant owner'), accountText(detail.tenant_owner)],
        [text('申请时间', 'Requested'), dateText(request.created_at)],
      ]));
      const comparison = reviewSection(text('价格与额度对比', 'Price & quota comparison'), `<div class="saas-table-wrap saas-plan-comparison"><table><thead><tr><th>${text('项目', 'Item')}</th><th>${text('原套餐', 'Previous plan')}<small>${esc(from.name)}</small></th><th>${text('申请套餐', 'Requested plan')}<small>${esc(to.name)}</small></th><th>${text('当前用量', 'Current usage')}</th></tr></thead><tbody>
        <tr><th>${text('月费', 'Monthly price')}</th><td>${priceText(from)}</td><td>${priceText(to)}</td><td>-</td></tr>
        ${limits.map(([key, label, used]) => `<tr><th>${label}</th><td>${limitText(from[key])}</td><td class="${from[key] !== to[key] ? 'saas-plan-changed' : ''}">${limitText(to[key])}</td><td>${used === null ? '-' : Number(used || 0).toLocaleString()}</td></tr>`).join('')}
        <tr><th>${text('说明', 'Description')}</th><td>${esc(from.description || '-')}</td><td>${esc(to.description || '-')}</td><td>-</td></tr>
        <tr><th>${text('功能', 'Features')}</th><td>${featuresText(from)}</td><td>${featuresText(to)}</td><td>-</td></tr>
      </tbody></table></div>`);
      const subscriptionInfo = reviewSection(text('当前订阅', 'Current subscription'), definitionHTML([
        [text('当前套餐', 'Current plan'), esc(quota.plan.name)], [text('订阅状态', 'Subscription status'), statusText(quota.subscription.status)],
        [text('用量周期', 'Usage period'), esc(quota.period_key)], [text('订阅开始', 'Period start'), dateText(quota.subscription.current_period_start)],
        [text('订阅到期', 'Period end'), dateText(quota.subscription.current_period_end)], [text('审批结果', 'Review note'), esc(request.review_note || '-')],
      ]));
      const warningHTML = warnings.length ? `<div class="saas-review-warning" role="status"><i class="ph ph-warning" aria-hidden="true"></i><div>${warnings.map(warning => `<p>${esc(warning)}</p>`).join('')}</div></div>` : '';
      $('.saas-review-body', dialog).innerHTML = `<div class="saas-review-summary"><span class="type-pill">${text('套餐变更', 'Plan change')} · #${request.id}</span><h3>${esc(from.name)} <i class="ph ph-arrow-right" aria-hidden="true"></i> ${esc(to.name)}</h3><span>${statusText(request.status)}</span><p>${esc(detail.tenant.name)} · ${accountText(detail.requester)}</p></div>${reviewSection(text('申请说明', 'Request note'), `<p class="saas-review-request-note">${esc(request.note || text('未填写', 'Not provided'))}</p>`)}${warningHTML}${comparison}${requestInfo}${subscriptionInfo}`;
      dialog.insertAdjacentHTML('beforeend', reviewFooter(request.status === 'pending', text('批准套餐变更', 'Approve plan change')));
      bindReviewDecision(dialog, endpoint, {}, renderPlatform);
    } catch (err) { if (dialog.open) $('.saas-review-body', dialog).textContent = err.message; }
  }

  function approvalTable(items, platform) {
    return `<div class="saas-table-wrap saas-review-table"><table><thead><tr><th>${text('内容', 'Content')}</th><th>${text('租户', 'Tenant')}</th><th>${text('版本', 'Version')}</th><th>${text('提交时间', 'Submitted')}</th><th>${text('操作', 'Actions')}</th></tr></thead><tbody>${items.map(item => `<tr><td><strong>${esc(item.title || item.code || `#${item.resource_id}`)}</strong><small>${resourceLabel(item.resource_type)} · ${esc(item.code)} · #${item.resource_id}</small></td><td>${esc(item.tenant_name)}</td><td><code>v${item.content_version}</code></td><td>${dateText(item.updated_at)}</td><td><button class="ghost icon-label-button" data-review-resource="${esc(item.resource_type)}" data-review-id="${item.resource_id}" data-review-stage="${platform ? 'platform' : 'tenant'}"><i class="ph ph-eye" aria-hidden="true"></i>${text('查看并审批', 'Review details')}</button></td></tr>`).join('') || `<tr><td colspan="5" class="saas-review-empty">${text('暂无待审内容', 'No pending content')}</td></tr>`}</tbody></table></div>`;
  }

  async function renderApprovals() {
    const data = await loadBootstrap(true);
    setPage(text('租户审批', 'Tenant approval'), text('租户审核通过后，内容才会进入平台终审队列。', 'Tenant approval submits content to platform review.'), 'approvals');
    if (!['owner', 'admin', 'reviewer'].includes(data.tenant_role)) {
      content().innerHTML = `<div class="empty">${text('当前角色没有审批权限。', 'Your role cannot review content.')}</div>`;
      return;
    }
    const result = await api('/api/admin/saas/reviews?stage=tenant_pending');
    content().innerHTML = `<section class="saas-page"><article class="saas-review-section"><div class="saas-card-head"><h2>${text('等待租户初审', 'Pending tenant review')}</h2><span class="type-pill">${(result.data || []).length}</span></div>${approvalTable(result.data || [], false)}</article></section>`;
    bindReviewButtons(renderApprovals);
  }

  async function renderPlatform() {
    await loadBootstrap(true);
    setPage(text('平台终审', 'Platform review'), text('平台总管理员终审租户内容并审批套餐变更。', 'Final content and subscription review.'), 'platform');
    const [reviews, subscriptions, tenants] = await Promise.all([api('/api/admin/saas/platform/reviews?stage=platform_pending'), api('/api/admin/saas/platform/subscription-requests'), api('/api/admin/saas/platform/tenants?limit=100')]);
    content().innerHTML = `<section class="saas-page"><article class="saas-review-section"><div class="saas-card-head"><h2>${text('内容终审', 'Content final review')}</h2><span class="type-pill">${(reviews.data || []).length}</span></div>${approvalTable(reviews.data || [], true)}</article>
      <article class="saas-review-section"><div class="saas-card-head"><h2>${text('套餐申请', 'Plan requests')}</h2><span class="type-pill">${(subscriptions.data || []).filter(item => item.status === 'pending').length}</span></div><div class="saas-table-wrap saas-review-table"><table><thead><tr><th>${text('租户', 'Tenant')}</th><th>${text('套餐变更', 'Plan change')}</th><th>${text('申请说明', 'Request note')}</th><th>${text('申请时间', 'Requested')}</th><th>${text('操作', 'Actions')}</th></tr></thead><tbody>${(subscriptions.data || []).filter(item => item.status === 'pending').map(item => `<tr><td><strong>${esc(item.tenant_name)}</strong><small>#${item.id}</small></td><td>${esc(item.from_plan)} → ${esc(item.to_plan)}</td><td class="saas-review-note-cell">${esc(item.note || '-')}</td><td>${dateText(item.created_at)}</td><td><button class="ghost icon-label-button" data-subscription-id="${item.id}"><i class="ph ph-eye" aria-hidden="true"></i>${text('查看并审批', 'Review details')}</button></td></tr>`).join('') || `<tr><td colspan="5" class="saas-review-empty">${text('暂无待审申请', 'No pending requests')}</td></tr>`}</tbody></table></div></article>
      <article class="card saas-card"><div class="saas-card-head"><h2>${text('平台租户', 'Platform tenants')}</h2><span class="type-pill">${(tenants.data || []).length}</span></div><div class="saas-tenant-list">${(tenants.data || []).map(item => `<div class="saas-tenant-item"><strong>${esc(item.name)}</strong><span>${esc(item.slug)} · ${esc(item.status)}</span></div>`).join('')}</div></article></section>`;
    bindReviewButtons(renderPlatform);
    $$('[data-subscription-id]').forEach(button => button.addEventListener('click', () => openSubscriptionReview(button.dataset.subscriptionId)));
  }

  function bindReviewButtons(refresh) {
    $$('[data-review-resource]').forEach(button => button.addEventListener('click', () => openContentReview(button.dataset.reviewResource, button.dataset.reviewId, button.dataset.reviewStage === 'platform', refresh)));
  }

  async function renderView(view) {
    try {
      if (view === 'workspace') return await renderWorkspace();
      if (view === 'routing') return await renderRouting();
      if (view === 'subscription') return await renderSubscription();
      if (view === 'approvals') return await renderApprovals();
      if (view === 'platform') return await renderPlatform();
    } catch (err) {
      content().innerHTML = `<div class="empty"><strong>${text('加载失败', 'Load failed')}</strong><p>${esc(err.message)}</p></div>`;
      toast(err.message, true);
    }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-saas-view]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const view = button.dataset.saasView;
    localStorage.setItem('asl_view', `saas:${view}`);
    renderView(view);
  }, true);

  async function start() {
    try {
      await loadBootstrap(true);
      const saved = localStorage.getItem('asl_view') || '';
      if (saved.startsWith('saas:')) await renderView(saved.slice(5));
    } catch (err) {
      console.error('SaaS bootstrap failed', err);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
