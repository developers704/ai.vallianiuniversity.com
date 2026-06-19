(function () {
  "use strict";

  function resolveApiBase() {
    if (typeof window !== "undefined" && window.VALLIANI_CHAT_API) {
      return String(window.VALLIANI_CHAT_API).replace(/\/$/, "");
    }
    if (typeof window !== "undefined" && window.location) {
      var host = window.location.hostname;
      if (
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "ai.vallianiuniversity.com"
      ) {
        return window.location.origin;
      }
    }
    return "https://ai.vallianiuniversity.com";
  }

  function createSessionId() {
    return (
      "vj_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 11)
    );
  }

  function loadSessionId() {
    try {
      var saved = localStorage.getItem("valliani_chat_session");
      if (saved && typeof saved === "string" && saved.trim()) {
        return saved.trim();
      }
    } catch (e) {}
    var id = createSessionId();
    try {
      localStorage.setItem("valliani_chat_session", id);
    } catch (e) {}
    return id;
  }

  function persistSessionId(id) {
    if (!id) return;
    state.sessionId = id;
    try {
      localStorage.setItem("valliani_chat_session", id);
    } catch (e) {}
  }

  function resolveContactUrl() {
    if (typeof window !== "undefined" && window.VALLIANI_CONTACT_URL) {
      return String(window.VALLIANI_CONTACT_URL);
    }
    return "https://www.vallianijewelers.com/pages/contact";
  }

  var CONFIG = {
    apiBase: resolveApiBase(),
    contactUrl: resolveContactUrl(),
    brandName: "Valliani Jewelers",
    accent: "#c9a962",
    dark: "#1a1a1a",
    version: "2.3.5",
  };

  var state = {
    open: false,
    sessionId: loadSessionId(),
    loading: false,
    messages: [],
  };

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (key === "className") node.className = attrs[key];
        else if (key === "text") node.textContent = attrs[key];
        else if (key === "html") node.innerHTML = attrs[key];
        else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), attrs[key]);
        else node.setAttribute(key, attrs[key]);
      });
    }
    if (children) {
      children.forEach(function (child) {
        if (child) node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
      });
    }
    return node;
  }

  function injectStyles() {
    var styleId = "valliani-chat-styles";
    var existing = document.getElementById(styleId);
    if (existing) existing.remove();
    var css = document.createElement("style");
    css.id = styleId;
    css.textContent =
      "#valliani-chat-root{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;" +
      "z-index:999999;position:fixed;bottom:20px;right:20px}" +
      "#valliani-chat-root.vj-open #valliani-chat-btn{display:none}" +
      "#valliani-chat-btn{width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;" +
      "background:" + CONFIG.dark + ";color:#fff;box-shadow:0 4px 20px rgba(0,0,0,.25);" +
      "display:flex;align-items:center;justify-content:center;transition:transform .2s}" +
      "#valliani-chat-btn:hover{transform:scale(1.05)}" +
      "#valliani-chat-panel{display:none;position:absolute;bottom:76px;right:0;width:380px;max-width:calc(100vw - 32px);" +
      "height:520px;max-height:calc(100dvh - 120px);background:#fff;border-radius:16px;" +
      "box-shadow:0 8px 40px rgba(0,0,0,.18);flex-direction:column;overflow:hidden;" +
      "border:1px solid #e5e5e5;animation:vjSlideUp .25s ease}" +
      "#valliani-chat-panel.open{display:flex}" +
      "@keyframes vjSlideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}" +
      ".vj-header{background:" + CONFIG.dark + ";color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-shrink:0}" +
      ".vj-header-text{flex:1;min-width:0}" +
      ".vj-header h3{margin:0;font-size:15px;font-weight:600}" +
      ".vj-header p{margin:2px 0 0;font-size:11px;opacity:.75}" +
      ".vj-close-btn{flex-shrink:0;width:36px;height:36px;min-width:36px;min-height:36px;border:2px solid " + CONFIG.accent + ";border-radius:50%;cursor:pointer;" +
      "background:" + CONFIG.accent + ";color:" + CONFIG.dark + ";display:flex;align-items:center;justify-content:center;" +
      "transition:transform .2s,opacity .2s;padding:0;font-size:26px;font-weight:400;line-height:1;font-family:Arial,sans-serif}" +
      ".vj-close-btn:hover{transform:scale(1.08);opacity:.92}" +
      ".vj-close-btn svg{display:block}" +
      ".vj-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;background:#fafafa}" +
      ".vj-msg{max-width:88%;padding:10px 14px;border-radius:14px;font-size:13px;line-height:1.55;word-wrap:break-word;white-space:pre-wrap}" +
      ".vj-msg.user{align-self:flex-end;background:" + CONFIG.dark + ";color:#fff;border-bottom-right-radius:4px;white-space:pre-wrap}" +
      ".vj-msg.bot{align-self:flex-start;background:#fff;border:1px solid #e5e5e5;color:#1a1a1a;border-bottom-left-radius:4px}" +
      ".vj-msg.loading{opacity:.6;font-style:italic}" +
      ".vj-products{display:flex;flex-direction:column;gap:8px;margin-top:8px}" +
      ".vj-product{display:flex;gap:10px;padding:10px;border:1px solid #e5e5e5;border-radius:12px;background:#fff;text-decoration:none;color:inherit}" +
      ".vj-product:hover{border-color:" + CONFIG.accent + "}" +
      ".vj-product img{width:64px;height:64px;object-fit:cover;border-radius:8px;background:#f5f5f5}" +
      ".vj-product-info{flex:1;min-width:0}" +
      ".vj-product-title{font-size:12px;font-weight:600;margin:0 0 4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}" +
      ".vj-product-price{font-size:13px;color:" + CONFIG.accent + ";font-weight:600;margin:0}" +
      ".vj-product-avail{font-size:10px;margin:2px 0 0;color:#666}" +
      ".vj-input-area{border-top:1px solid #e5e5e5;padding:12px;background:#fff;display:flex;flex-direction:column;gap:8px}" +
      ".vj-input-row{display:flex;gap:8px}" +
      ".vj-input{flex:1;min-width:0;border:1px solid #e5e5e5;border-radius:24px;padding:10px 16px;font-size:16px;outline:none}" +
      ".vj-input:focus{border-color:" + CONFIG.accent + "}" +
      ".vj-send{width:40px;height:40px;border-radius:50%;border:none;background:" + CONFIG.accent + ";color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}" +
      ".vj-send:disabled{opacity:.5;cursor:not-allowed}" +
      ".vj-human-btn{font-size:11px;color:#666;background:none;border:none;cursor:pointer;text-align:center;padding:4px}" +
      ".vj-human-btn:hover{color:" + CONFIG.accent + "}" +
      ".vj-powered{text-align:center;font-size:9px;color:#bbb;padding-bottom:4px}" +
      "@media(max-width:480px){" +
      "#valliani-chat-root{bottom:max(12px,env(safe-area-inset-bottom));right:max(12px,env(safe-area-inset-right))}" +
      "#valliani-chat-root.vj-open{bottom:0;right:0;left:0;top:0;width:100%;height:100%;pointer-events:none}" +
      "#valliani-chat-root.vj-open #valliani-chat-panel{pointer-events:auto}" +
      "#valliani-chat-panel{width:calc(100vw - 24px);max-width:none;" +
      "height:min(560px,calc(100dvh - 96px));bottom:72px;right:0;left:auto}" +
      "#valliani-chat-root.vj-open #valliani-chat-panel{position:fixed;inset:0;width:100%;height:100%;max-height:100dvh;" +
      "bottom:0;right:0;left:0;top:0;border-radius:0;border:none;box-shadow:none}" +
      ".vj-header{padding-top:max(14px,env(safe-area-inset-top));padding-left:max(16px,env(safe-area-inset-left));padding-right:max(16px,env(safe-area-inset-right))}" +
      ".vj-input-area{padding-bottom:max(12px,env(safe-area-inset-bottom))}" +
      ".vj-messages{padding:12px}" +
      "}";
    document.head.appendChild(css);
  }

  function formatPrice(price, currency) {
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency || "USD",
      }).format(price);
    } catch (e) {
      return "$" + price;
    }
  }

  function renderProductCard(product) {
    var card = el("a", {
      className: "vj-product",
      href: product.url,
      target: "_blank",
      rel: "noopener noreferrer",
    });

    if (product.image) {
      card.appendChild(el("img", { src: product.image, alt: product.title }));
    }

    var info = el("div", { className: "vj-product-info" });
    info.appendChild(el("p", { className: "vj-product-title", text: product.title }));
    info.appendChild(
      el("p", {
        className: "vj-product-price",
        text: formatPrice(product.price, product.currency),
      })
    );
    info.appendChild(
      el("p", {
        className: "vj-product-avail",
        text: product.available ? "In Stock" : "Currently Unavailable",
      })
    );
    card.appendChild(info);
    return card;
  }

  function renderMessage(msg) {
    var wrap = el("div", { className: "vj-msg " + (msg.role === "user" ? "user" : "bot") });
    wrap.textContent = msg.text;

    if (msg.products && msg.products.length) {
      var productsEl = el("div", { className: "vj-products" });
      msg.products.forEach(function (p) {
        productsEl.appendChild(renderProductCard(p));
      });
      wrap.appendChild(productsEl);
    }
    return wrap;
  }

  function scrollToBottom(container) {
    container.scrollTop = container.scrollHeight;
  }

  function sendMessage(text, messagesEl, inputEl, sendBtn) {
    if (!text.trim() || state.loading) return;

    state.messages.push({ role: "user", text: text.trim() });
    messagesEl.appendChild(renderMessage({ role: "user", text: text.trim() }));
    scrollToBottom(messagesEl);

    inputEl.value = "";
    state.loading = true;
    sendBtn.disabled = true;

    var loadingEl = el("div", { className: "vj-msg bot loading", text: "Thinking..." });
    messagesEl.appendChild(loadingEl);
    scrollToBottom(messagesEl);

    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timeoutId = controller
      ? setTimeout(function () {
          controller.abort();
        }, 45000)
      : null;

    fetch(CONFIG.apiBase + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: state.sessionId,
        message: text.trim(),
      }),
      signal: controller ? controller.signal : undefined,
    })
      .then(function (res) {
        return res.text().then(function (raw) {
          var data = {};
          if (raw) {
            try {
              data = JSON.parse(raw);
            } catch (e) {
              throw new Error("Invalid server response");
            }
          }
          if (!res.ok) {
            throw new Error(
              (data && data.error) || "Request failed (" + res.status + ")"
            );
          }
          return data;
        });
      })
      .then(function (data) {
        if (data.sessionId) {
          persistSessionId(data.sessionId);
        } else if (!state.sessionId) {
          persistSessionId(createSessionId());
        }

        var botMsg = {
          role: "bot",
          text: data.answer || "Sorry, I didn't get a response. Please try again.",
          products: data.products || [],
        };
        state.messages.push(botMsg);
        messagesEl.appendChild(renderMessage(botMsg));
        scrollToBottom(messagesEl);
      })
      .catch(function (err) {
        var errMsg = {
          role: "bot",
          text:
            err && err.name === "AbortError"
              ? "That took too long. Please try again or talk to our team."
              : "Sorry, I'm having trouble connecting. Please try again or talk to our team.",
        };
        state.messages.push(errMsg);
        messagesEl.appendChild(renderMessage(errMsg));
        scrollToBottom(messagesEl);
        console.error("[Valliani Chat]", err, "api:", CONFIG.apiBase);
      })
      .finally(function () {
        if (timeoutId) clearTimeout(timeoutId);
        if (loadingEl.parentNode) loadingEl.parentNode.removeChild(loadingEl);
        state.loading = false;
        sendBtn.disabled = false;
        inputEl.focus();
      });
  }

  var ICONS = {
    chat:
      '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c9a962" stroke-width="1.5" aria-hidden="true"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
    close:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    closeGold:
      '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#c9a962" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  };

  function updateToggleButton(btn) {
    btn.innerHTML = ICONS.chat;
    btn.setAttribute("aria-label", state.open ? "Close chat" : "Open chat");
    btn.setAttribute("aria-expanded", state.open ? "true" : "false");
  }

  function setPanelOpen(panel, btn, inputEl, root, open) {
    state.open = open;
    panel.classList.toggle("open", state.open);
    if (root) root.classList.toggle("vj-open", state.open);
    updateToggleButton(btn);
    if (state.open) inputEl.focus();
  }

  function getShopifyInboxHost() {
    return (
      document.getElementById("ShopifyChat") ||
      document.querySelector("inbox-online-store-chat")
    );
  }

  function clickShopifyInboxToggle() {
    var host = getShopifyInboxHost();
    if (!host || !host.shadowRoot) return false;

    var toggleBtn =
      host.shadowRoot.querySelector("button.chat-toggle") ||
      host.shadowRoot.querySelector(".chat-app > button") ||
      host.shadowRoot.querySelector("button");

    if (!toggleBtn) return false;

    toggleBtn.click();
    return true;
  }

  function openShopifyInbox(done) {
    if (clickShopifyInboxToggle()) {
      done(true);
      return;
    }

    var attempts = 0;
    var timer = setInterval(function () {
      attempts += 1;
      if (clickShopifyInboxToggle()) {
        clearInterval(timer);
        done(true);
      } else if (attempts >= 20) {
        clearInterval(timer);
        done(false);
      }
    }, 250);
  }

  function requestHuman(messagesEl, closeChat) {
    if (state.loading) return;

    var handoffMsg = {
      role: "bot",
      text: "Opening live chat with our team…",
    };
    state.messages.push(handoffMsg);
    messagesEl.appendChild(renderMessage(handoffMsg));
    scrollToBottom(messagesEl);

    setTimeout(function () {
      if (typeof closeChat === "function") closeChat();

      openShopifyInbox(function (opened) {
        if (opened) return;

        console.warn("[Valliani Chat] Shopify Inbox not found on this page.");
        if (CONFIG.contactUrl) {
          window.open(CONFIG.contactUrl, "_blank", "noopener,noreferrer");
        }
      });
    }, 350);
  }

  function buildWidget() {
    var existingRoot = document.getElementById("valliani-chat-root");
    if (existingRoot) {
      var existingVer = existingRoot.getAttribute("data-vj-widget-version");
      if (existingVer === CONFIG.version) return;
      existingRoot.remove();
    }

    injectStyles();

    var root = el("div", {
      id: "valliani-chat-root",
      "data-vj-widget-version": CONFIG.version,
    });

    var panel = el("div", { id: "valliani-chat-panel" });
    var header = el("div", { className: "vj-header" });
    header.appendChild(
      el("div", { className: "vj-header-text" }, [
        el("h3", { text: CONFIG.brandName }),
        el("p", { text: "AI Shopping Assistant" }),
      ])
    );

    var btn = el("button", {
      id: "valliani-chat-btn",
      type: "button",
      "aria-label": "Open chat",
      "aria-expanded": "false",
    });

    var inputArea = el("div", { className: "vj-input-area" });
    var inputRow = el("div", { className: "vj-input-row" });
    var inputEl = el("input", {
      className: "vj-input",
      type: "text",
      placeholder: "Ask about products, orders, policies...",
    });
    var sendBtn = el("button", { className: "vj-send", type: "button" });

    function closeChat() {
      setPanelOpen(panel, btn, inputEl, root, false);
    }

    var headerCloseBtn = el("button", {
      className: "vj-close-btn",
      type: "button",
      title: "Close chat",
      "aria-label": "Close chat",
      text: "×",
    });
    headerCloseBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      closeChat();
    });
    header.appendChild(headerCloseBtn);
    panel.appendChild(header);

    var messagesEl = el("div", { className: "vj-messages" });
    var welcome = {
      role: "bot",
      text: "Hello! I hope you're doing well. Welcome to Valliani Jewelers! I can help you find jewelry, check availability, answer policy questions, and connect you with customer support. How can I help you today?",
    };
    state.messages.push(welcome);
    messagesEl.appendChild(renderMessage(welcome));
    panel.appendChild(messagesEl);

    sendBtn.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>';

    inputRow.appendChild(inputEl);
    inputRow.appendChild(sendBtn);
    inputArea.appendChild(inputRow);

    var humanBtn = el("button", {
      className: "vj-human-btn",
      type: "button",
      text: "Talk to a human →",
      onClick: function () {
        requestHuman(messagesEl, closeChat);
      },
    });
    inputArea.appendChild(humanBtn);
    inputArea.appendChild(el("p", { className: "vj-powered", text: "Powered by AI" }));
    panel.appendChild(inputArea);

    updateToggleButton(btn);

    btn.addEventListener("click", function () {
      if (state.open) return;
      setPanelOpen(panel, btn, inputEl, root, true);
    });

    function doSend() {
      sendMessage(inputEl.value, messagesEl, inputEl, sendBtn);
    }

    sendBtn.addEventListener("click", doSend);
    inputEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter") doSend();
    });

    root.appendChild(panel);
    root.appendChild(btn);
    document.body.appendChild(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildWidget);
  } else {
    buildWidget();
  }
})();
