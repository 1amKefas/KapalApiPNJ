/**
 * PreVis — AI Chatbot Widget
 * Self-contained module that injects a floating chat interface
 * powered by NLP Pipeline + Ollama (via /api/chat SSE endpoint)
 */

(function () {
  'use strict';

  // =============================================
  // SVG Icons
  // =============================================
  const ICONS = {
    chat: `<svg viewBox="0 0 24 24" class="icon-chat"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/></svg>`,
    close: `<svg viewBox="0 0 24 24" class="icon-close"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
    bot: `<svg viewBox="0 0 24 24"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1.07A7 7 0 0 1 14 23h-4a7 7 0 0 1-6.93-4H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2zm-4 13a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>`,
    user: `<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`,
    send: `<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`,
    clear: `<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
    sparkle: `<svg viewBox="0 0 24 24"><path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61z"/></svg>`,
  };

  // =============================================
  // State
  // =============================================
  let isOpen = false;
  let isStreaming = false;
  let conversationHistory = [];
  let ollamaOnline = null;
  // =============================================
  // DOM Injection
  // =============================================
  function injectChatbot() {
    // Don't inject on login page
    if (window.location.pathname.includes('login')) return;

    const container = document.createElement('div');
    container.id = 'chatbot-container';
    container.innerHTML = `
      <!-- Floating Action Button -->
      <button class="chatbot-fab" id="chatbot-fab" aria-label="Open AI Assistant">
        ${ICONS.chat}
        ${ICONS.close}
      </button>

      <!-- Chat Panel -->
      <div class="chatbot-panel" id="chatbot-panel">
        <div class="chatbot-header">
          <div class="chatbot-avatar">${ICONS.bot}</div>
          <div class="chatbot-header-info">
            <div class="chatbot-header-title">PreVis AI Assistant</div>
            <div class="chatbot-header-subtitle">
              <span class="chatbot-status-dot" id="chatbot-status-dot"></span>
              <span id="chatbot-status-text">Checking...</span>
            </div>
          </div>
          <div class="chatbot-header-actions">
            <button class="chatbot-header-btn" id="chatbot-clear-btn" title="Clear chat">
              ${ICONS.clear}
            </button>
          </div>
        </div>

        <div class="chatbot-messages" id="chatbot-messages">
          <div class="chatbot-welcome" id="chatbot-welcome">
            <div class="chatbot-welcome-icon">${ICONS.sparkle}</div>
            <h3>Hi! I'm your AI assistant 👋</h3>
            <p>I can help you with machine health analysis, maintenance recommendations, and predictive insights.</p>
            <div class="chatbot-suggestions">
              <button class="chatbot-suggestion" data-msg="What machines are critical right now?">Critical machines?</button>
              <button class="chatbot-suggestion" data-msg="Give me a system health overview">System overview</button>
              <button class="chatbot-suggestion" data-msg="What maintenance actions do you recommend?">Maintenance tips</button>
            </div>
          </div>
        </div>

        <div class="chatbot-input-area">
          <div class="chatbot-input-wrapper">
            <textarea class="chatbot-input" id="chatbot-input"
              placeholder="Ask about machine health..."
              rows="1"
              aria-label="Chat message"></textarea>
          </div>
          <button class="chatbot-send-btn" id="chatbot-send-btn" disabled aria-label="Send message">
            ${ICONS.send}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(container);
    setupEventListeners();
    checkOllamaHealth();
    restoreState();
  }

  // =============================================
  // Event Listeners
  // =============================================
  function setupEventListeners() {
    const fab = document.getElementById('chatbot-fab');
    const input = document.getElementById('chatbot-input');
    const sendBtn = document.getElementById('chatbot-send-btn');
    const clearBtn = document.getElementById('chatbot-clear-btn');

    // Toggle panel
    fab.addEventListener('click', togglePanel);

    // Send message
    sendBtn.addEventListener('click', sendMessage);

    // Input handling
    input.addEventListener('input', () => {
      autoResizeTextarea(input);
      const hasText = input.value.trim().length > 0;
      sendBtn.disabled = !hasText || isStreaming;
      sendBtn.classList.toggle('active', hasText && !isStreaming);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!isStreaming && input.value.trim()) {
          sendMessage();
        }
      }
    });

    // Clear chat
    clearBtn.addEventListener('click', clearChat);

    // Suggestion buttons
    document.querySelectorAll('.chatbot-suggestion').forEach(btn => {
      btn.addEventListener('click', () => {
        const msg = btn.getAttribute('data-msg');
        document.getElementById('chatbot-input').value = msg;
        sendMessage();
      });
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) {
        togglePanel();
      }
    });
  }

  // =============================================
  // Panel Toggle
  // =============================================
  function togglePanel() {
    isOpen = !isOpen;
    const fab = document.getElementById('chatbot-fab');
    const panel = document.getElementById('chatbot-panel');

    fab.classList.toggle('open', isOpen);
    panel.classList.toggle('open', isOpen);

    if (isOpen) {
      setTimeout(() => {
        document.getElementById('chatbot-input').focus();
      }, 350);
    }

    sessionStorage.setItem('previs_chatbot_open', isOpen);
  }

  // =============================================
  // State Persistence
  // =============================================
  function saveConversation() {
    sessionStorage.setItem('previs_chatbot_history', JSON.stringify(conversationHistory));
  }

  function restoreState() {
    // Restore panel open/closed
    const wasOpen = sessionStorage.getItem('previs_chatbot_open') === 'true';
    if (wasOpen) {
      togglePanel();
    }

    // Restore conversation history
    try {
      const saved = sessionStorage.getItem('previs_chatbot_history');
      if (saved) {
        conversationHistory = JSON.parse(saved);
        if (conversationHistory.length > 0) {
          // Hide welcome and re-render all saved messages
          const welcome = document.getElementById('chatbot-welcome');
          if (welcome) welcome.style.display = 'none';

          conversationHistory.forEach(msg => {
            appendMessage(msg.role === 'assistant' ? 'bot' : 'user', msg.content);
          });
        }
      }
    } catch {
      conversationHistory = [];
    }
  }

  // =============================================
  // Health Check
  // =============================================
  async function checkOllamaHealth() {
    const dot = document.getElementById('chatbot-status-dot');
    const text = document.getElementById('chatbot-status-text');

    try {
      const res = await fetch('/api/chat/health');
      const data = await res.json();

      if (data.status === 'ok' && data.model_loaded) {
        ollamaOnline = true;
        dot.classList.remove('offline');
        let statusText = `Powered by ${data.model}`;
        if (data.nlp_service?.online) {
          statusText += ' + NLP';
        } else {
          statusText += ' (NLP offline)';
        }
        text.textContent = statusText;
      } else if (data.status === 'ok' && !data.model_loaded) {
        ollamaOnline = false;
        dot.classList.add('offline');
        text.textContent = 'Model not found';
      } else {
        ollamaOnline = false;
        dot.classList.add('offline');
        text.textContent = 'Ollama offline';
      }
    } catch {
      ollamaOnline = false;
      dot.classList.add('offline');
      text.textContent = 'Ollama offline';
    }
  }

  // =============================================
  // Send Message
  // =============================================
  async function sendMessage() {
    const input = document.getElementById('chatbot-input');
    const message = input.value.trim();
    if (!message || isStreaming) return;

    // Hide welcome
    const welcome = document.getElementById('chatbot-welcome');
    if (welcome) welcome.style.display = 'none';

    // Add user message
    appendMessage('user', message);
    conversationHistory.push({ role: 'user', content: message });
    saveConversation();

    // Clear input
    input.value = '';
    autoResizeTextarea(input);
    const sendBtn = document.getElementById('chatbot-send-btn');
    sendBtn.disabled = true;
    sendBtn.classList.remove('active');

    // Show typing indicator
    const typingEl = showTyping();
    isStreaming = true;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history: conversationHistory.slice(0, -1), // Don't include the message we just sent (server adds it)
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Read the SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let botMessage = '';
      let botBubble = null;
      let buffer = '';

      // Remove typing indicator and create bot message bubble
      removeTyping(typingEl);
      botBubble = appendMessage('bot', '', true);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') continue;

            try {
              const data = JSON.parse(dataStr);

              // Capture status updates (e.g. "Processing NLP...", "Thinking...")
              if (data.status) {
                const statusEl = document.getElementById('chatbot-typing-status-text');
                if (statusEl) statusEl.textContent = data.status;
                continue;
              }

              if (data.error) {
                botMessage = `⚠️ ${data.error}`;
                updateBotBubble(botBubble, botMessage);
                break;
              }
              if (data.token) {
                botMessage += data.token;
                updateBotBubble(botBubble, botMessage);
              }
            } catch {
              // Skip malformed data
            }
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        const remaining = buffer.split('\n');
        for (const line of remaining) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const data = JSON.parse(dataStr);
              if (data.token) {
                botMessage += data.token;
                updateBotBubble(botBubble, botMessage);
              }
            } catch {
              // Skip
            }
          }
        }
      }

      if (botMessage) {
        conversationHistory.push({ role: 'assistant', content: botMessage });
        saveConversation();
      }

    } catch (err) {
      removeTyping(typingEl);
      appendError(`Failed to reach AI assistant. ${ollamaOnline === false ? 'Make sure Ollama is running.' : err.message}`);
      console.error('Chatbot error:', err);
    } finally {
      isStreaming = false;
      // Re-enable input
      const currentText = document.getElementById('chatbot-input').value.trim();
      const btn = document.getElementById('chatbot-send-btn');
      btn.disabled = !currentText;
      btn.classList.toggle('active', !!currentText);
    }
  }

  // DOM Helpers
  // =============================================
  function appendMessage(role, content, isStreaming = false) {
    const messages = document.getElementById('chatbot-messages');
    const msgEl = document.createElement('div');
    msgEl.className = `chatbot-msg ${role}`;

    const avatarIcon = role === 'user' ? ICONS.user : ICONS.bot;
    const bubbleContent = isStreaming ? '<span class="chatbot-stream-cursor">▊</span>' : renderMarkdown(content);

    msgEl.innerHTML = `
      <div class="chatbot-msg-avatar">${avatarIcon}</div>
      <div class="chatbot-msg-bubble">${bubbleContent}</div>
    `;

    messages.appendChild(msgEl);
    scrollToBottom();

    return isStreaming ? msgEl.querySelector('.chatbot-msg-bubble') : null;
  }

  function updateBotBubble(bubble, content) {
    if (!bubble) return;
    bubble.innerHTML = renderMarkdown(content);
    scrollToBottom();
  }

  function showTyping() {
    const messages = document.getElementById('chatbot-messages');
    const el = document.createElement('div');
    el.className = 'chatbot-typing';
    el.innerHTML = `
      <div class="chatbot-msg-avatar">${ICONS.bot}</div>
      <div class="chatbot-typing-dots">
        <span id="chatbot-typing-status-text" style="font-size: 0.75rem; color: var(--text-muted); margin-right: 6px; font-weight: 500;">Processing...</span>
        <span></span><span></span><span></span>
      </div>
    `;
    messages.appendChild(el);
    scrollToBottom();
    return el;
  }

  function removeTyping(el) {
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }

  function appendError(msg) {
    const messages = document.getElementById('chatbot-messages');
    const el = document.createElement('div');
    el.className = 'chatbot-error';
    el.textContent = msg;
    messages.appendChild(el);
    scrollToBottom();
  }

  function clearChat() {
    const messages = document.getElementById('chatbot-messages');
    conversationHistory = [];
    sessionStorage.removeItem('previs_chatbot_history');

    // Remove all messages except welcome
    const children = Array.from(messages.children);
    children.forEach(child => {
      if (!child.classList.contains('chatbot-welcome')) {
        messages.removeChild(child);
      }
    });

    // Show welcome again
    const welcome = document.getElementById('chatbot-welcome');
    if (welcome) welcome.style.display = '';
  }

  function scrollToBottom() {
    const messages = document.getElementById('chatbot-messages');
    requestAnimationFrame(() => {
      messages.scrollTop = messages.scrollHeight;
    });
  }

  function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
  }

  // =============================================
  // Markdown Renderer (lightweight)
  // =============================================
  function renderMarkdown(text) {
    if (!text) return '';

    let html = escapeHtml(text);

    // Code blocks (```...```)
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre><code>${code.trim()}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Tables
    html = renderMarkdownTables(html);

    // Unordered lists
    html = html.replace(/^[\s]*[-•]\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/((?:<li>.*<\/li>\s*)+)/g, '<ul>$1</ul>');

    // Ordered lists
    html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');

    // Paragraphs (double newlines)
    html = html.replace(/\n\n+/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');

    // Wrap in paragraph if not already in a block element
    if (!html.startsWith('<')) {
      html = `<p>${html}</p>`;
    }

    return html;
  }

  function renderMarkdownTables(html) {
    const lines = html.split('\n');
    const output = [];

    for (let i = 0; i < lines.length; i++) {
      const header = parseTableRow(lines[i]);
      const separator = parseTableRow(lines[i + 1] || '');

      if (!header || !separator || header.length !== separator.length ||
          !separator.every(cell => /^:?-{3,}:?$/.test(cell))) {
        output.push(lines[i]);
        continue;
      }

      const rows = [];
      i += 2;
      while (i < lines.length) {
        const row = parseTableRow(lines[i]);
        if (!row) break;
        rows.push(row);
        i++;
      }
      i--;

      const headings = header.map(cell => `<th>${cell}</th>`).join('');
      const body = rows.map(row => {
        const cells = header.map((_, index) => `<td>${row[index] || ''}</td>`).join('');
        return `<tr>${cells}</tr>`;
      }).join('');

      output.push(`<div class="chatbot-table-wrap"><table><thead><tr>${headings}</tr></thead><tbody>${body}</tbody></table></div>`);
    }

    return output.join('\n');
  }

  function parseTableRow(line) {
    const trimmed = line.trim();
    if (!trimmed.includes('|')) return null;

    const cells = trimmed
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(cell => cell.trim());

    return cells.length > 1 ? cells : null;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // =============================================
  // Initialize
  // =============================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectChatbot);
  } else {
    injectChatbot();
  }

})();
