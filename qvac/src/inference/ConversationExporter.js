import { Logger } from '../core/Logger.js';

/**
 * ConversationExporter — exports conversations in various formats.
 *
 * Inspired by Solace's conversation export: allows users to export
 * conversations (including branched trees) as JSON, Markdown, or
 * plain text for archival, sharing, or external analysis.
 *
 * Formats:
 *   - json: Full structured export including tree, branches, metadata
 *   - markdown: Human-readable Markdown with branch annotations
 *   - text: Plain text with simple formatting
 *   - openai: OpenAI-compatible chat format (messages array)
 *   - csv: Flat CSV for spreadsheet analysis
 *
 * Works with ConversationBrancher's tree structure.
 */

export class ConversationExporter {
  constructor(config = {}) {
    this.logger = new Logger('ConversationExporter');
    this.enabled = config.enabled !== false;
    this._stats = {
      totalExports: 0,
      byFormat: {},
    };
  }

  /**
   * Export a conversation in the specified format.
   * @param {object} conversationTree - from ConversationBrancher.getTree()
   * @param {string} format - json | markdown | text | openai | csv
   * @param {object} options - { includeBranches, activePathOnly }
   * @returns { content, mimeType, filename }
   */
  export(conversationTree, format = 'json', options = {}) {
    if (!this.enabled || !conversationTree) return null;

    const { includeBranches = true, activePathOnly = false } = options;
    let content, mimeType, filename;

    switch (format) {
      case 'json':
        content = this._exportJSON(conversationTree, { includeBranches, activePathOnly });
        mimeType = 'application/json';
        filename = `${conversationTree.id}.json`;
        break;

      case 'markdown':
      case 'md':
        content = this._exportMarkdown(conversationTree, { includeBranches, activePathOnly });
        mimeType = 'text/markdown';
        filename = `${conversationTree.id}.md`;
        break;

      case 'text':
      case 'txt':
        content = this._exportText(conversationTree, { includeBranches, activePathOnly });
        mimeType = 'text/plain';
        filename = `${conversationTree.id}.txt`;
        break;

      case 'openai':
        content = this._exportOpenAI(conversationTree, { activePathOnly });
        mimeType = 'application/json';
        filename = `${conversationTree.id}-openai.json`;
        break;

      case 'csv':
        content = this._exportCSV(conversationTree, { includeBranches });
        mimeType = 'text/csv';
        filename = `${conversationTree.id}.csv`;
        break;

      default:
        throw new Error(`Unknown export format: ${format}`);
    }

    this._stats.totalExports++;
    this._stats.byFormat[format] = (this._stats.byFormat[format] || 0) + 1;

    return { content, mimeType, filename };
  }

