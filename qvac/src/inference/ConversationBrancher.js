import crypto from 'crypto';
import { Logger } from '../core/Logger.js';

/**
 * ConversationBrancher — allows branching conversations from any point,
 * creating alternative paths that can be explored independently.
 *
 * Inspired by Solace's conversation branching: each conversation is a
 * tree of messages. Users can branch from any message to explore
 * alternative responses, what-ifs, or corrections without losing
 * the original thread.
 *
 * Data model:
 *   Conversation
 *     └── Messages (tree, each message has parentId)
 *         └── Branches (alternative children of the same parent)
 *
 * Each conversation has a root message. Each message has:
 *   { id, role, content, parentId, children: [], branchId, createdAt }
 *
 * A "path" is a route from root to a leaf. The "active path" is the
 * currently selected route through the tree.
 */

export class ConversationBrancher {
  constructor(config = {}) {
    this.logger = new Logger('ConversationBrancher');
    this.enabled = config.enabled !== false;
    this._conversations = new Map(); // conversationId -> Conversation
    this._stats = {
      totalConversations: 0,
      totalBranches: 0,
      totalMessages: 0,
    };
  }

  /**
   * Create a new conversation.
   */
  create(systemPrompt = null) {
    const id = `conv-${crypto.randomUUID().slice(0, 12)}`;
    const rootId = `msg-${crypto.randomUUID().slice(0, 12)}`;
    const rootMsg = {
      id: rootId,
      role: 'system',
      content: systemPrompt || 'New conversation',
      parentId: null,
      children: [],
      branchId: 'main',
      createdAt: Date.now(),
    };

    const conversation = {
      id,
      rootId,
      messages: new Map([[rootId, rootMsg]]),
      activePath: [rootId],
      activeLeafId: rootId,
      branchCounter: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this._conversations.set(id, conversation);
    this._stats.totalConversations++;
    this._stats.totalMessages++;
    this.logger.info(`Created conversation: ${id}`);
    return { id, rootId };
  }

  /**
   * Add a message to the conversation at the current active leaf.
   */
  addMessage(conversationId, { role, content }) {
    const conv = this._conversations.get(conversationId);
    if (!conv) throw new Error(`Conversation ${conversationId} not found`);

    const msgId = `msg-${crypto.randomUUID().slice(0, 12)}`;
    const parent = conv.messages.get(conv.activeLeafId);

    const msg = {
      id: msgId,
      role,
      content,
      parentId: conv.activeLeafId,
      children: [],
      branchId: parent ? parent.branchId : 'main',
      createdAt: Date.now(),
    };

    conv.messages.set(msgId, msg);
    if (parent) parent.children.push(msgId);

    // Update active path
    conv.activePath.push(msgId);
    conv.activeLeafId = msgId;
    conv.updatedAt = Date.now();
    this._stats.totalMessages++;

    return msg;
  }

  /**
   * Branch from a specific message — create a new branch starting
   * from the given message as the parent.
   * @param {string} conversationId
   * @param {string} fromMsgId - message to branch from
   * @param {object} firstMessage - { role, content } for the first message in the new branch
   * @returns the new branch info and first message
   */
  branch(conversationId, fromMsgId, firstMessage) {
    const conv = this._conversations.get(conversationId);
    if (!conv) throw new Error(`Conversation ${conversationId} not found`);

    const parent = conv.messages.get(fromMsgId);
    if (!parent) throw new Error(`Message ${fromMsgId} not found`);

    conv.branchCounter++;
    const branchId = `branch-${conv.branchCounter}`;
    const msgId = `msg-${crypto.randomUUID().slice(0, 12)}`;

    const msg = {
      id: msgId,
      role: firstMessage.role,
      content: firstMessage.content,
      parentId: fromMsgId,
      children: [],
      branchId,
      createdAt: Date.now(),
    };

    conv.messages.set(msgId, msg);
    parent.children.push(msgId);

    // Compute new active path: root → ... → fromMsgId → msgId
    conv.activePath = this._computePath(conv, fromMsgId).concat(msgId);
    conv.activeLeafId = msgId;
    conv.updatedAt = Date.now();

    this._stats.totalBranches++;
    this._stats.totalMessages++;
    this.logger.info(`Branched from ${fromMsgId} → ${branchId} in ${conversationId}`);

    return { branchId, message: msg };
  }

  /**
   * Switch to an existing branch (change active path).
   */
  switchBranch(conversationId, leafMsgId) {
    const conv = this._conversations.get(conversationId);
    if (!conv) throw new Error(`Conversation ${conversationId} not found`);
    if (!conv.messages.has(leafMsgId)) throw new Error(`Message ${leafMsgId} not found`);

    conv.activePath = this._computePath(conv, leafMsgId);
    conv.activeLeafId = leafMsgId;
    conv.updatedAt = Date.now();
    return conv.activePath;
  }

  /**
   * Get the active path as an array of messages (for inference history).
   */
  getActiveHistory(conversationId) {
    const conv = this._conversations.get(conversationId);
    if (!conv) return [];
    return conv.activePath.map(id => {
      const msg = conv.messages.get(id);
      return { role: msg.role, content: msg.content, id: msg.id, branchId: msg.branchId };
    }).filter(m => m.role !== 'system' || m.content !== 'New conversation');
  }

  /**
   * Get all branches in a conversation.
   */
  getBranches(conversationId) {
    const conv = this._conversations.get(conversationId);
    if (!conv) return [];

    const branches = new Map();
    for (const [msgId, msg] of conv.messages) {
      if (!branches.has(msg.branchId)) {
        branches.set(msg.branchId, { branchId: msg.branchId, messages: [] });
      }
      branches.get(msg.branchId).messages.push({ id: msg.id, role: msg.role, content: msg.content, parentId: msg.parentId });
    }
    return Array.from(branches.values());
  }

  /**
   * Get the full message tree.
   */
  getTree(conversationId) {
    const conv = this._conversations.get(conversationId);
    if (!conv) return null;

    const buildNode = (msgId) => {
      const msg = conv.messages.get(msgId);
      return {
        id: msg.id,
        role: msg.role,
        content: msg.content,
        branchId: msg.branchId,
        createdAt: msg.createdAt,
        children: msg.children.map(buildNode),
      };
    };

    return {
      id: conv.id,
      rootId: conv.rootId,
      activeLeafId: conv.activeLeafId,
      activePath: conv.activePath,
      tree: buildNode(conv.rootId),
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    };
  }

  /**
   * List all conversations.
   */
  list() {
    return Array.from(this._conversations.values()).map(c => ({
      id: c.id,
      messageCount: c.messages.size,
      branchCount: c.branchCounter,
      activeLeafId: c.activeLeafId,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  /**
   * Delete a conversation.
   */
  delete(conversationId) {
    return this._conversations.delete(conversationId);
  }

  /**
   * Compute the path from root to a given message.
   */
  _computePath(conv, targetMsgId) {
    const path = [];
    let current = targetMsgId;
    while (current) {
      path.unshift(current);
      const msg = conv.messages.get(current);
      current = msg?.parentId;
    }
    return path;
  }

  getStats() {
    return {
      enabled: this.enabled,
      totalConversations: this._stats.totalConversations,
      activeConversations: this._conversations.size,
      totalBranches: this._stats.totalBranches,
      totalMessages: this._stats.totalMessages,
    };
  }
}
