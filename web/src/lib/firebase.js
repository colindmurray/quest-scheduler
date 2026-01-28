import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

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
const functions = getFunctions(app);

const useEmulators = import.meta.env.VITE_USE_EMULATORS === "true";
const emulatorHost = import.meta.env.VITE_EMULATOR_HOST || "127.0.0.1";
const authPort = Number(import.meta.env.VITE_AUTH_EMULATOR_PORT || 9099);
const firestorePort = Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT || 8080);
const storagePort = Number(import.meta.env.VITE_STORAGE_EMULATOR_PORT || 9199);
const functionsPort = Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT || 5001);

if (useEmulators && !globalThis.__QS_EMULATORS_CONNECTED__) {
  connectAuthEmulator(auth, `http://${emulatorHost}:${authPort}`, {
    disableWarnings: true,
  });
  connectFirestoreEmulator(db, emulatorHost, firestorePort);
  connectStorageEmulator(storage, emulatorHost, storagePort);
  connectFunctionsEmulator(functions, emulatorHost, functionsPort);
  globalThis.__QS_EMULATORS_CONNECTED__ = true;
}

export { app, auth, db, storage, functions };
