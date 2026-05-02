import { initializeApp } from "firebase-admin/app";
import { onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

initializeApp();

// Example HTTPS function — available at /api/hello
export const api = onRequest((req, res) => {
  res.json({ message: "1PStudio API", status: "ok" });
});

// Example Firestore trigger
export const onUserCreated = onDocumentCreated("users/{userId}", (event) => {
  const data = event.data?.data();
  console.log("New user created:", event.params.userId, data);
});
