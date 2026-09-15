let database;
function openLibrary() {
  return database ||= new Promise((resolve, reject) => {
    const request = indexedDB.open("compositions-library", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("pins", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = null; reject(request.error); };
  });
}
async function transaction(mode, action) {
  const db = await openLibrary();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pins", mode);
    const request = action(tx.objectStore("pins"));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export const loadPins = () => transaction("readonly", store => store.getAll());
export const savePin = pin => transaction("readwrite", store => store.put(pin));
export const removePin = id => transaction("readwrite", store => store.delete(id));
