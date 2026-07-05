import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
    apiKey: 'AIzaSyAfvk2_lfsaf5QZkH_MVk-kWbG8GFvjSeI',
    authDomain: 'portfel-pwa.firebaseapp.com',
    projectId: 'portfel-pwa',
    storageBucket: 'portfel-pwa.firebasestorage.app',
    messagingSenderId: '370658952228',
    appId: '1:370658952228:web:b5fedfe155ea1918e584b1',
    measurementId: 'G-MF61T2VZ2K'
};

export const ALLOWED_AUTH_EMAIL = 'dawidrekal@gmail.com';

export { ALLOWED_AUTH_EMAILS, DEMO_ACCOUNT_EMAIL, isAllowedAuthEmail } from './auth-allowed.mjs';

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