  /**
   * Export as structured JSON.
   */
  _exportJSON(tree, { includeBranches, activePathOnly }) {
    if (activePathOnly) {
      const pathMessages = this._extractActivePath(tree);
      return JSON.stringify({
        id: tree.id,
        exportedAt: Date.now(),
        activePath: pathMessages,
      }, null, 2);
    }

    const exportData = {
      id: tree.id,
      exportedAt: Date.now(),
      createdAt: tree.createdAt,
      updatedAt: tree.updatedAt,
      activeLeafId: tree.activeLeafId,
      activePath: tree.activePath,
      tree: includeBranches ? tree.tree : this._pruneToActivePath(tree),
    };
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Export as Markdown.
   */
  _exportMarkdown(tree, { includeBranches, activePathOnly }) {
    const lines = [];
    lines.push(`# Conversation: ${tree.id}`);
    lines.push(``);
    lines.push(`**Created:** ${new Date(tree.createdAt).toISOString()}`);
    lines.push(`**Last Updated:** ${new Date(tree.updatedAt).toISOString()}`);
    lines.push(``);

    if (activePathOnly || !includeBranches) {
      lines.push(`## Active Path`);
      lines.push(``);
      const messages = this._extractActivePath(tree);
      for (const msg of messages) {
        const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
        lines.push(`### ${role}`);
        lines.push(`> ${msg.content}`);
        lines.push(``);
      }
    } else {
      lines.push(`## Full Conversation Tree`);
      lines.push(``);
      this._renderMarkdownTree(tree.tree, lines, 0);
    }

    return lines.join('\n');
  }

  /**
   * Export as plain text.
   */
  _exportText(tree, { includeBranches, activePathOnly }) {
    const lines = [];
    lines.push(`Conversation: ${tree.id}`);
    lines.push(`Created: ${new Date(tree.createdAt).toISOString()}`);
    lines.push(`${'='.repeat(60)}`);
    lines.push(``);

    if (activePathOnly || !includeBranches) {
      const messages = this._extractActivePath(tree);
      for (const msg of messages) {
        lines.push(`[${msg.role.toUpperCase()}]`);
        lines.push(msg.content);
        lines.push(``);
      }
    } else {
      this._renderTextTree(tree.tree, lines, 0);
    }

    return lines.join('\n');
  }

  /**
   * Export as OpenAI-compatible chat format.
   */
  _exportOpenAI(tree, { activePathOnly = true }) {
    const messages = this._extractActivePath(tree);
    return JSON.stringify({
      model: 'chimera-export',
      messages: messages
        .filter(m => m.role !== 'system' || m.content !== 'New conversation')
        .map(m => ({ role: m.role, content: m.content })),
    }, null, 2);
  }

  /**
   * Export as CSV.
   */
  _exportCSV(tree, { includeBranches }) {
    const rows = [['id', 'role', 'content', 'parentId', 'branchId', 'createdAt', 'isActivePath']];
    const activePathSet = new Set(tree.activePath);

    const walk = (node) => {
      const isActive = activePathSet.has(node.id);
      const content = (node.content || '').replace(/"/g, '""').replace(/\n/g, ' ');
      rows.push([
        node.id,
        node.role,
        `"${content}"`,
        node.parentId || '',
        node.branchId,
        new Date(node.createdAt).toISOString(),
        isActive ? 'yes' : 'no',
      ].join(','));
      for (const child of node.children) {
        walk(child);
      }
    };

    if (includeBranches) {
      walk(tree.tree);
    } else {
      for (const msg of this._extractActivePath(tree)) {
        const content = (msg.content || '').replace(/"/g, '""').replace(/\n/g, ' ');
        rows.push([
          msg.id,
          msg.role,
          `"${content}"`,
          msg.parentId || '',
          msg.branchId,
          new Date(msg.createdAt || 0).toISOString(),
          'yes',
        ].join(','));
      }
    }

    return rows.join('\n');
  }

  /**
   * Extract messages along the active path.
   */
  _extractActivePath(tree) {
    if (!tree.activePath || tree.activePath.length === 0) return [];
    return tree.activePath.map(id => {
      const node = this._findNode(tree.tree, id);
      return node ? { id: node.id, role: node.role, content: node.content, parentId: node.parentId, branchId: node.branchId, createdAt: node.createdAt } : null;
    }).filter(Boolean);
  }

  /**
   * Find a node in the tree by ID.
   */
  _findNode(node, id) {
    if (node.id === id) return node;
    for (const child of node.children || []) {
      const found = this._findNode(child, id);
      if (found) return found;
    }
    return null;
  }

  /**
   * Prune tree to only the active path.
   */
  _pruneToActivePath(tree) {
    const activeSet = new Set(tree.activePath);
    const prune = (node) => ({
      id: node.id,
      role: node.role,
      content: node.content,
      branchId: node.branchId,
      createdAt: node.createdAt,
      children: (node.children || []).filter(c => activeSet.has(c.id)).map(prune),
    });
    return prune(tree.tree);
  }

  /**
   * Render tree as Markdown with branch annotations.
   */
  _renderMarkdownTree(node, lines, depth) {
    const indent = '  '.repeat(depth);
    const role = node.role.charAt(0).toUpperCase() + node.role.slice(1);
    const branchTag = node.branchId !== 'main' ? ` *(${node.branchId})*` : '';

    if (node.role === 'system' && node.content === 'New conversation') {
      // Skip root system message
    } else {
      lines.push(`${indent}### ${role}${branchTag}`);
      lines.push(`${indent}> ${node.content}`);
      lines.push(``);
    }

    for (const child of node.children || []) {
      this._renderMarkdownTree(child, lines, depth + 1);
    }
  }

  /**
   * Render tree as plain text.
   */
  _renderTextTree(node, lines, depth) {
    const indent = '  '.repeat(depth);
    if (node.role === 'system' && node.content === 'New conversation') {
      // Skip root
    } else {
      lines.push(`${indent}[${node.role.toUpperCase()}] (${node.branchId})`);
      lines.push(`${indent}${node.content}`);
      lines.push(`${indent}${'-'.repeat(40)}`);
    }
    for (const child of node.children || []) {
      this._renderTextTree(child, lines, depth + 1);
    }
  }

  /**
   * Get supported export formats.
   */
  getFormats() {
    return [
      { format: 'json', mimeType: 'application/json', description: 'Full structured JSON with tree and branches' },
      { format: 'markdown', mimeType: 'text/markdown', description: 'Human-readable Markdown with branch annotations' },
      { format: 'text', mimeType: 'text/plain', description: 'Plain text with simple formatting' },
      { format: 'openai', mimeType: 'application/json', description: 'OpenAI-compatible chat messages array' },
      { format: 'csv', mimeType: 'text/csv', description: 'Flat CSV for spreadsheet analysis' },
    ];
  }

  getStats() {
    return {
      enabled: this.enabled,
      totalExports: this._stats.totalExports,
      byFormat: this._stats.byFormat,
    };
  }
}
