const crypto = require('node:crypto');
const c = require('./contracts');
const { unavailableAdapter } = require('./adapter');

const freshState = () => ({ version: 1, profile: null, session: null, credentials: null, consent: { catalogRead: false, inventoryRead: false, inventoryWrite: false, paused: true }, inventory: null, catalog: [], proposals: [], operations: [], seen: [] });
const clone = value => structuredClone(value);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const pending = operation => !['applied', 'rejected', 'cancelled', 'conflict'].includes(operation.status);

/** Account authority lives here, never in renderer state or a button's visibility. */
class StationService {
  constructor({ repository, adapter = unavailableAdapter, now = () => new Date(), random = Math.random } = {}) {
    this.repository = repository;
    this.adapter = adapter;
    this.now = now;
    this.random = random;
    this.epoch = 0;
    this.controllers = new Set();
    this.reviews = new Map();
    this.state = repository?.load() || freshState();
    if (this.state.version !== 1 || !Array.isArray(this.state.operations) || !Array.isArray(this.state.proposals) || this.state.operations.length > 500 || this.state.proposals.length > 500) c.invalid('Station storage has an unsupported state. Existing data was retained.');
    if (!Array.isArray(this.state.seen) || this.state.seen.length > 10000 || this.state.seen.some(id => !/^[a-f0-9]{64}$/.test(id))) c.invalid();
    if (this.state.profile) this.state.profile = c.profile(this.state.profile);
    if (this.state.session) this.state.session = c.session(this.state.session);
    if (this.state.inventory && (!Array.isArray(this.state.inventory.items) || this.state.inventory.items.length > 10000)) c.invalid();
    // A crash after dispatch is an uncertain server outcome, never a new write.
    if (this.state.operations.some(operation => operation.status === 'sending')) this.update(state => { for (const operation of state.operations) if (operation.status === 'sending') operation.status = 'unknown'; });
    this.network = 'unknown';
  }
  update(mutator) {
    if (!this.repository) throw new c.StationError('station_storage_unavailable', 'Protected Station storage is unavailable. Local monitoring remains available.');
    const next = clone(this.state);
    mutator(next);
    this.repository.save(next);
    this.state = next;
  }
  contextKey() { return this.state.session && this.state.profile ? digest([this.state.profile.apiBaseUrl, this.state.session.subject, this.state.session.gameBinding]) : null; }
  interrupt() { this.epoch++; for (const controller of this.controllers) controller.abort(); this.controllers.clear(); this.reviews.clear(); }
  async remote(work) {
    if (!this.adapter.available) throw new c.StationError('station_not_supported', 'Station API support is awaiting the reviewed developer-portal contract.');
    const epoch = this.epoch;
    const controller = new AbortController();
    this.controllers.add(controller);
    try {
      const result = await work({ profile: clone(this.state.profile), session: clone(this.state.session), credentials: clone(this.state.credentials), signal: controller.signal });
      if (epoch !== this.epoch || controller.signal.aborted) throw new c.StationError('station_cancelled', 'The Station account or request changed. Try again.');
      this.network = 'online';
      return result;
    } catch (error) {
      if (epoch !== this.epoch) throw new c.StationError('station_cancelled', 'The Station account or request changed.');
      if (error?.code === 'station_denied') {
        this.interrupt();
        this.update(state => { state.session.capabilities = { catalogRead: false, inventoryRead: false, inventoryWrite: false }; state.inventory = null; state.catalog = []; });
      }
      if (error?.code === 'station_auth_required') this.update(state => { if (state.session) state.session.expiresAt = '1970-01-01T00:00:00.000Z'; });
      this.network = 'offline';
      if (error instanceof c.StationError) throw error;
      throw new c.StationError('station_offline', 'Station could not complete the request. Your confirmed inventory is unchanged.');
    } finally { this.controllers.delete(controller); }
  }
  assertAllowed(capability) {
    if (!this.state.session || !this.state.credentials || Date.parse(this.state.session.expiresAt) <= this.now().valueOf()) throw new c.StationError('station_auth_required', 'Refresh Station access or sign in again.');
    if (!this.state.session.capabilities[capability]) throw new c.StationError('station_denied', 'Your Station account does not permit this operation.');
    if (!this.state.consent[capability]) throw new c.StationError('station_consent_required', 'Enable consent for this Station capability first.');
  }
  async allowed(capability) {
    if (this.state.session && Date.parse(this.state.session.expiresAt) <= this.now().valueOf()) await this.refreshAccess();
    this.assertAllowed(capability);
  }
  snapshot() {
    const state = this.state;
    const expired = state.session && Date.parse(state.session.expiresAt) <= this.now().valueOf();
    const canRead = Boolean(state.session?.capabilities.inventoryRead && state.consent.inventoryRead);
    const inventory = canRead && state.inventory?.contextKey === this.contextKey() ? clone(state.inventory) : null;
    if (inventory) delete inventory.contextKey;
    return {
      storageAvailable: Boolean(this.repository), adapterAvailable: this.adapter.available, adapterMessage: this.adapter.status || null,
      state: !this.repository ? 'storage_unavailable' : !state.profile ? 'not_configured' : !state.session ? this.adapter.available ? 'signed_out' : 'api_unavailable' : expired ? 'expired' : this.network !== 'online' ? 'offline' : 'connected',
      profile: clone(state.profile), session: state.session ? { displayName: state.session.displayName, roles: [...state.session.roles], permissions: [...state.session.permissions], capabilities: { ...state.session.capabilities }, expiresAt: state.session.expiresAt } : null,
      consent: { ...state.consent }, inventory,
      proposals: canRead ? state.proposals.filter(item => item.contextKey === this.contextKey()).map(({ contextKey, ...item }) => clone(item)) : [],
      operations: canRead ? state.operations.filter(item => item.contextKey === this.contextKey()).map(item => ({ id: item.id, proposalId: item.proposalId, status: item.status, attempts: item.attempts, nextAttemptAt: item.nextAttemptAt, reason: item.reason })) : [],
      review: null
    };
  }
  configure(value) {
    const profile = c.profile(value);
    if (JSON.stringify(profile) === JSON.stringify(this.state.profile)) return this.snapshot();
    this.interrupt();
    this.update(state => { state.profile = profile; state.session = null; state.credentials = null; state.inventory = null; state.catalog = []; state.proposals = []; state.consent = freshState().consent; for (const op of state.operations) if (op.status === 'queued' || op.status === 'retry') op.status = 'cancelled'; });
    return this.snapshot();
  }
  async signIn() {
    if (!this.state.profile) throw new c.StationError('station_not_configured', 'Configure your Station service first.');
    this.interrupt();
    const result = await this.remote(context => this.adapter.authenticate(context));
    const session = c.session(result.session);
    if (Date.parse(session.expiresAt) <= this.now().valueOf() || !result.credentials || typeof result.credentials !== 'object' || Buffer.byteLength(JSON.stringify(result.credentials)) > 16384) c.invalid();
    this.update(state => { state.session = session; state.credentials = clone(result.credentials); state.inventory = null; state.catalog = []; state.proposals = []; state.consent = freshState().consent; });
    return this.snapshot();
  }
  cancelSignIn() { this.interrupt(); return this.snapshot(); }
  signOut() {
    this.interrupt();
    this.update(state => { state.session = null; state.credentials = null; state.inventory = null; state.catalog = []; state.proposals = []; state.consent = freshState().consent; for (const op of state.operations) if (['queued', 'retry'].includes(op.status)) op.status = 'cancelled'; });
    return this.snapshot();
  }
  async refreshAccess() {
    if (!this.state.session) throw new c.StationError('station_auth_required', 'Sign in to Station first.');
    const previous = this.state.session;
    const refreshed = await this.remote(context => this.adapter.refreshAccess(context));
    const result = c.session(refreshed.session || refreshed);
    if (refreshed.session) {
      c.object(refreshed, ['session', 'credentials']);
      if (refreshed.credentials && (typeof refreshed.credentials !== 'object' || Buffer.byteLength(JSON.stringify(refreshed.credentials)) > 16384)) c.invalid();
    }
    if (result.subject !== previous.subject || result.gameBinding !== previous.gameBinding || Date.parse(result.expiresAt) <= this.now().valueOf()) { this.signOut(); c.invalid('Station account binding changed. Sign in again.'); }
    this.update(state => { state.session = result; if (refreshed.credentials) state.credentials = clone(refreshed.credentials); if (!result.capabilities.inventoryRead) state.inventory = null; if (!result.capabilities.catalogRead) state.catalog = []; });
    if (result.authorizationRevision !== previous.authorizationRevision || JSON.stringify(result.capabilities) !== JSON.stringify(previous.capabilities)) this.reviews.clear();
    return this.snapshot();
  }
  setConsent(patch) {
    c.consent(patch);
    for (const capability of c.CAPABILITIES) if (patch[capability] === true && (!this.state.session?.capabilities[capability] || Date.parse(this.state.session.expiresAt) <= this.now().valueOf())) throw new c.StationError('station_denied', 'Your current Station access does not permit this consent.');
    this.interrupt();
    this.update(state => { state.consent = { ...state.consent, ...patch }; });
    return this.snapshot();
  }
  async refreshInventory() {
    await this.allowed('inventoryRead');
    const key = this.contextKey();
    const epoch = this.epoch;
    let cursor = null;
    let baseline = null;
    const items = [];
    const ids = new Set();
    const cursors = new Set();
    for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
      this.assertAllowed('inventoryRead');
      const page = c.inventoryPage(await this.remote(context => this.adapter.readInventory({ ...context, cursor })));
      if (epoch !== this.epoch || key !== this.contextKey()) throw new c.StationError('station_cancelled', 'Inventory refresh was cancelled.');
      if (baseline && ['revision', 'environmentKey', 'epoch'].some(field => page[field] !== baseline[field])) c.invalid('Station inventory changed during pagination. Refresh again.');
      baseline = baseline || page;
      for (const item of page.items) { if (ids.has(item.id)) c.invalid(); ids.add(item.id); items.push(item); }
      if (items.length > 10000) c.invalid('Station inventory exceeds the supported snapshot size.');
      if (page.complete && page.nextCursor === null) {
        this.update(state => { state.inventory = { contextKey: key, revision: page.revision, environmentKey: page.environmentKey, epoch: page.epoch, items, lastUpdatedAt: this.now().toISOString(), stale: false }; });
        this.reviews.clear();
        return this.snapshot();
      }
      if (page.complete || !page.nextCursor || cursors.has(page.nextCursor)) c.invalid();
      cursors.add(page.nextCursor); cursor = page.nextCursor;
    }
    c.invalid('Station inventory pagination exceeded the supported limit.');
  }
  async resolveItems(ids) {
    await this.allowed('catalogRead');
    const requested = [...new Set(ids.map(id => c.text(id)))];
    if (!requested.length || requested.length > 100) c.invalid();
    const result = await this.remote(context => this.adapter.resolveItems({ ...context, ids: requested }));
    if (!Array.isArray(result) || result.length > requested.length) c.invalid();
    const seen = new Set();
    const entries = result.map(item => {
      c.object(item, ['gameId', 'itemId', 'name', 'status', 'revision', 'expiresAt']);
      if (!requested.includes(item.gameId) || seen.has(item.gameId) || !['exact', 'unknown', 'ambiguous', 'unsupported'].includes(item.status)) c.invalid();
      seen.add(item.gameId);
      return { gameId: item.gameId, itemId: item.status === 'exact' ? c.text(item.itemId) : null, name: item.name === null ? null : c.text(item.name, 160), status: item.status, revision: c.text(item.revision), expiresAt: c.instant(item.expiresAt), retrievedAt: this.now().toISOString() };
    });
    this.update(state => { state.catalog = [...entries, ...state.catalog.filter(item => !seen.has(item.gameId))].slice(0, 1000); });
    return clone(entries);
  }
  /** Privileged evidence adapter input. Deliberately absent from renderer IPC. */
  offerQualifiedChange(change) {
    c.object(change, ['eventId', 'ruleVersion', 'kind', 'itemId', 'quantity', 'unit', 'environmentKey', 'epoch', 'sourceTimestamp', 'ingestedAt', 'gameBuild', 'provenance', 'confidence']);
    for (const field of ['eventId', 'ruleVersion', 'itemId', 'environmentKey', 'epoch', 'gameBuild']) c.text(change[field]);
    c.instant(change.sourceTimestamp);
    c.instant(change.ingestedAt);
    if (!['observed', 'inferred'].includes(change.provenance) || !['confirmed', 'high'].includes(change.confidence)) c.invalid('This observation is not qualified for an inventory proposal.');
    if (change.unit !== 'items') c.invalid('Only explicitly counted discrete inventory items are supported.');
    if (!['acquire', 'sale', 'drop', 'loss'].includes(change.kind) || !Number.isSafeInteger(change.quantity) || change.quantity <= 0 || !this.contextKey()) c.invalid();
    const id = digest([this.contextKey(), change.eventId, change.ruleVersion]);
    const existing = this.state.proposals.find(item => item.id === id);
    if (existing) { if (digest(existing.change) !== digest(change)) c.invalid(); return id; }
    if (this.state.seen.includes(id)) return id;
    if (this.state.proposals.length >= 500) throw new c.StationError('station_capacity', 'Resolve existing inventory proposals before collecting more.');
    this.update(state => { state.proposals.push({ id, contextKey: this.contextKey(), change: clone(change), status: 'awaiting_review', reason: null }); });
    return id;
  }
  getProposal(id) { const item = this.state.proposals.find(item => item.id === id && item.contextKey === this.contextKey()); if (!item) c.invalid('That inventory proposal is unavailable.'); return item; }
  review(proposalId) {
    this.assertAllowed('inventoryWrite');
    this.assertAllowed('inventoryRead');
    const proposal = this.getProposal(proposalId);
    if (proposal.status !== 'awaiting_review' && proposal.status !== 'conflict') c.invalid('That proposal cannot be reviewed in its current state.');
    const inventory = this.state.inventory;
    if (!inventory || inventory.stale || inventory.environmentKey !== proposal.change.environmentKey || inventory.epoch !== proposal.change.epoch) throw new c.StationError('station_conflict', 'Refresh the matching environment inventory before reviewing this change.');
    const matches = inventory.items.filter(item => item.itemId === proposal.change.itemId);
    const catalog = this.state.session.capabilities.catalogRead && this.state.consent.catalogRead
      ? this.state.catalog.find(item => item.itemId === proposal.change.itemId && item.status === 'exact' && Date.parse(item.expiresAt) > this.now().valueOf()) : null;
    if (matches.length > 1 || (!matches.length && (proposal.change.kind !== 'acquire' || !catalog))) throw new c.StationError('station_conflict', 'This item requires an unambiguous Station inventory mapping before review.');
    const item = matches[0] || { id: null, itemId: proposal.change.itemId, name: catalog.name, quantity: 0, unit: 'items' };
    if (item.unit !== proposal.change.unit) c.invalid('The inventory quantity unit does not match the proposed change.');
    const after = item.quantity + (proposal.change.kind === 'acquire' ? 1 : -1) * proposal.change.quantity;
    if (!Number.isSafeInteger(after) || after < 0) c.invalid('The proposed quantity is invalid for the current inventory.');
    const review = { proposalId, stage: 1, challenge: crypto.randomUUID(), fingerprint: digest([proposal.change, inventory.revision, this.state.session.authorizationRevision]), expiresAt: this.now().valueOf() + 5 * 60000, before: item.quantity, after, name: item.name || item.itemId, unit: item.unit, itemRowId: item.id, baselineRevision: inventory.revision };
    this.reviews.set(proposalId, review);
    return this.reviewSnapshot(review);
  }
  reviewSnapshot(review) { return { ...this.snapshot(), review: { proposalId: review.proposalId, stage: review.stage, challenge: review.challenge, before: review.before, after: review.after, name: review.name, unit: review.unit } }; }
  confirm(proposalId, challenge) {
    this.assertAllowed('inventoryWrite'); this.assertAllowed('inventoryRead');
    const proposal = this.getProposal(proposalId);
    const review = this.reviews.get(proposalId);
    if (!review || review.challenge !== challenge || review.expiresAt <= this.now().valueOf() || review.fingerprint !== digest([proposal.change, this.state.inventory?.revision, this.state.session.authorizationRevision])) { this.reviews.delete(proposalId); throw new c.StationError('station_conflict', 'The review changed or expired. Review the change again.'); }
    if (review.stage === 1) { review.stage = 2; review.challenge = crypto.randomUUID(); return this.reviewSnapshot(review); }
    if (this.state.seen.length >= 10000) throw new c.StationError('station_capacity', 'Synchronization deduplication capacity reached. No new change was submitted.');
    if (this.state.operations.length >= 500) throw new c.StationError('station_capacity', 'The durable queue is full. Resolve operations before submitting more.');
    const operation = { id: crypto.randomUUID(), proposalId, contextKey: this.contextKey(), status: 'queued', attempts: 0, nextAttemptAt: null, reason: null, confirmedAt: this.now().toISOString(), payload: { ...clone(proposal.change), itemRowId: review.itemRowId, expectedRevision: review.baselineRevision } };
    operation.receipt = digest([operation.id, operation.contextKey, operation.payload, operation.confirmedAt, 'review-plus-two-confirmations']);
    this.update(state => { state.operations.push(operation); if (!state.seen.includes(proposalId)) state.seen.push(proposalId); state.proposals.find(item => item.id === proposalId).status = 'queued'; });
    this.reviews.delete(proposalId);
    return this.snapshot();
  }
  cancel(proposalId) { this.reviews.delete(proposalId); return this.snapshot(); }
  reject(proposalId) { const proposal = this.getProposal(proposalId); if (!['awaiting_review', 'conflict'].includes(proposal.status)) c.invalid(); this.reviews.delete(proposalId); this.update(state => { state.proposals.find(item => item.id === proposalId).status = 'rejected'; }); return this.snapshot(); }
  async dispatch() {
    if (this.dispatching || this.state.consent.paused || !this.adapter.available) return this.snapshot();
    this.dispatching = true;
    try {
      await this.allowed('inventoryWrite');
      await this.allowed('inventoryRead');
      if (this.state.consent.paused) return this.snapshot();
      const operation = this.state.operations.find(item => item.contextKey === this.contextKey() && ['queued', 'retry', 'unknown'].includes(item.status) && (!item.nextAttemptAt || Date.parse(item.nextAttemptAt) <= this.now().valueOf()));
      if (!operation) return this.snapshot();
      if (operation.attempts === 0 && (!this.state.inventory || this.state.inventory.stale || operation.payload.expectedRevision !== this.state.inventory.revision)) {
        this.update(state => { state.operations.find(item => item.id === operation.id).status = 'conflict'; const proposal = state.proposals.find(item => item.id === operation.proposalId); if (proposal) proposal.status = 'conflict'; });
        return this.snapshot();
      }
      if (operation.receipt !== digest([operation.id, operation.contextKey, operation.payload, operation.confirmedAt, 'review-plus-two-confirmations'])) c.invalid('The stored inventory confirmation is invalid.');
      const retrySafe = this.adapter.idempotencyWindowMs > this.now().valueOf() - Date.parse(operation.confirmedAt);
      if (operation.attempts > 0 && !retrySafe) return this.snapshot();
      this.update(state => { const op = state.operations.find(item => item.id === operation.id); op.status = 'sending'; op.attempts++; });
      const epoch = this.epoch;
      try {
        const result = await this.remote(context => this.adapter.applyOperation({ ...context, operation: { id: operation.id, ...clone(operation.payload) } }));
        c.object(result, ['operationId', 'status', 'revision']);
        if (result.operationId !== operation.id || !['applied', 'duplicate', 'rejected', 'conflict', 'pending'].includes(result.status)) c.invalid();
        if (['applied', 'duplicate'].includes(result.status)) c.text(result.revision);
        this.update(state => { const op = state.operations.find(item => item.id === operation.id); op.status = result.status === 'duplicate' ? 'applied' : result.status === 'pending' ? 'unknown' : result.status; op.reason = result.status === 'conflict' ? 'Station changed. Refresh and review again.' : null; const proposal = state.proposals.find(item => item.id === operation.proposalId); if (proposal) proposal.status = op.status; if (state.inventory && op.status === 'applied') state.inventory.stale = true; });
      } catch (error) {
        this.update(state => { const op = state.operations.find(item => item.id === operation.id); op.status = error.code === 'station_conflict' ? 'conflict' : epoch !== this.epoch || ['station_denied', 'station_auth_required', 'station_contract_invalid'].includes(error.code) || !retrySafe ? 'unknown' : 'retry'; op.reason = error instanceof c.StationError ? error.message : 'The remote outcome is unknown.'; op.nextAttemptAt = op.status === 'retry' ? new Date(this.now().valueOf() + Math.max(error.retryAfterMs || 0, Math.min(300000, 1000 * 2 ** Math.min(op.attempts, 8)) * (0.75 + this.random() * 0.5))).toISOString() : null; const proposal = state.proposals.find(item => item.id === operation.proposalId); if (proposal) proposal.status = op.status; });
      }
      if (this.state.inventory?.stale && epoch === this.epoch) { try { await this.refreshInventory(); } catch { /* Preserve the stale confirmed baseline and its original freshness. */ } }
      return this.snapshot();
    } finally { this.dispatching = false; }
  }
  reset() {
    if (!this.repository) return this.snapshot();
    if (this.state.operations.some(pending)) throw new c.StationError('station_pending_operations', 'Reconcile pending or unknown Station operations before resetting local app data.');
    this.interrupt(); this.update(state => { const seen = state.seen; Object.assign(state, freshState(), { seen }); }); return this.snapshot();
  }
  async command(command, payload) {
    const data = c.validateCommand(command, payload);
    if (command === 'snapshot') return this.snapshot();
    if (command === 'configure') return this.configure(data);
    if (command === 'consent') { const snapshot = this.setConsent(data); return data.paused === false ? this.dispatch() : snapshot; }
    if (command === 'review') return this.review(data.proposalId);
    if (command === 'confirm') return this.confirm(data.proposalId, data.challenge);
    if (command === 'cancel') return this.cancel(data.proposalId);
    if (command === 'reject') return this.reject(data.proposalId);
    if (command === 'resolveItems') return this.resolveItems(data.ids);
    if (command === 'retry') return this.dispatch();
    return this[command]();
  }
  close() { this.interrupt(); this.repository?.close(); }
}
module.exports = { StationService, freshState };
