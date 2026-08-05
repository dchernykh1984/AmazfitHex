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
  CANVAS: "CANVAS",
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
    // still on screen. `info` is what the runtime hands a canvas listener: the
    // coordinates the finger landed on.
    fire(id, info) {
      if (this.deleted || !this.listeners[id]) {
        return false;
      }
      this.listeners[id](info);
      return true;
    },
    // A tap at a point, which is the only way to reach anything drawn on a
    // canvas: there is one widget for the whole board, so where you touched is
    // all it gets told.
    tapAt(x, y) {
      return this.fire(event.CLICK_UP, { x, y });
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
  if (type === widget.CANVAS) {
    addCanvas(created);
  }
  screen.widgets.push(created);
  return created;
}

// A canvas records what it was asked to draw instead of drawing it, so a test
// can assert on the picture: which boxes were filled, in what colour, in what
// order. `paint` is the sticky state setPaint leaves behind, the way the real
// canvas carries a line width from one stroke to the next.
function addCanvas(created) {
  created.commands = [];
  created.paint = {};
  created.setPaint = function (options) {
    Object.assign(this.paint, options);
  };
  created.drawRect = function (options) {
    this.commands.push(Object.assign({ op: "rect" }, options));
  };
  created.drawCircle = function (options) {
    this.commands.push(Object.assign({ op: "disc" }, options));
  };
  created.strokeCircle = function (options) {
    this.commands.push(Object.assign({ op: "ring", line_width: this.paint.line_width }, options));
  };
  created.drawLine = function (options) {
    this.commands.push(Object.assign({ op: "line", line_width: this.paint.line_width }, options));
  };
  // What the watch draws when a canvas is wiped.
  created.clear = function (options) {
    this.commands.push(Object.assign({ op: "clear" }, options));
  };
  // Every box that covers this point, oldest first - which is what "what colour
  // is this pixel" comes down to when the picture is a list of fills.
  created.colorAt = function (x, y) {
    let color = null;
    for (let i = 0; i < this.commands.length; i++) {
      const c = this.commands[i];
      if (c.op === "rect" && x >= c.x1 && x < c.x2 && y >= c.y1 && y < c.y2) {
        color = c.color;
      } else if (c.op === "disc" && Math.hypot(x - c.center_x, y - c.center_y) <= c.radius) {
        color = c.color;
      }
    }
    return color;
  };
}

export function deleteWidget(target) {
  target.deleted = true;
  const index = screen.widgets.indexOf(target);
  if (index >= 0) {
    screen.widgets.splice(index, 1);
  }
}
