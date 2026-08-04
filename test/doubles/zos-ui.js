// A stand-in for the Zepp OS UI module (@zos/ui), enough of it for the unit
// tests to build the page, look at what it drew and tap on it.
//
// Widgets are plain objects that remember the properties they were created with
// and the properties later written over them, which is exactly what a test wants
// to assert about: where something is, what colour it is, what it says.

export const widget = {
  FILL_RECT: "FILL_RECT",
  TEXT: "TEXT",
  BUTTON: "BUTTON",
};

export const prop = { MORE: "MORE" };
export const align = { CENTER_H: "CENTER_H", CENTER_V: "CENTER_V" };
export const text_style = { NONE: "NONE" };
export const event = {
  CLICK_DOWN: "CLICK_DOWN",
  CLICK_UP: "CLICK_UP",
  MOVE: "MOVE",
};

// Everything currently on screen, in the order it was drawn.
export const screen = { widgets: [] };

export function reset() {
  screen.widgets = [];
}

export function createWidget(type, properties) {
  const created = {
    type,
    properties: Object.assign({}, properties),
    listeners: {},
    deleted: false,
    setProperty(name, values) {
      if (name !== prop.MORE) {
        throw new Error("unsupported property: " + name);
      }
      Object.assign(this.properties, values);
    },
    addEventListener(id, callback) {
      this.listeners[id] = callback;
    },
    // Delivers an event the way the watch would, and only to a widget that is
    // still on screen.
    fire(id) {
      if (this.deleted || !this.listeners[id]) {
        return false;
      }
      this.listeners[id]();
      return true;
    },
    tap() {
      if (this.deleted) {
        return false;
      }
      if (this.type === widget.BUTTON && this.properties.click_func) {
        this.properties.click_func();
        return true;
      }
      return this.fire(event.CLICK_UP);
    },
  };
  screen.widgets.push(created);
  return created;
}

export function deleteWidget(target) {
  target.deleted = true;
  const index = screen.widgets.indexOf(target);
  if (index >= 0) {
    screen.widgets.splice(index, 1);
  }
}
