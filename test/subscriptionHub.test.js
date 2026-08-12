const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { SubscriptionHub } = require('../src/subscriptionHub');

class FakeWebContents extends EventEmitter {
  constructor(id) {
    super();
    this.id = id;
    this.destroyed = false;
    this.sent = [];
  }

  isDestroyed() {
    return this.destroyed;
  }

  send(channel, message) {
    this.sent.push({ channel, message });
  }

  destroy() {
    this.destroyed = true;
    this.emit('destroyed');
  }
}

function nextTick() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('subscription hub publishes one canonical bounded stream per subscriber', async () => {
  const webContents = new FakeWebContents(1);
  const hub = new SubscriptionHub({
    channel: 'test:subscription',
    maxQueuedChanges: 1,
    now: () => '2026-08-11T12:00:00.000Z'
  });
  const subscription = hub.add(webContents);

  hub.publish({ type: 'monitor.scan', scan: { scannedAt: 'first' } });
  hub.publish({ type: 'monitor.scan', scan: { scannedAt: 'second' } });
  await nextTick();

  assert.equal(subscription.sequence, 0);
  assert.equal(webContents.sent.length, 1);
  assert.equal(webContents.sent[0].channel, 'test:subscription');
  assert.equal(webContents.sent[0].message.subscriptionId, subscription.subscriptionId);
  assert.equal(webContents.sent[0].message.dropped, 1);
  assert.equal(webContents.sent[0].message.changes.length, 1);
  assert.equal(webContents.sent[0].message.changes[0].sequence, 2);
});

test('subscription hub cleans up destroyed renderers and removed subscriptions', async () => {
  const webContents = new FakeWebContents(7);
  const hub = new SubscriptionHub({ channel: 'test:subscription' });
  const subscription = hub.add(webContents);

  webContents.destroy();
  hub.publish({ type: 'monitor.scan' });
  await nextTick();

  assert.equal(hub.getStats().subscriberCount, 0);
  assert.equal(webContents.sent.length, 0);

  const second = new FakeWebContents(8);
  const secondSubscription = hub.add(second);
  assert.equal(hub.remove(secondSubscription.subscriptionId), true);
  hub.publish({ type: 'monitor.scan' });
  await nextTick();
  assert.equal(second.sent.length, 0);
  assert.notEqual(subscription.subscriptionId, secondSubscription.subscriptionId);
});
