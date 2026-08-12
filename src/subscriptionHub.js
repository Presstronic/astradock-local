const crypto = require('node:crypto');

class SubscriptionHub {
  constructor(options = {}) {
    this.channel = options.channel;
    this.maxSubscribers = options.maxSubscribers || 8;
    this.maxQueuedChanges = options.maxQueuedChanges || 1;
    this.now = options.now || (() => new Date().toISOString());
    this.subscribers = new Map();
    this.sequence = 0;
  }

  add(webContents, options = {}) {
    this.cleanupDestroyed();
    if (!webContents || webContents.isDestroyed?.()) {
      const error = new Error('Cannot subscribe a destroyed renderer.');
      error.code = 'invalid_sender';
      throw error;
    }
    if (this.subscribers.size >= this.maxSubscribers) {
      const error = new Error('Too many active subscriptions.');
      error.code = 'invalid_payload';
      throw error;
    }

    const subscriptionId = `sub_${crypto.randomBytes(12).toString('hex')}`;
    this.subscribers.set(subscriptionId, {
      subscriptionId,
      webContents,
      webContentsId: webContents.id,
      resumeAfter: Number(options.resumeAfter || 0),
      queue: [],
      dropped: 0,
      scheduled: false
    });
    return {
      subscriptionId,
      sequence: this.sequence
    };
  }

  remove(subscriptionId) {
    return this.subscribers.delete(subscriptionId);
  }

  removeForWebContents(webContentsId) {
    for (const [subscriptionId, subscriber] of this.subscribers.entries()) {
      if (subscriber.webContentsId === webContentsId) this.subscribers.delete(subscriptionId);
    }
  }

  publish(change) {
    const envelope = {
      sequence: ++this.sequence,
      emittedAt: this.now(),
      change
    };

    for (const subscriber of this.subscribers.values()) {
      if (subscriber.webContents.isDestroyed?.()) {
        this.subscribers.delete(subscriber.subscriptionId);
        continue;
      }
      this.enqueue(subscriber, envelope);
    }

    return envelope.sequence;
  }

  getStats() {
    this.cleanupDestroyed();
    return {
      sequence: this.sequence,
      subscriberCount: this.subscribers.size
    };
  }

  cleanupDestroyed() {
    for (const [subscriptionId, subscriber] of this.subscribers.entries()) {
      if (subscriber.webContents.isDestroyed?.()) this.subscribers.delete(subscriptionId);
    }
  }

  enqueue(subscriber, envelope) {
    if (subscriber.queue.length >= this.maxQueuedChanges) {
      subscriber.queue.splice(0, subscriber.queue.length - this.maxQueuedChanges + 1);
      subscriber.dropped += 1;
    }
    subscriber.queue.push(envelope);

    if (subscriber.scheduled) return;
    subscriber.scheduled = true;
    setImmediate(() => this.flush(subscriber.subscriptionId));
  }

  flush(subscriptionId) {
    const subscriber = this.subscribers.get(subscriptionId);
    if (!subscriber) return;
    subscriber.scheduled = false;

    if (subscriber.webContents.isDestroyed?.()) {
      this.subscribers.delete(subscriptionId);
      return;
    }

    const changes = subscriber.queue.splice(0);
    if (!changes.length) return;
    const dropped = subscriber.dropped;
    subscriber.dropped = 0;

    subscriber.webContents.send(this.channel, {
      subscriptionId,
      version: 1,
      dropped,
      changes
    });
  }
}

module.exports = {
  SubscriptionHub
};
