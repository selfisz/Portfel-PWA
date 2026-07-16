let skrybaVoiceRecognition = null;
let skrybaVoiceActive = false;

function isSkrybaVoiceSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function getSkrybaVoiceRecognition() {
    if (skrybaVoiceRecognition) return skrybaVoiceRecognition;
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.lang = 'pl-PL';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
        const input = document.getElementById('skryba-input');
        if (!input) return;
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
            transcript += event.results[i][0].transcript;
        }
        input.value = transcript.trim();
        if (typeof autoResizeSkrybaInput === 'function') autoResizeSkrybaInput();
    };
    rec.onerror = (event) => {
        skrybaVoiceActive = false;
        syncSkrybaVoiceButton();
        if (event.error === 'not-allowed') {
            showAppToast('Brak dostępu do mikrofonu', 'error');
        } else if (event.error !== 'aborted') {
            showAppToast('Rozpoznawanie mowy niedostępne', 'error');
        }
    };
    rec.onend = () => {
        skrybaVoiceActive = false;
        syncSkrybaVoiceButton();
        const input = document.getElementById('skryba-input');
        const text = input?.value.trim();
        if (text && typeof showSkrybaVoicePreview === 'function') {
            showSkrybaVoicePreview(text);
        }
    };
    skrybaVoiceRecognition = rec;
    return rec;
}

function syncSkrybaVoiceButton() {
    const btn = document.getElementById('btn-skryba-voice');
    if (!btn) return;
    btn.classList.toggle('skryba-voice-btn--active', skrybaVoiceActive);
    btn.setAttribute('aria-pressed', skrybaVoiceActive ? 'true' : 'false');
    btn.title = skrybaVoiceActive ? 'Zatrzymaj dyktowanie' : 'Dyktuj wiadomość';
}

function toggleSkrybaVoiceInput() {
    if (!isSkrybaVoiceSupported()) {
        showAppToast('Przeglądarka nie obsługuje rozpoznawania mowy', 'error');
        return;
    }
    const rec = getSkrybaVoiceRecognition();
    if (!rec) return;

    if (skrybaVoiceActive) {
        rec.stop();
        skrybaVoiceActive = false;
        syncSkrybaVoiceButton();
        return;
    }

    const input = document.getElementById('skryba-input');
    if (input) input.value = '';
    skrybaVoiceActive = true;
    syncSkrybaVoiceButton();
    try {
        rec.start();
    } catch {
        skrybaVoiceActive = false;
        syncSkrybaVoiceButton();
        showAppToast('Nie udało się uruchomić mikrofonu', 'error');
    }
}

function initSkrybaVoice() {
    const btn = document.getElementById('btn-skryba-voice');
    if (!btn) return;
    if (!isSkrybaVoiceSupported()) {
        btn.classList.add('hidden');
        return;
    }
    btn.classList.remove('hidden');
    syncSkrybaVoiceButton();
}
