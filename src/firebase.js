import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyAm78_Pw-5oPunVvwOmQMHWBU9iOLHp7Bg",
    authDomain: "catan-tracker-84cf4.firebaseapp.com",
    projectId: "catan-tracker-84cf4",
    storageBucket: "catan-tracker-84cf4.firebasestorage.app",
    messagingSenderId: "985490729516",
    appId: "1:985490729516:web:617c18bfc2a35e66bb7f89",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
