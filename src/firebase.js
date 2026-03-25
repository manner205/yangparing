import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDAZ_QVNSjjufvZOzUTDBf719m6QA4T1lk",
  authDomain: "trip-backend-a4cee.firebaseapp.com",
  databaseURL: "https://trip-backend-a4cee-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "trip-backend-a4cee",
  storageBucket: "trip-backend-a4cee.firebasestorage.app",
  messagingSenderId: "937006607726",
  appId: "1:937006607726:web:938a77edc5a4669ad8e57f",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
