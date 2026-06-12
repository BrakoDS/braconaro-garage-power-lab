/* global React, ReactDOM, useTweaks, TweaksPanel, TweakSection, TweakColor, TweakRadio */

const BRAC_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#f5c518",
  "headingFont": "Anton",
  "bolts": "medio"
}/*EDITMODE-END*/;

const ACCENTS = ['#f5c518', '#ffe000', '#ff9e1b', '#ff5630'];
const BOLT_MAP = { sutil: 0.22, medio: 0.5, intenso: 0.85 };
const FONT_MAP = {
  Anton: "'Anton', sans-serif",
  Oswald: "'Oswald', sans-serif",
  Teko: "'Teko', sans-serif"
};

// Standalone persistence: in the Claude Design editor the host rewrites the
// EDITMODE block on disk; on a published site there's no host, so remember the
// chosen accent / font / bolts in localStorage instead.
const TWEAKS_LS_KEY = 'brac-tweaks';
function loadSavedTweaks(defaults) {
  try {
    const s = JSON.parse(window.localStorage.getItem(TWEAKS_LS_KEY));
    return s && typeof s === 'object' ? Object.assign({}, defaults, s) : defaults;
  } catch (e) { return defaults; }
}

function hexToRgb(h) {
  const m = h.replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map(c => c + c).join('') : m, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lighten(h, amt) {
  const [r, g, b] = hexToRgb(h);
  const f = c => Math.round(c + (255 - c) * amt);
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}

function BraconaroTweaks() {
  const [t, setTweak] = useTweaks(loadSavedTweaks(BRAC_TWEAK_DEFAULTS));

  React.useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--accent', t.accent);
    root.setProperty('--accent-2', lighten(t.accent, 0.28));
    const [r, g, b] = hexToRgb(t.accent);
    root.setProperty('--glow', `rgba(${r},${g},${b},0.55)`);
    root.setProperty('--hero-bolts', String(BOLT_MAP[t.bolts] ?? 0.5));
    root.setProperty('--font-display', FONT_MAP[t.headingFont] || FONT_MAP.Anton);
    try {
      window.localStorage.setItem(TWEAKS_LS_KEY, JSON.stringify({
        accent: t.accent, headingFont: t.headingFont, bolts: t.bolts
      }));
    } catch (e) {}
  }, [t.accent, t.bolts, t.headingFont]);

  // No editor toolbar on a published site — a visible button opens the panel
  // by posting the same activation message TweaksPanel already listens for.
  const openPanel = () => window.postMessage({ type: '__activate_edit_mode' }, '*');

  return (
    <>
      <button type="button" className="twk-fab" onClick={openPanel}
        aria-label="Personalizar aparência">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round"><line x1="4" y1="21" x2="4" y2="14"/>
          <line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/>
          <line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/>
          <line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
        Tweaks
      </button>
      <TweaksPanel title="Personalizar">
        <TweakSection label="Identidade" />
        <TweakColor label="Cor de destaque" value={t.accent} options={ACCENTS}
          onChange={(v) => setTweak('accent', v)} />
        <TweakRadio label="Fonte dos títulos" value={t.headingFont}
          options={['Anton', 'Oswald', 'Teko']}
          onChange={(v) => setTweak('headingFont', v)} />
        <TweakSection label="Hero" />
        <TweakRadio label="Energia / raios" value={t.bolts}
          options={['sutil', 'medio', 'intenso']}
          onChange={(v) => setTweak('bolts', v)} />
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('tweaks-root')).render(<BraconaroTweaks />);
