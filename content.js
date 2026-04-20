(() => {
  const TAG = "[SpoilerTags]";
  console.log(TAG, "content script loaded", location.href);

  const OPEN = "<spoiler>";
  const CLOSE = "</spoiler>";
  const OPEN_LEN = OPEN.length;
  const CLOSE_LEN = CLOSE.length;

  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "NOSCRIPT", "BUTTON"]);
  const BLOCK_TAGS = new Set([
    "P", "DIV", "LI", "UL", "OL", "BLOCKQUOTE", "PRE", "H1", "H2", "H3", "H4", "H5", "H6",
    "TABLE", "TD", "TH", "TR", "THEAD", "TBODY", "ARTICLE", "SECTION", "ASIDE", "MAIN",
    "HEADER", "FOOTER", "DD", "DT", "DL", "FIGURE", "FIGCAPTION",
  ]);

  let groupCounter = 0;
  const newGroupId = () => `sg-${++groupCounter}`;

  function shouldSkip(node) {
    let p = node.parentNode;
    while (p && p.nodeType === Node.ELEMENT_NODE) {
      if (p.classList && p.classList.contains("spoilergpt-spoiler")) return true;
      if (SKIP_TAGS.has(p.tagName)) return true;
      p = p.parentNode;
    }
    return false;
  }

  function nearestBlock(node) {
    let p = node.parentElement;
    while (p) {
      if (BLOCK_TAGS.has(p.tagName)) return p;
      p = p.parentElement;
    }
    return document.body;
  }

  // Return block elements from startBlock to endBlock (inclusive) in document order.
  function collectBlocks(startBlock, endBlock, root) {
    if (startBlock === endBlock) return [startBlock];
    const blocks = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (n) => BLOCK_TAGS.has(n.tagName) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
    });
    let found = false, n;
    while ((n = walker.nextNode())) {
      if (n === startBlock) found = true;
      if (found) blocks.push(n);
      if (n === endBlock) break;
    }
    if (blocks.length === 0) blocks.push(startBlock, endBlock);
    else if (blocks[blocks.length - 1] !== endBlock) blocks.push(endBlock);
    return blocks;
  }

  function makeInlineSpoiler(innerText) {
    const span = document.createElement("span");
    span.className = "spoilergpt-spoiler";
    span.textContent = innerText;
    span.title = "Click to reveal spoiler";
    span.addEventListener("click", (e) => {
      e.stopPropagation();
      span.classList.toggle("spoilergpt-revealed");
    });
    return span;
  }

  // --- Phase 1: single-text-node inline matches ---

  function wrapTextNode(textNode) {
    const text = textNode.nodeValue;
    if (!text || text.indexOf(OPEN) === -1) return 0;
    if (shouldSkip(textNode)) return 0;

    const re = /<spoiler>([\s\S]*?)<\/spoiler>/gi;
    const frag = document.createDocumentFragment();
    let lastIdx = 0, count = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > lastIdx) frag.appendChild(document.createTextNode(text.slice(lastIdx, m.index)));
      frag.appendChild(makeInlineSpoiler(m[1]));
      lastIdx = m.index + m[0].length;
      count++;
    }
    if (!count) return 0;
    if (lastIdx < text.length) frag.appendChild(document.createTextNode(text.slice(lastIdx)));
    textNode.parentNode.replaceChild(frag, textNode);
    return count;
  }

  // --- Phase 2: cross-text-node matches → block-level blur ---

  function gatherTextNodes(root) {
    const nodes = [];
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if (shouldSkip(n)) continue;
      nodes.push(n);
    }
    return nodes;
  }

  function locator(nodes) {
    // Maps a combined-string offset back to (node, localOffset). At a node boundary,
    // prefers the NEXT node so inserts land in the correct parent.
    return (offset) => {
      let pos = 0;
      for (const t of nodes) {
        const len = t.nodeValue.length;
        if (offset < pos + len) return { node: t, off: offset - pos };
        pos += len;
      }
      const last = nodes[nodes.length - 1];
      return { node: last, off: last.nodeValue.length };
    };
  }

  function wrapCrossBlock(root) {
    const nodes = gatherTextNodes(root);
    if (nodes.length < 2) return 0;

    const combined = nodes.map((t) => t.nodeValue).join("");
    if (combined.indexOf(OPEN) === -1 || combined.indexOf(CLOSE) === -1) return 0;

    // Collect complete pairs.
    const re = /<spoiler>[\s\S]*?<\/spoiler>/gi;
    const matches = [];
    let m;
    while ((m = re.exec(combined)) !== null) {
      matches.push({ openStart: m.index, closeStart: m.index + m[0].length - CLOSE_LEN });
    }
    if (!matches.length) return 0;

    const locate = locator(nodes);
    let count = 0;

    // Reverse order so earlier offsets stay valid while we mutate later nodes.
    for (let i = matches.length - 1; i >= 0; i--) {
      const { openStart, closeStart } = matches[i];
      const s = locate(openStart);
      const cs = locate(closeStart);
      if (!s || !cs || s.node === cs.node) continue; // single-node cases are Phase 1

      // Strip the literal tag characters so they don't show up anywhere.
      s.node.nodeValue =
        s.node.nodeValue.slice(0, s.off) + s.node.nodeValue.slice(s.off + OPEN_LEN);
      cs.node.nodeValue =
        cs.node.nodeValue.slice(0, cs.off) + cs.node.nodeValue.slice(cs.off + CLOSE_LEN);

      const startBlock = nearestBlock(s.node);
      const endBlock = nearestBlock(cs.node);
      if (!startBlock || !endBlock) continue;

      // Skip if already marked (idempotence across scans).
      if (startBlock.classList.contains("spoilergpt-block-spoiler")) continue;

      const blocks = collectBlocks(startBlock, endBlock, root);
      const id = newGroupId();
      for (const b of blocks) {
        b.classList.add("spoilergpt-block-spoiler");
        b.dataset.spoilergptGroup = id;
      }
      count++;
    }
    return count;
  }

  // --- Phase 3: unclosed <spoiler> → pending blur ---

  function wrapPending(root) {
    const clearAll = () => {
      root.querySelectorAll(".spoilergpt-pending").forEach((el) => {
        el.classList.remove("spoilergpt-pending");
        delete el.dataset.spoilergptPending;
      });
    };

    // Fast pre-check: if no <spoiler> substring anywhere, or every open is closed,
    // we can skip the expensive tree walk.
    const fullText = root.textContent || "";
    if (fullText.indexOf(OPEN) === -1) { clearAll(); return 0; }
    const lastOpen = fullText.lastIndexOf(OPEN);
    const lastClose = fullText.lastIndexOf(CLOSE);
    if (lastClose > lastOpen) { clearAll(); return 0; }

    const nodes = gatherTextNodes(root);
    let unclosedPos = -1;
    if (nodes.length) {
      const combined = nodes.map((t) => t.nodeValue).join("");
      let i = 0;
      while (true) {
        const o = combined.indexOf(OPEN, i);
        if (o === -1) break;
        const c = combined.indexOf(CLOSE, o + OPEN_LEN);
        if (c === -1) { unclosedPos = o; break; }
        i = c + CLOSE_LEN;
      }
    }

    if (unclosedPos === -1) { clearAll(); return 0; }

    const locate = locator(nodes);
    const s = locate(unclosedPos);
    if (!s) { clearAll(); return 0; }

    const startBlock = nearestBlock(s.node);
    if (!startBlock) { clearAll(); return 0; }

    // Apply the pending class to exactly one element: the block containing the
    // unclosed <spoiler>. A CSS general-sibling selector (.spoilergpt-pending ~ *)
    // handles every current and future sibling after it — so new paragraphs, list
    // items, code blocks etc. inserted by React during streaming are blurred the
    // moment they enter the DOM, without waiting for our next observer callback.
    root.querySelectorAll(".spoilergpt-pending").forEach((el) => {
      if (el !== startBlock) {
        el.classList.remove("spoilergpt-pending");
        delete el.dataset.spoilergptPending;
      }
    });
    if (!startBlock.classList.contains("spoilergpt-pending")) {
      startBlock.classList.add("spoilergpt-pending");
      startBlock.dataset.spoilergptPending = "1";
    }
    return 1;
  }

  function scan(root) {
    if (!root || root.nodeType !== Node.ELEMENT_NODE) return 0;
    let inline = 0;
    // Phase 1 walks text nodes directly.
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const texts = [];
    let t;
    while ((t = w.nextNode())) texts.push(t);
    for (const tn of texts) inline += wrapTextNode(tn);
    // Phase 2 runs on whatever's left.
    const cross = wrapCrossBlock(root);
    // Phase 3 handles in-flight streaming.
    wrapPending(root);
    return inline + cross;
  }

  // Delegated click for block-level spoilers (not pending).
  document.addEventListener("click", (e) => {
    const block = e.target.closest(".spoilergpt-block-spoiler");
    if (!block) return;
    if (block.classList.contains("spoilergpt-pending")) return;
    const id = block.dataset.spoilergptGroup;
    if (!id) return;
    e.stopPropagation();
    document.querySelectorAll(`[data-spoilergpt-group="${id}"]`).forEach((el) => {
      el.classList.toggle("spoilergpt-revealed");
    });
  });

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      try {
        scan(document.body);
      } catch (err) {
        console.error(TAG, "scan error", err);
      }
    }, 80);
  }

  try { scan(document.body); } catch (err) { console.error(TAG, "initial scan error", err); }

  // Apply pending blur synchronously in the MutationObserver callback so it
  // lands before the browser's next paint — debouncing here causes a visible
  // flash of the streamed text before the blur kicks in.
  new MutationObserver(() => {
    try { wrapPending(document.body); } catch (err) { console.error(TAG, "pending error", err); }
    schedule();
  }).observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
  });
})();
