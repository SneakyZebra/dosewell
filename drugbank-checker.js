// The licensed online lookup is opt-in. Only the operator can configure its origin.
function configuredGateway() {
  const setting = document.querySelector('meta[name="dosewell-drugbank-gateway"]')?.content;
  if (!setting) return null;
  try {
    const url = new URL(setting);
    if (url.protocol === 'https:' && !url.username && !url.password && url.href === url.origin + '/') return url.origin;
  } catch {}
  return null;
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(text, onClick) {
  const node = element('button', text, 'btn outline');
  node.type = 'button';
  node.onclick = onClick;
  return node;
}

export function attachDrugBank(container) {
  const gateway = configuredGateway();
  if (!gateway) return () => {};
  const panel = element('section', '', 'panel db-panel');
  const heading = element('h2', 'Check with DrugBank');
  heading.id = 'db-title';
  panel.setAttribute('aria-labelledby', heading.id);
  const intro = element('p', 'Choose a product for each medicine you want to check. Each search sends the name you enter through Dosewell’s online service to DrugBank. The final check sends the product IDs. Your dose history and reminders stay on this device.');
  const body = element('div');
  panel.append(heading, intro, body);
  container.append(panel);
  let signature, activeSession;
  return function update(rows) {
    const names = rows.map(row => row.name);
    const next = JSON.stringify(names);
    if (signature === next) return;
    signature = next;
    activeSession?.abort();
    activeSession = new AbortController();
    const {signal} = activeSession;
    body.replaceChildren();
    if (names.length < 2 || names.length > 40) {
      body.append(element('p', 'Choose between 2 and 40 medicines in the list above for an online check.'));
      return;
    }
    const start = button('Review medicines for DrugBank', () => prepare(names, body, gateway, signal));
    body.append(start);
  };
}

async function query(gateway, path, payload, signal) {
  const res = await fetch(gateway + path, {method: 'POST', body: JSON.stringify(payload), signal,
    headers: {'Content-Type': 'application/json'}, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error'});
  if (!res.ok) throw Error(res.status === 429 ? 'The service is busy. Try again in a minute.' : 'DrugBank is unavailable. Try again when you have a connection.');
  return res.json();
}

function prepare(names, body, gateway, signal) {
  body.replaceChildren(element('p', 'Match each entry to its name and formulation on the prescription label. Use the list above to remove any medicine you want to leave out.'));
  const list = element('ol', '', 'db-matches');
  const status = element('p'); status.setAttribute('role', 'status');
  const choices = Array(names.length).fill(null);
  const results = element('div');
  let revision = 0, checking = false;
  const check = button('Check confirmed products', run);
  check.className = 'btn primary';
  function changed() {
    revision++;
    results.replaceChildren();
    status.textContent = '';
    const ready = choices.every(Boolean);
    const unique = new Set(choices.filter(Boolean).map(p => p.id));
    if (ready && unique.size < choices.length) status.textContent = 'Two entries match the same product. Review your selections or remove the repeated entry above.';
    check.disabled = checking || !ready || unique.size !== choices.length;
  }
  function setChoice(i, product) { choices[i] = product; changed(); }
  for (const [i, name] of names.entries()) {
    const row = element('li');
    const label = element('label', name);
    const input = element('input'); input.type = 'search'; input.maxLength = 240; input.value = name;
    input.id = 'db-name-' + i; label.htmlFor = input.id;
    const feedback = element('p'); feedback.setAttribute('role', 'status');
    const options = element('div');
    const form = element('form', '', 'db-search');
    const find = element('button', 'Find product', 'btn outline'); find.type = 'submit';
    let searchVersion = 0;
    input.oninput = () => { searchVersion++; find.disabled = false; options.replaceChildren(); feedback.textContent = ''; setChoice(i, null); };
    form.onsubmit = async event => {
      event.preventDefault();
      if (find.disabled) return;
      const name = input.value.trim(), version = ++searchVersion;
      setChoice(i, null); options.replaceChildren();
      if (name.length < 2) {feedback.textContent = 'Enter at least two characters.'; return;}
      find.disabled = true; feedback.textContent = 'Searching DrugBank…';
      try {
        const {products} = await query(gateway, '/search', {name}, signal);
        if (signal.aborted || version !== searchVersion) return;
        if (!Array.isArray(products)) throw Error('The product search could not be read. Try again.');
        if (!products.length) { feedback.textContent = 'No matching product. Try the generic name and formulation.'; return; }
        const labelSelect = element('label', 'Confirm product for ' + names[i]);
        const select = element('select'); select.id = 'db-product-' + i; labelSelect.htmlFor = select.id;
        const empty = element('option', 'Select a matching product'); empty.value = ''; select.append(empty);
        products.forEach((product, index) => { const option = element('option', product.name); option.value = String(index); select.append(option); });
        select.onchange = () => setChoice(i, select.value === '' ? null : products[Number(select.value)]);
        options.append(labelSelect, select); feedback.textContent = 'Choose a matching product below, or refine your search.';
      } catch (error) { if (!signal.aborted && version === searchVersion) feedback.textContent = error.message || 'Product search failed.'; }
      finally { if (version === searchVersion) find.disabled = false; }
    };
    form.append(input, find); row.append(label, form, feedback, options); list.append(row);
  }
  async function run() {
    if (check.disabled) return;
    const version = revision, selection = choices.slice();
    checking = true; check.disabled = true; results.replaceChildren(); status.textContent = 'Checking confirmed products…';
    try {
      const {findings} = await query(gateway, '/check', {ids: selection.map(p => p.id)}, signal);
      if (signal.aborted || revision !== version) return;
      if (!Array.isArray(findings)) throw Error('An incomplete report was returned. Try again.');
      const byId = new Map(selection.map(p => [p.id, p.name]));
      const ranks = {major: 0, moderate: 1, minor: 2};
      findings.sort((a,b) => (ranks[a.severity] ?? 3) - (ranks[b.severity] ?? 3));
      status.textContent = findings.length ? 'DrugBank returned ' + findings.length + (findings.length === 1 ? ' interaction.' : ' interactions.') :
        'DrugBank returned no listed interactions for the confirmed products. Other risks may still apply.';
      const cards = element('ul', '', 'db-findings');
      for (const f of findings) {
        const item = element('li', '', 'ic-finding');
        item.append(element('strong', f.severity), element('h4', byId.get(f.first) + ' + ' + byId.get(f.second)), element('p', f.description));
        cards.append(item);
      }
      results.append(cards, element('p', 'Results from the DrugBank Clinical API. Review medication changes with your pharmacist or prescriber.'));
    } catch (error) { if (!signal.aborted && revision === version) status.textContent = error.message || 'The check could not be completed.'; }
    finally { checking = false; check.disabled = !choices.every(Boolean) || new Set(choices.map(p => p?.id)).size !== choices.length; }
  }
  body.append(list, check, status, results); changed();
  list.querySelector('input')?.focus();
}
