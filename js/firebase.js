const firebaseConfig = {
    apiKey: "AIzaSyAfvk2_lfsaf5QZkH_MVk-kWbG8GFvjSeI",
    authDomain: "portfel-pwa.firebaseapp.com",
    projectId: "portfel-pwa",
    storageBucket: "portfel-pwa.firebasestorage.app",
    messagingSenderId: "370658952228",
    appId: "1:370658952228:web:b5fedfe155ea1918e584b1",
    measurementId: "G-MF61T2VZ2K"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const stateRef = db.collection('finances').doc('my_state');
const cloudBackupRef = db.collection('finances').doc('cloud_backup');
// Persistence wyłączone — na iOS PWA powodowało zawieszanie onSnapshot
// i serwowanie pustego/starego cache zamiast danych z serwera.
