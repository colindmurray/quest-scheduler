import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCBYXfMUdHE2l4oAjbEJ4F-YwVdnbqUbV0",
  authDomain: "studio-473406021-87ead.firebaseapp.com",
  projectId: "studio-473406021-87ead",
  storageBucket: "studio-473406021-87ead.firebasestorage.app",
  messagingSenderId: "1070792785962",
  appId: "1:1070792785962:web:eb58fb24b59c86d8a08353",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
