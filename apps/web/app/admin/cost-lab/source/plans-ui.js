(function () {
  'use strict';
  /*
    플랜 기본값 탭. 계산은 `lib/admin/cost-forecast/subscription-plans.ts` 가 하고
    여기서는 그리기와 적용만 한다. 크레딧은 고정, 목표 마진·추가 할인만 바꾼다.

    적용은 단추로만 한다. 숫자를 고칠 때마다 통합 요약에 밀어 넣으면 그쪽에서
    손보던 조건이 매번 초기화된다. 처음 열 때만(공유 링크로 연 게 아니면) 선택한
    플랜을 한 번 넣는다.
  */
  const api = window.FormWithForecast, el = id => document.getElementById(id);
  if (!api?.pricePlans || !el('plans')) return;
  const KEY = 'mcs-plan-defaults-v1';
  const won = x => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.round(x)) + '원';
  const pct = x => x.toFixed(1) + '%';
  const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const defaults = () => api.PLAN_DEFAULTS.map(p => ({ ...p }));

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (raw) {
        const plans = api.validatePlanInputs(raw.plans);
        return { plans, selected: plans.some(p => p.id === raw.selected) ? raw.selected : plans[0].id };
      }
    } catch { /* 저장값이 없거나 깨졌으면 기본값 */ }
    return { plans: defaults(), selected: 'basic' };
  }
  let { plans, selected } = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ plans, selected })); } catch { /* 저장 못 해도 화면은 동작 */ } };

  const input = (p, field, label) =>
    `<span class="inputbox"><input type="number" data-plan="${esc(p.id)}" data-plan-field="${field}" min="0" max="90" step="0.1" value="${p[field]}" aria-label="${esc(p.name)} ${label}"><span>%</span></span>`;

  function build() {
    el('plans-rows').innerHTML = plans.map(p => `<tr>
      <td><label><input type="radio" name="plan-apply" value="${esc(p.id)}" ${p.id === selected ? 'checked' : ''}> <strong>${esc(p.name)}</strong></label></td>
      <td>${p.credits}개</td><td>${input(p, 'targetPct', '목표 마진')}</td><td>${input(p, 'discountPct', '추가 할인')}</td>
      <td id="plan-list-${p.id}"></td><td id="plan-paid-${p.id}"></td><td id="plan-unit-${p.id}"></td>
      <td id="plan-margin-${p.id}"></td><td id="plan-bonus-${p.id}"></td><td id="plan-off-${p.id}"></td></tr>`).join('');
    render();
  }

  function render() {
    const priced = api.pricePlans(plans);
    priced.forEach((p, i) => {
      el('plan-list-' + p.id).textContent = won(p.listPrice);
      el('plan-paid-' + p.id).textContent = won(p.paidPrice);
      el('plan-unit-' + p.id).textContent = won(p.unitPrice);
      el('plan-margin-' + p.id).textContent = pct(p.marginPct);
      el('plan-bonus-' + p.id).textContent = i === 0 ? '기준' : (p.bonusPct >= 0 ? '+' : '') + p.bonusPct + '%';
      el('plan-off-' + p.id).textContent = i === 0 ? '기준' : p.unitDiscountPct + '% 할인';
    });
    el('plans-usage').innerHTML = priced.map(p =>
      `<tr><td><strong>${esc(p.name)}</strong></td><td>${p.usage.pdp}번</td><td>${p.usage.cardnews}세트</td><td>${p.usage.images}장</td><td>${p.usage.print}장</td></tr>`).join('');
    el('plans-wadiz').innerHTML = priced.map(p =>
      `<tr><td><strong>${esc(p.name)}</strong></td><td>${pct(p.marginPct)}</td><td>${pct(p.wadizMarginPct)}</td><td>${pct(p.allInMarginPct)}</td></tr>`).join('');
    const low = priced.filter(p => p.wadizMarginPct < 30).map(p => p.name);
    el('plans-wadiz-note').textContent = low.length
      ? `이 가격 그대로 와디즈에서 팔면 처음 목표였던 「최소 30%」 아래로 내려가는 상품이 있습니다: ${low.join('·')}. 와디즈용 가격을 따로 둘지, 와디즈 기간에는 적게 남기는 것을 받아들일지 정해야 합니다.`
      : '와디즈 수수료 15%를 빼도 모든 상품이 30% 이상 남습니다. 서버·이벤트 예산까지 빼면 달라질 수 있습니다.';
    const basic = priced[0];
    el('plans-bonus-note').textContent = `크레딧 더 받음: 같은 돈을 ${basic.name} 단가(1개 ${won(basic.unitPrice)})로 샀을 때보다 몇 % 더 받는지입니다. 추가 할인을 넣으면 고객 결제액 기준으로 다시 비교합니다.`;
  }

  function apply(id, announce) {
    const p = api.pricePlans(plans).find(x => x.id === id);
    if (!p) return;
    if (typeof state === 'object' && typeof hydrate === 'function') {
      delete state.lockedPlan;
      state.price = p.paidPrice; state.credits = p.credits;
      hydrate();
    }
    if (window.FormWithWallet) window.FormWithWallet.restore({ ...window.FormWithWallet.read(), topup: p.paidPrice });
    if (window.FormWithForecastController) { window.FormWithForecastController.restoreLegacy('overview'); window.FormWithForecastController.setPolicy('image-v2'); }
    const message = `통합 요약·충전형 크레딧에 ${p.name}(${won(p.paidPrice)} · ${p.credits}크레딧)을 넣었습니다.`;
    el('plans-applied').textContent = message;
    if (announce && typeof toast === 'function') toast(message);
  }

  el('plans').addEventListener('input', e => {
    const t = e.target;
    if (!t.dataset.planField || t.value === '') return;
    const next = plans.map(p => p.id === t.dataset.plan ? { ...p, [t.dataset.planField]: Number(t.value) } : p);
    try {
      api.validatePlanInputs(next);
    } catch {
      t.setAttribute('aria-invalid', 'true');
      el('plans-error').hidden = false;
      return;
    }
    t.removeAttribute('aria-invalid');
    el('plans-error').hidden = true;
    plans = next; save(); render();
  });
  el('plans').addEventListener('change', e => {
    if (e.target.name === 'plan-apply') { selected = e.target.value; save(); }
  });
  el('plans-apply').onclick = () => apply(selected, true);
  el('plans-reset').onclick = () => { plans = defaults(); selected = 'basic'; save(); build(); el('plans-error').hidden = true; };

  build();
  if (!(typeof hasRestoredSession !== 'undefined' && hasRestoredSession)) apply(selected, false);
})();
