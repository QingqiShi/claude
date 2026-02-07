JSON.stringify((() => {
  // === Overflow Detection (viewport-based) ===
  const overflowCheck = (() => {
    const docEl = document.documentElement;
    const viewportWidth = window.innerWidth;
    const scrollWidth = docEl.scrollWidth;
    const hasHorizontalOverflow = scrollWidth > viewportWidth;
    const overflowPx = hasHorizontalOverflow ? scrollWidth - viewportWidth : 0;
    const culprits = [];
    if (hasHorizontalOverflow) {
      const tolerance = 1;
      document.querySelectorAll('*').forEach(el => {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;
        const excess = rect.right - viewportWidth;
        if (excess <= tolerance) return;
        const id = el.id ? '#' + el.id : '';
        const cls = el.className && typeof el.className === 'string'
          ? '.' + el.className.split(' ').filter(Boolean).slice(0, 2).join('.') : '';
        culprits.push({
          element: el.tagName.toLowerCase() + id + cls,
          right: Math.round(rect.right),
          overflowPx: Math.round(excess),
          width: Math.round(rect.width)
        });
      });
      culprits.sort((a, b) => b.overflowPx - a.overflowPx);
      culprits.splice(20);
    }
    return { hasHorizontalOverflow, viewportWidth, scrollWidth, overflowPx, culprits };
  })();

  // === Contrast Check ===
  const contrastCheck = (() => {
    const parseColor = (str) => {
      const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return null;
      return { r: +m[1], g: +m[2], b: +m[3] };
    };
    const luminance = ({ r, g, b }) => {
      const [rs, gs, bs] = [r, g, b].map(c => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    };
    const contrastRatio = (c1, c2) => {
      const l1 = luminance(c1), l2 = luminance(c2);
      const lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    };
    const failures = [];
    const textTags = new Set(['P','SPAN','A','H1','H2','H3','H4','H5','H6','LI','TD','TH','LABEL','BUTTON','STRONG','EM','B','I','SMALL','BLOCKQUOTE','FIGCAPTION','SUMMARY','DT','DD']);
    document.querySelectorAll('*').forEach(el => {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      const hasDirectText = el.childNodes.length > 0 && Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
      if (!hasDirectText && !textTags.has(el.tagName)) return;
      const fg = parseColor(style.color);
      if (!fg) return;
      let bgEl = el;
      let bg = null;
      while (bgEl) {
        const bgColor = getComputedStyle(bgEl).backgroundColor;
        const parsed = parseColor(bgColor);
        if (parsed && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') { bg = parsed; break; }
        bgEl = bgEl.parentElement;
      }
      if (!bg) bg = { r: 255, g: 255, b: 255 };
      const ratio = contrastRatio(fg, bg);
      const fontSize = parseFloat(style.fontSize);
      const isBold = parseInt(style.fontWeight) >= 700 || style.fontWeight === 'bold';
      const isLargeText = fontSize >= 24 || (fontSize >= 18.66 && isBold);
      const requiredAA = isLargeText ? 3 : 4.5;
      const requiredAAA = isLargeText ? 4.5 : 7;
      if (ratio < requiredAA) {
        const id = el.id ? '#' + el.id : '';
        const cls = el.className && typeof el.className === 'string'
          ? '.' + el.className.split(' ').filter(Boolean).slice(0, 2).join('.') : '';
        const text = (el.textContent || '').trim().slice(0, 40);
        failures.push({
          element: el.tagName.toLowerCase() + id + cls,
          text: text,
          fg: style.color,
          bg: getComputedStyle(bgEl || document.body).backgroundColor,
          ratio: Math.round(ratio * 100) / 100,
          requiredAA: requiredAA,
          requiredAAA: requiredAAA,
          fontSize: Math.round(fontSize),
          level: ratio < requiredAA ? 'FAIL_AA' : ratio < requiredAAA ? 'FAIL_AAA' : 'PASS'
        });
      }
    });
    failures.sort((a, b) => a.ratio - b.ratio);
    return { totalFailures: failures.length, failures: failures.slice(0, 25) };
  })();

  // === Interactive States ===
  const interactiveStatesCheck = (() => {
    const interactiveSelectors = 'a, button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [tabindex]';
    const elements = document.querySelectorAll(interactiveSelectors);
    const results = [];
    elements.forEach(el => {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      const id = el.id ? '#' + el.id : '';
      const cls = el.className && typeof el.className === 'string'
        ? '.' + el.className.split(' ').filter(Boolean).slice(0, 2).join('.') : '';
      const selector = el.tagName.toLowerCase() + id + cls;
      const issues = [];
      if (style.cursor === 'default' && (el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button')) {
        issues.push('missing pointer cursor');
      }
      if (style.outlineStyle === 'none' && style.boxShadow === 'none') {
        const hasFocusStyle = (() => {
          for (const sheet of document.styleSheets) {
            try {
              for (const rule of sheet.cssRules) {
                if (rule.selectorText && rule.selectorText.includes(':focus') && el.matches(rule.selectorText.replace(/:focus(-visible|-within)?/g, ''))) {
                  return true;
                }
              }
            } catch (e) {}
          }
          return false;
        })();
        if (!hasFocusStyle) issues.push('no visible focus indicator detected');
      }
      if (el.tagName === 'A' || el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') {
        const hasHoverStyle = (() => {
          for (const sheet of document.styleSheets) {
            try {
              for (const rule of sheet.cssRules) {
                if (rule.selectorText && rule.selectorText.includes(':hover') && el.matches(rule.selectorText.replace(/:hover/g, ''))) {
                  return true;
                }
              }
            } catch (e) {}
          }
          return false;
        })();
        if (!hasHoverStyle) issues.push('no hover style detected');
      }
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') {
        if (parseFloat(style.opacity) > 0.9) {
          issues.push('disabled element has no visual distinction (opacity > 0.9)');
        }
      }
      if (issues.length > 0) {
        results.push({
          element: selector,
          text: (el.textContent || el.value || '').trim().slice(0, 30),
          tag: el.tagName.toLowerCase(),
          issues: issues
        });
      }
    });
    return { totalElements: elements.length, issueCount: results.length, entries: results.slice(0, 25) };
  })();

  // === Token Propagation ===
  const tokensCheck = (() => {
    const root = getComputedStyle(document.documentElement);
    const tokens = {};
    const broken = [];
    const scanRules = (rules) => {
      for (const rule of rules) {
        if (rule.cssRules && rule.cssRules.length) { scanRules(rule.cssRules); continue; }
        const text = rule.cssText || '';
        const matches = text.matchAll(/var\(--([\w-]+)/g);
        for (const m of matches) {
          const name = '--' + m[1];
          if (!tokens[name]) tokens[name] = { computed: root.getPropertyValue(name).trim(), usageCount: 0 };
          tokens[name].usageCount++;
        }
      }
    };
    for (const sheet of document.styleSheets) {
      try { scanRules(sheet.cssRules); } catch (e) {}
    }
    document.querySelectorAll('[style]').forEach(el => {
      const text = el.getAttribute('style') || '';
      const matches = text.matchAll(/var\(--([\w-]+)/g);
      for (const m of matches) {
        const name = '--' + m[1];
        if (!tokens[name]) tokens[name] = { computed: root.getPropertyValue(name).trim(), usageCount: 0 };
        tokens[name].usageCount++;
      }
    });
    for (const [name, info] of Object.entries(tokens)) {
      if (!info.computed) broken.push({ token: name, usageCount: info.usageCount });
    }
    return {
      totalTokens: Object.keys(tokens).length,
      brokenTokens: broken.length,
      broken: broken,
      tokens: Object.fromEntries(
        Object.entries(tokens).map(([k, v]) => [k, { computed: v.computed || '(empty)', usages: v.usageCount }])
      )
    };
  })();

  // === Hardcoded Colors ===
  const hardcodedColorsCheck = (() => {
    const hardcoded = [];
    const hexRe = /#[0-9a-fA-F]{3,8}(?![\w-])/g;
    const rgbRe = /rgba?\s*\([^)]+\)/g;
    const scanRules = (rules) => {
      for (const rule of rules) {
        if (rule.cssRules && rule.cssRules.length) { scanRules(rule.cssRules); continue; }
        if (!rule.style) continue;
        const text = rule.cssText;
        const colorMatches = [...(text.match(hexRe) || []), ...(text.match(rgbRe) || [])];
        if (colorMatches.length === 0) continue;
        const usesTokens = text.includes('var(--');
        const selector = rule.selectorText || '';
        hardcoded.push({
          selector: selector.slice(0, 80),
          colors: colorMatches.slice(0, 5),
          mixedWithTokens: usesTokens,
          snippet: text.slice(0, 150)
        });
      }
    };
    for (const sheet of document.styleSheets) {
      try { scanRules(sheet.cssRules); } catch (e) {}
    }
    const inlineIssues = [];
    document.querySelectorAll('[style]').forEach(el => {
      const text = el.getAttribute('style') || '';
      const colorMatches = [...(text.match(hexRe) || []), ...(text.match(rgbRe) || [])];
      if (colorMatches.length === 0) return;
      const id = el.id ? '#' + el.id : '';
      const cls = el.className && typeof el.className === 'string'
        ? '.' + el.className.split(' ').filter(Boolean).slice(0, 2).join('.') : '';
      inlineIssues.push({
        element: el.tagName.toLowerCase() + id + cls,
        colors: colorMatches.slice(0, 5),
        style: text.slice(0, 150)
      });
    });
    return {
      stylesheet: { total: hardcoded.length, entries: hardcoded.slice(0, 20) },
      inline: { total: inlineIssues.length, entries: inlineIssues.slice(0, 20) }
    };
  })();

  return {
    overflow: overflowCheck,
    contrast: contrastCheck,
    interactiveStates: interactiveStatesCheck,
    tokens: tokensCheck,
    hardcodedColors: hardcodedColorsCheck
  };
})())
