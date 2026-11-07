import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { createLegacyArchive } from "./legacy";

/** Read-only migration adapter. Firebase cannot enter a browser bundle through this module. */
export const firebaseArchive = createLegacyArchive({
  async list() {
    try {
      const snapshot = await getDocs(collection(db, "officials"));
      return snapshot.docs.map(document => ({ id: document.id, data: document.data() }));
    } catch (error) {
      console.error("Could not read legacy people:", error);
      return [];
    }
  },
  async find(slug) {
    try {
      const document = await getDoc(doc(db, "officials", slug));
      return document.exists() ? { id: document.id, data: document.data() } : null;
    } catch (error) {
      console.error("Could not read the legacy profile:", error);
      return null;
    }
  },
});
