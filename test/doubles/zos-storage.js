// A stand-in for Zepp OS local storage (@zos/storage), backed by a plain object
// the tests can seed and read back. `failing` makes every call throw, which is
// how a watch without usable storage is exercised.

const store = { values: {}, failing: false };

export function reset() {
  store.values = {};
  store.failing = false;
}

export function seed(values) {
  store.values = Object.assign({}, values);
}

export function stored() {
  return Object.assign({}, store.values);
}

export function breakStorage() {
  store.failing = true;
}

export class LocalStorage {
  constructor() {
    if (store.failing) {
      throw new Error("no storage");
    }
  }

  getItem(key) {
    if (store.failing) {
      throw new Error("no storage");
    }
    return Object.prototype.hasOwnProperty.call(store.values, key) ? store.values[key] : undefined;
  }

  setItem(key, value) {
    if (store.failing) {
      throw new Error("no storage");
    }
    store.values[key] = value;
  }
}
