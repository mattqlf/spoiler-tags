(() => {
  const TAG = "[SpoilerGPT]";
  console.log(TAG, "content script loaded", location.href);

  const PAIR_RE = /<spoiler>([\s\S]*?)<\/spoiler>/gi;
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "NOSCRIPT", "BUTTON"]);

  function shouldSkip(node) {
    let p = node.parentNode;
    while (p && p.nodeType === Node.ELEMENT_NODE) {
      if (p.classList && p.classList.contains("spoilergpt-spoiler")) return true;
      if (SKIP_TAGS.has(p.tagName)) return true;
      p = p.parentNode;
    }
    return false;
  }

  function makeSpoiler(text) {
    const span = document.createElement("span");
    span.className = "spoilergpt-spoiler";
    span.textContent = text;
    span.title = "Click to reveal spoiler";
    span.addEventListener("click", (e) => {
      e.stopPropagation();
      span.classList.toggle("spoilergpt-revealed");
    });
    return span;
  }

  function wrapTextNode(textNode) {
    const text = textNode.nodeValue;
    if (!text || text.indexOf("<spoiler>") === -1) return 0;
    if (shouldSkip(textNode)) return 0;

    PAIR_RE.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let lastIdx = 0;
    let m, count = 0;
    while ((m = PAIR_RE.exec(text)) !== null) {
      if (m.index > lastIdx) frag.appendChild(document.createTextNode(text.slice(lastIdx, m.index)));
      frag.appendChild(makeSpoiler(m[1]));
      lastIdx = m.index + m[0].length;
      count++;
    }
    if (count === 0) return 0;
    if (lastIdx < text.length) frag.appendChild(document.createTextNode(text.slice(lastIdx)));
    textNode.parentNode.replaceChild(frag, textNode);
    return count;
  }

  // Handle <spoiler>...</spoiler> whose text has been split across multiple text nodes
  // (e.g. during streaming). Joins siblings within `root`, finds matches, rewrites nodes.
  function wrapCrossNode(root) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while ((n = w.nextNode())) { if (!shouldSkip(n)) nodes.push(n); }
    if (nodes.length < 2) return 0;

    const combined = nodes.map((t) => t.nodeValue).join("");
    if (combined.indexOf("<spoiler>") === -1 || combined.indexOf("</spoiler>") === -1) return 0;

    const re = /<spoiler>([\s\S]*?)<\/spoiler>/gi;
    const matches = [];
    let m;
    while ((m = re.exec(combined)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length, inner: m[1] });
    }
    if (!matches.length) return 0;

    // Locate a char offset in the joined string back to its source (node, localOffset).
    // At node boundaries, prefer the NEXT node (off=0) so spans get inserted inside the
    // correct parent rather than as a sibling of the preceding unrelated text node.
    const locate = (offset) => {
      let pos = 0;
      for (const t of nodes) {
        const len = t.nodeValue.length;
        if (offset < pos + len) return { node: t, off: offset - pos };
        pos += len;
      }
      const last = nodes[nodes.length - 1];
      return { node: last, off: last.nodeValue.length };
    };

    let total = 0;
    // Process in reverse so earlier offsets stay valid.
    for (let i = matches.length - 1; i >= 0; i--) {
      const { start, end, inner } = matches[i];
      const s = locate(start), e = locate(end);
      if (!s || !e) continue;
      if (s.node === e.node) continue; // single-node matches handled by wrapTextNode

      // Trim start node, insert span after it, trim end node, drop intermediates.
      const startParent = s.node.parentNode;
      if (!startParent) continue;
      s.node.nodeValue = s.node.nodeValue.slice(0, s.off);
      const span = makeSpoiler(inner);
      startParent.insertBefore(span, s.node.nextSibling);
      e.node.nodeValue = e.node.nodeValue.slice(e.off);
      const sIdx = nodes.indexOf(s.node);
      const eIdx = nodes.indexOf(e.node);
      for (let j = sIdx + 1; j < eIdx; j++) {
        const mid = nodes[j];
        if (mid && mid.parentNode) mid.parentNode.removeChild(mid);
      }
      total++;
    }
    return total;
  }

  function scan(root) {
    if (!root || root.nodeType !== Node.ELEMENT_NODE) return 0;
    let n = 0;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const texts = [];
    let t;
    while ((t = w.nextNode())) texts.push(t);
    for (const tn of texts) n += wrapTextNode(tn);
    n += wrapCrossNode(root);
    return n;
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      try {
        const n = scan(document.body);
        if (n) console.log(TAG, "wrapped", n, "spoiler(s)");
      } catch (err) {
        console.error(TAG, "scan error", err);
      }
    }, 150);
  }

  try {
    const initial = scan(document.body);
    console.log(TAG, "initial scan wrapped", initial, "spoiler(s)");
  } catch (err) {
    console.error(TAG, "initial scan error", err);
  }

  new MutationObserver(() => schedule()).observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
  });
})();
