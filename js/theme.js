function isLightTheme() {
    const forced = document.documentElement.getAttribute('data-theme');
    if (forced === 'light') return true;
    if (forced === 'dark') return false;
    return !window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function getThemeCssVar(name, lightFallback, darkFallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (value) return value;
    return isLightTheme() ? lightFallback : darkFallback;
}
function setTheme(mode) {
    localStorage.setItem(THEME_KEY, mode);
    const html = document.documentElement;
    if (mode === 'auto') {
        html.removeAttribute('data-theme');
    } else {
        html.setAttribute('data-theme', mode);
    }
    document.querySelectorAll('.theme-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === mode);
    });
    updateThemeColorMeta();
    refreshCurrentView();
}

function updateThemeColorMeta() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    const forced = document.documentElement.getAttribute('data-theme');
    const isDark = forced === 'dark' || (!forced && window.matchMedia('(prefers-color-scheme: dark)').matches);
    meta.content = isDark ? '#0a0a0a' : '#e4eaf4';
}

function initTheme() {
    const saved = localStorage.getItem(THEME_KEY) || 'auto';
    setTheme(saved);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if ((localStorage.getItem(THEME_KEY) || 'auto') === 'auto') updateThemeColorMeta();
    });
}
