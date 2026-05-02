import {
  getStorage,
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  listAll,
  type UploadTask,
} from "firebase/storage";
import { app } from "./firebase";

export const storage = getStorage(app);

export const uploadFile = async (path: string, file: File): Promise<string> => {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
};

export const uploadFileWithProgress = (path: string, file: File): UploadTask =>
  uploadBytesResumable(ref(storage, path), file);

export const getFileURL = (path: string): Promise<string> =>
  getDownloadURL(ref(storage, path));

export const deleteFile = (path: string) =>
  deleteObject(ref(storage, path));

export const listFiles = (path: string) =>
  listAll(ref(storage, path));
