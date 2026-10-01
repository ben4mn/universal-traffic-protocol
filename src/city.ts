import {
  GRID_COORDS,
  WORLD_SIZE,
  type IntersectionSnapshot,
  type Scenario,
  type SimulationSnapshot,
} from "./simulation";

type Point = { x: number; y: number };
export type CityViewScale = "micro" | "macro";
export type CityViewFocus = { x: number; y: number; span: number };
const lime = "#ccf58c";
const amber = "#f4ae73";
const horizontalStreets: Record<number, string> = {
  220: "School Street",
  500: "Market Street",
  780: "River Street",
};
const verticalStreets: Record<number, string> = {
  220: "Pine Avenue",
  500: "Oak Avenue",
  780: "Maple Avenue",
};

/** Both camera views draw the same roads, vehicles and signal state from the engine. */
export class CityView {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private base = document.createElement("canvas");
  private width = 0;
  private height = 0;
  private scale = 1;
  private connected: boolean;
  private view: CityViewScale = "macro";
  private focus: CityViewFocus = { x: 500, y: 500, span: 440 };
  private scenario: Scenario = "rush";
  private observer: ResizeObserver;
  private lastFrame?: {
    snapshot: SimulationSnapshot;
    network: boolean;
    pulse: number;
  };

  constructor(canvas: HTMLCanvasElement, connected: boolean) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.connected = connected;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }

  setView(view: CityViewScale, focus: CityViewFocus, scenario: Scenario) {
    if (
      this.view === view &&
      this.scenario === scenario &&
      this.focus.x === focus.x &&
      this.focus.y === focus.y &&
      this.focus.span === focus.span
    )
      return;
    this.view = view;
    this.focus = { ...focus };
    this.scenario = scenario;
    this.resize();
  }

  private project(x: number, y: number, z = 0): Point {
    if (this.view === "micro") {
      return {
        x: this.width / 2 + (x - this.focus.x) * this.scale,
        y: this.height / 2 + (y - this.focus.y) * this.scale,
      };
    }
    return {
      x: this.width / 2 + (x - y) * 0.53 * this.scale,
      y:
        this.height * 0.54 +
        (x + y - WORLD_SIZE) * 0.255 * this.scale -
        z * this.scale,
    };
  }

  private poly(points: number[][], color: string, stroke?: string) {
    const ctx = this.ctx;
    ctx.beginPath();
    points.forEach(([x, y, z = 0], i) => {
      const p = this.project(x, y, z);
      i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 0.65;
      ctx.stroke();
    }
  }

  private line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    width = 1,
  ) {
    const a = this.project(x1, y1),
      b = this.project(x2, y2);
    this.ctx.beginPath();
    this.ctx.moveTo(a.x, a.y);
    this.ctx.lineTo(b.x, b.y);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width;
    this.ctx.stroke();
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.scale = Math.max(
      0.01,
      this.view === "micro"
        ? (this.width - 48) / this.focus.span
        : Math.min((this.width - 32) / 1060, (this.height - 45) / 580),
    );
    if (this.view === "micro") this.drawMicroBase();
    else this.drawBase();
    this.base.width = this.canvas.width;
    this.base.height = this.canvas.height;
    this.base.getContext("2d")!.drawImage(this.canvas, 0, 0);
    if (this.lastFrame)
      this.render(
        this.lastFrame.snapshot,
        this.lastFrame.network,
        this.lastFrame.pulse,
      );
  }

  private building(
    x: number,
    y: number,
    w: number,
    d: number,
    h: number,
    light: boolean,
  ) {
    const colors = light
      ? ["#a6b899", "#6e846b", "#c9d3b6"]
      : ["#52715a", "#344a3c", "#6d8767"];
    this.poly(
      [
        [x, y, 0],
        [x + w, y, 0],
        [x + w, y, h],
        [x, y, h],
      ],
      colors[0],
    );
    this.poly(
      [
        [x + w, y, 0],
        [x + w, y + d, 0],
        [x + w, y + d, h],
        [x + w, y, h],
      ],
      colors[1],
    );
    this.poly(
      [
        [x, y, h],
        [x + w, y, h],
        [x + w, y + d, h],
        [x, y + d, h],
      ],
      colors[2],
      "#9aac8c55",
    );
    // Roof outline and floor bands provide scale within the road-network view.
    if (h > 20) {
      for (let floor = 10; floor < h; floor += 12) {
        const a = this.project(x + 5, y, floor),
          b = this.project(x + w - 5, y, floor);
        this.ctx.beginPath();
        this.ctx.moveTo(a.x, a.y);
        this.ctx.lineTo(b.x, b.y);
        this.ctx.strokeStyle = light ? "#59725d66" : "#a3bc8c44";
        this.ctx.lineWidth = 0.7;
        this.ctx.stroke();
      }
    }
    this.poly(
      [
        [x + w * 0.3, y + d * 0.25, h],
        [x + w * 0.65, y + d * 0.25, h],
        [x + w * 0.65, y + d * 0.55, h],
        [x + w * 0.3, y + d * 0.55, h],
      ],
      "#405f4a66",
    );
  }

  private drawBase() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    const fill = ctx.createRadialGradient(
      this.width * 0.5,
      this.height * 0.45,
      15,
      this.width * 0.5,
      this.height * 0.5,
      this.width * 0.6,
    );
    fill.addColorStop(0, "#233b2b");
    fill.addColorStop(1, "#15231b");
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, this.width, this.height);
    this.poly(
      [
        [0, 0, -10],
        [1000, 0, -10],
        [1000, 1000, -10],
        [0, 1000, -10],
      ],
      "#0c1811",
    );
    this.poly(
      [
        [0, 0],
        [1000, 0],
        [1000, 1000],
        [0, 1000],
      ],
      "#34513b",
      "#64825b55",
    );
    for (const p of GRID_COORDS) {
      this.poly(
        [
          [0, p - 25],
          [1000, p - 25],
          [1000, p + 25],
          [0, p + 25],
        ],
        "#18251f",
      );
      this.poly(
        [
          [p - 25, 0],
          [p + 25, 0],
          [p + 25, 1000],
          [p - 25, 1000],
        ],
        "#18251f",
      );
      this.line(0, p - 27, 1000, p - 27, "#81957855");
      this.line(0, p + 27, 1000, p + 27, "#81957855");
      this.line(p - 27, 0, p - 27, 1000, "#81957855");
      this.line(p + 27, 0, p + 27, 1000, "#81957855");
      ctx.setLineDash([3, 7]);
      this.line(0, p, 1000, p, "#bac7ab4a");
      this.line(p, 0, p, 1000, "#bac7ab4a");
      ctx.setLineDash([]);
    }
    for (const x of GRID_COORDS)
      for (const y of GRID_COORDS) {
        this.poly(
          [
            [x - 24, y - 24],
            [x + 24, y - 24],
            [x + 24, y + 24],
            [x - 24, y + 24],
          ],
          "#1b2922",
        );
        for (let v = -19; v < 20; v += 7) {
          this.line(x + v, y - 31, x + v, y - 23, "#d3ddc06b", 1.3);
          this.line(x + v, y + 23, x + v, y + 31, "#d3ddc06b", 1.3);
          this.line(x - 31, y + v, x - 23, y + v, "#d3ddc06b", 1.3);
          this.line(x + 23, y + v, x + 31, y + v, "#d3ddc06b", 1.3);
        }
      }
    const intervals = [
      [25, 185],
      [255, 465],
      [535, 745],
      [815, 975],
    ];
    const structures: number[][] = [];
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        const [x0, x1] = intervals[i],
          [y0, y1] = intervals[j];
        const park = (i === 0 && j === 2) || (i === 2 && j === 1);
        this.poly(
          [
            [x0, y0],
            [x1, y0],
            [x1, y1],
            [x0, y1],
          ],
          park ? "#42653b" : "#3d5940",
          "#65805755",
        );
        if (park) {
          this.line(x0 + 12, y0 + 12, x1 - 12, y1 - 12, "#9aac7d", 2);
          this.line(x0 + 12, y1 - 12, x1 - 12, y0 + 12, "#9aac7d", 2);
          for (let k = 0; k < 9; k++) {
            const p = this.project(
              x0 + 20 + ((k * 41) % Math.floor(x1 - x0 - 30)),
              y0 + 20 + ((k * 73) % Math.floor(y1 - y0 - 30)),
              8,
            );
            ctx.fillStyle = k % 2 ? "#7f9b55" : "#587e48";
            ctx.beginPath();
            ctx.ellipse(
              p.x,
              p.y,
              4 * this.scale,
              6 * this.scale,
              0,
              0,
              Math.PI * 2,
            );
            ctx.fill();
          }
        } else {
          const gw = x1 - x0,
            gd = y1 - y0;
          structures.push([
            x0 + 18,
            y0 + 18,
            gw * 0.32,
            gd * 0.35,
            25 + ((i * 3 + j * 11) % 5) * 13,
            (i + j) % 3 === 0 ? 1 : 0,
          ]);
          structures.push([
            x0 + gw * 0.57,
            y0 + gd * 0.46,
            gw * 0.28,
            gd * 0.34,
            18 + ((i * 7 + j * 3) % 4) * 14,
            (i + j) % 2 === 0 ? 1 : 0,
          ]);
        }
      }
    structures
      .sort((a, b) => a[0] + a[1] - (b[0] + b[1]))
      .forEach((s) => this.building(s[0], s[1], s[2], s[3], s[4], !!s[5]));
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = "#c3d0ab80";
    ctx.textAlign = "center";
    const p = this.project(0, 580);
    ctx.save();
    ctx.translate(p.x - 4, p.y + 20);
    ctx.rotate(-0.45);
    ctx.fillText("COMMON GROUND / 3 × 3 GRID", 0, 0);
    ctx.restore();
  }

  private roundedLabel(
    text: string,
    x: number,
    y: number,
    color = "#e7e8cf",
    fill = "#122219ed",
    border = "#58745a66",
    font = "12px 'DM Sans', sans-serif",
  ) {
    const ctx = this.ctx;
    ctx.font = font;
    const width = ctx.measureText(text).width + 16;
    ctx.beginPath();
    ctx.roundRect(x - width / 2, y - 12, width, 24, 7);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y + 0.5);
    ctx.textBaseline = "alphabetic";
  }

  private visible(x: number, y: number, inset = 0) {
    const p = this.project(x, y);
    return (
      p.x >= inset &&
      p.y >= inset &&
      p.x <= this.width - inset &&
      p.y <= this.height - inset
    );
  }

  private drawMicroBase() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    const ground = ctx.createRadialGradient(
      this.width / 2,
      this.height / 2,
      20,
      this.width / 2,
      this.height / 2,
      this.width * 0.7,
    );
    ground.addColorStop(0, "#2b4430");
    ground.addColorStop(1, "#18291e");
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, this.width, this.height);
    // Plan-view blocks are quiet context. Vehicles and road states carry the story.
    const bounds = [0, 220, 500, 780, 1000];
    for (let col = 0; col < 4; col++)
      for (let row = 0; row < 4; row++) {
        const x = bounds[col] + 43;
        const y = bounds[row] + 43;
        const w = bounds[col + 1] - bounds[col] - 86;
        const h = bounds[row + 1] - bounds[row] - 86;
        this.poly(
          [
            [x, y],
            [x + w, y],
            [x + w, y + h],
            [x, y + h],
          ],
          "#314c36",
          "#73916c23",
        );
        const inset = 22;
        this.poly(
          [
            [x + inset, y + inset],
            [x + w * 0.56, y + inset],
            [x + w * 0.56, y + h * 0.55],
            [x + inset, y + h * 0.55],
          ],
          "#3b5840",
          "#a9bf9433",
        );
        this.poly(
          [
            [x + w * 0.66, y + h * 0.5],
            [x + w - 15, y + h * 0.5],
            [x + w - 15, y + h - 16],
            [x + w * 0.66, y + h - 16],
          ],
          "#36533b",
          "#a9bf9422",
        );
      }
    for (const p of GRID_COORDS) {
      this.poly(
        [
          [0, p - 30],
          [1000, p - 30],
          [1000, p + 30],
          [0, p + 30],
        ],
        "#12211b",
      );
      this.poly(
        [
          [p - 30, 0],
          [p + 30, 0],
          [p + 30, 1000],
          [p - 30, 1000],
        ],
        "#12211b",
      );
      this.line(0, p - 31, 1000, p - 31, "#819e744f");
      this.line(0, p + 31, 1000, p + 31, "#819e744f");
      this.line(p - 31, 0, p - 31, 1000, "#819e744f");
      this.line(p + 31, 0, p + 31, 1000, "#819e744f");
      ctx.setLineDash([5, 7]);
      this.line(0, p, 1000, p, "#b5c59c4a");
      this.line(p, 0, p, 1000, "#b5c59c4a");
      ctx.setLineDash([]);
    }
    for (const x of GRID_COORDS)
      for (const y of GRID_COORDS) {
        this.poly(
          [
            [x - 30, y - 30],
            [x + 30, y - 30],
            [x + 30, y + 30],
            [x - 30, y + 30],
          ],
          "#17271f",
        );
        for (let v = -20; v <= 20; v += 7) {
          this.line(x + v, y - 25, x + v, y - 20, "#d9e6c18c", 2.1);
          this.line(x + v, y + 20, x + v, y + 25, "#d9e6c18c", 2.1);
          this.line(x - 25, y + v, x - 20, y + v, "#d9e6c18c", 2.1);
          this.line(x + 20, y + v, x + 25, y + v, "#d9e6c18c", 2.1);
        }
      }
    // Street names remain readable at narrow widths and never rotate with the map.
    for (const p of GRID_COORDS) {
      const horizontal = this.project(this.focus.x, p);
      if (horizontal.y > 40 && horizontal.y < this.height - 40)
        this.roundedLabel(
          horizontalStreets[p],
          this.width - 78,
          horizontal.y - 37,
          "#bccbad",
          "#203629ee",
          "#6f8b5d4a",
          "12px 'DM Sans', sans-serif",
        );
      const vertical = this.project(p, this.focus.y);
      if (vertical.x > 70 && vertical.x < this.width - 70)
        this.roundedLabel(
          verticalStreets[p],
          vertical.x,
          70,
          "#bccbad",
          "#203629ee",
          "#6f8b5d4a",
          "12px 'DM Sans', sans-serif",
        );
    }
    if (this.scenario === "school") {
      const entrance = this.project(564, 151);
      const school = this.project(574, 107);
      const schoolLabel = {
        x: Math.min(this.width - 85, school.x + 40),
        y: Math.max(94, school.y),
      };
      ctx.strokeStyle = "#d8dda96b";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(schoolLabel.x, schoolLabel.y + 12);
      ctx.lineTo(entrance.x, entrance.y);
      ctx.lineTo(this.project(538, 196).x, this.project(538, 196).y);
      ctx.stroke();
      this.roundedLabel(
        "School entrance",
        schoolLabel.x,
        schoolLabel.y,
        "#eee7b6",
        "#39412aed",
        "#d8dda94d",
      );
    }
    ctx.fillStyle = "#a1b3978a";
    ctx.font = "10px 'DM Sans', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("N ↑", this.width - 16, 22);
  }

  private roadConditions(snapshot: SimulationSnapshot) {
    const ctx = this.ctx;
    for (const road of snapshot.roads) {
      if (!road.occupancy && !road.disrupted) continue;
      const density = road.occupancy / road.capacity;
      const opacity = Math.min(0.52, 0.08 + density * 0.45);
      if (road.queue > 0) {
        this.line(
          road.x1,
          road.y1,
          road.x2,
          road.y2,
          `rgba(244,174,115,${opacity})`,
          this.view === "micro" ? 9 : Math.max(2, 11 * this.scale),
        );
      } else if (density > 0.35) {
        this.line(
          road.x1,
          road.y1,
          road.x2,
          road.y2,
          `rgba(198,213,153,${opacity * 0.6})`,
          this.view === "micro" ? 6 : Math.max(2, 8 * this.scale),
        );
      }
      if (road.disrupted) {
        // Only the eastbound edge slows in the engine; its return lane stays open.
        const start = 0.48;
        const end = 0.75;
        const x1 = road.x1 + (road.x2 - road.x1) * start;
        const y1 = road.y1 + (road.y2 - road.y1) * start;
        const x2 = road.x1 + (road.x2 - road.x1) * end;
        const y2 = road.y1 + (road.y2 - road.y1) * end;
        this.line(
          x1,
          y1,
          x2,
          y2,
          "#f5b08782",
          this.view === "micro" ? 13 : Math.max(4, 13 * this.scale),
        );
        if (this.view === "micro") {
          for (let i = 0; i < 5; i++) {
            const p = this.project(
              x1 + ((x2 - x1) * i) / 4,
              y1 + ((y2 - y1) * i) / 4 + 14,
            );
            ctx.fillStyle = "#f4ae73";
            ctx.beginPath();
            ctx.moveTo(p.x, p.y - 4);
            ctx.lineTo(p.x + 3, p.y + 3);
            ctx.lineTo(p.x - 3, p.y + 3);
            ctx.closePath();
            ctx.fill();
          }
          const p = this.project((x1 + x2) / 2, (y1 + y2) / 2 + 66);
          this.roundedLabel(
            "Eastbound lane slows",
            p.x,
            p.y,
            "#f9d1b0",
            "#392b20ef",
            "#f4ae7373",
          );
        }
      }
    }
  }

  private drawMicroSignal(
    n: IntersectionSnapshot,
    showNetwork: boolean,
    pulseTime: number,
  ) {
    const ctx = this.ctx;
    if (!this.visible(n.x, n.y, 25)) return;
    const blocked = n.pedestrian || n.state === "clearance";
    const lights = [
      { x: n.x - 31, y: n.y - 25, axis: "NS" },
      { x: n.x + 31, y: n.y + 25, axis: "NS" },
      { x: n.x + 25, y: n.y - 31, axis: "EW" },
      { x: n.x - 25, y: n.y + 31, axis: "EW" },
    ];
    for (const light of lights) {
      const p = this.project(light.x, light.y);
      const green = !blocked && n.state === light.axis;
      ctx.fillStyle = "#101b15";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = green ? "#cdf596" : "#f6a192";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = green ? lime : "#f3a18d";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const p = this.project(n.x, n.y);
    if (this.connected && n.connected && n.fresh && showNetwork) {
      ctx.strokeStyle = "#ccf58c40";
      ctx.lineWidth = 1;
      const radius = 27 * this.scale + 5 + ((pulseTime * 0.75) % 1) * 9;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (n.pedestrian) {
      this.poly(
        [
          [n.x - 13, n.y - 13],
          [n.x + 13, n.y - 13],
          [n.x + 13, n.y + 13],
          [n.x - 13, n.y + 13],
        ],
        "#f2e3a42b",
        "#e9dda763",
      );
      // Abstract crossing symbols appear only during the engine's protected window.
      // The teaching model does not contain individual pedestrian trajectories.
      for (const offset of [-7, 0, 7]) {
        const person = this.project(n.x + offset, n.y);
        ctx.fillStyle = "#faefc1";
        ctx.beginPath();
        ctx.arc(person.x, person.y - 3, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#faefc1";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(person.x, person.y);
        ctx.lineTo(person.x, person.y + 4);
        ctx.moveTo(person.x - 2, person.y + 6);
        ctx.lineTo(person.x, person.y + 4);
        ctx.lineTo(person.x + 2, person.y + 6);
        ctx.stroke();
      }
    }
  }

  private drawMicro(
    snapshot: SimulationSnapshot,
    showNetwork: boolean,
    pulseTime: number,
  ) {
    const ctx = this.ctx;
    this.roadConditions(snapshot);
    if (this.connected && showNetwork) {
      ctx.setLineDash([2, 5]);
      for (const v of snapshot.vehicles) {
        if (
          !v.connected ||
          v.crossing ||
          v.id % 5 !== 0 ||
          !this.visible(v.x, v.y)
        )
          continue;
        const destination = v.laneId.split(">")[1];
        const n = snapshot.intersections.find(
          (node) => node.id === destination,
        );
        if (!n?.connected || !n.fresh) continue;
        const a = this.project(v.x, v.y);
        const b = this.project(n.x, n.y);
        ctx.strokeStyle = "#c7f58b32";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        const progress = (pulseTime * 0.7 + v.id * 0.17) % 1;
        ctx.fillStyle = lime;
        ctx.beginPath();
        ctx.arc(
          a.x + (b.x - a.x) * progress,
          a.y + (b.y - a.y) * progress,
          1.7,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.setLineDash([]);
    }
    for (const v of snapshot.vehicles) {
      if (!this.visible(v.x, v.y, -18)) continue;
      const p = this.project(v.x, v.y);
      const length = Math.max(15, 16 * this.scale);
      const width = Math.max(6.5, 7.5 * this.scale);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(v.heading);
      ctx.shadowColor = "#06110c88";
      ctx.shadowBlur = 3;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = v.stopped
        ? amber
        : this.connected && v.connected
          ? lime
          : "#ecebd4";
      ctx.beginPath();
      ctx.roundRect(-length / 2, -width / 2, length, width, 2.5);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillStyle = "#244131";
      ctx.fillRect(length * 0.06, -width / 2 + 1.2, length * 0.19, width - 2.4);
      ctx.fillStyle = "#ffffff80";
      ctx.fillRect(length / 2 - 1.5, -width / 2 + 1, 1, width - 2);
      ctx.restore();
    }
    for (const n of snapshot.intersections)
      this.drawMicroSignal(n, showNetwork, pulseTime);
    const focusId = this.scenario === "school" ? "i01" : "i11";
    const n = snapshot.intersections.find((node) => node.id === focusId);
    if (n) {
      const p = this.project(n.x, n.y);
      const label = n.pedestrian
        ? "Crossing open · cars wait"
        : n.state === "clearance"
          ? "All red · clearing junction"
          : n.state === "NS"
            ? "North / south green"
            : "East / west green";
      const stageX = this.scenario === "school" ? Math.max(100, p.x - 88) : p.x;
      this.roundedLabel(
        label,
        stageX,
        p.y - 54,
        n.pedestrian ? "#faefc1" : n.state === "clearance" ? "#f6c2a0" : lime,
      );
      const directions = [
        { name: "N", heading: Math.PI / 2, x: -90, y: -85 },
        { name: "S", heading: -Math.PI / 2, x: 90, y: 85 },
        { name: "W", heading: 0, x: -116, y: 53 },
        { name: "E", heading: Math.PI, x: 116, y: -53 },
      ];
      for (const direction of directions) {
        const road = snapshot.roads.find(
          (r) =>
            r.to === n.id && Math.abs(r.heading - direction.heading) < 0.01,
        );
        if (!road) continue;
        const q =
          direction.name === "N" || direction.name === "S"
            ? { x: p.x + direction.x, y: p.y + direction.y }
            : this.project(n.x + direction.x, n.y + direction.y);
        q.x = Math.max(50, Math.min(this.width - 50, q.x));
        q.y = Math.max(70, Math.min(this.height - 42, q.y));
        this.roundedLabel(
          `${direction.name} · ${road.queue} waiting`,
          q.x,
          q.y,
          road.queue ? "#f6c5a3" : "#bac9ad",
          "#14251ddd",
          road.queue ? "#f4ae7359" : "#58745a44",
          "12px 'DM Sans', sans-serif",
        );
      }
    }
  }

  private drawMacroFocus(snapshot: SimulationSnapshot) {
    const ctx = this.ctx;
    const radius = this.scenario === "incident" ? 155 : 88;
    const x = this.focus.x;
    const y = this.focus.y;
    ctx.setLineDash([4, 4]);
    this.poly(
      [
        [x - radius, y - 88, 2],
        [x + radius, y - 88, 2],
        [x + radius, y + 88, 2],
        [x - radius, y + 88, 2],
      ],
      "#ccf58c08",
      "#ccf58c9c",
    );
    ctx.setLineDash([]);
    const p = this.project(x, y - 110, 8);
    const label =
      this.scenario === "school"
        ? "School crossing"
        : this.scenario === "incident"
          ? snapshot.roads.some((road) => road.disrupted)
            ? "Slower eastbound block"
            : "Roadworks start here"
          : "Market × Oak";
    this.roundedLabel(
      label,
      p.x,
      p.y - 13,
      "#d9edb5",
      "#13271dec",
      "#ccf58c50",
      "10px 'DM Sans', sans-serif",
    );
    const queued = [...snapshot.intersections]
      .filter((n) => n.queue >= 3)
      .sort((a, b) => b.queue - a.queue)
      .slice(0, 4);
    for (const n of queued) {
      const p = this.project(n.x - 35, n.y + 32, 6);
      ctx.fillStyle = "#f4ae73";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "9px 'DM Sans', sans-serif";
      ctx.fillStyle = "#27301b";
      ctx.textAlign = "center";
      ctx.fillText(String(n.queue), p.x, p.y + 3);
    }
  }

  render(
    snapshot: SimulationSnapshot,
    showNetwork: boolean,
    pulseTime: number,
  ) {
    this.lastFrame = { snapshot, network: showNetwork, pulse: pulseTime };
    const ctx = this.ctx;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.base, 0, 0);
    ctx.restore();
    if (this.view === "micro") {
      this.drawMicro(snapshot, showNetwork, pulseTime);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return;
    }
    this.roadConditions(snapshot);
    if (this.connected && showNetwork) {
      const nodes = snapshot.intersections.filter(
        (n) => n.connected && n.fresh,
      );
      ctx.setLineDash([2, 5]);
      ctx.lineWidth = 0.7;
      for (const a of nodes)
        for (const b of nodes)
          if (a.id < b.id && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < 300) {
            const p = this.project(a.x, a.y, 9),
              q = this.project(b.x, b.y, 9);
            ctx.strokeStyle = "#c7f58b38";
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
            const progress =
              (pulseTime * 0.25 + Number(a.id.replace(/\D/g, "")) * 0.17) % 1;
            ctx.fillStyle = "#d1ffa6";
            ctx.beginPath();
            ctx.arc(
              p.x + (q.x - p.x) * progress,
              p.y + (q.y - p.y) * progress,
              1.5,
              0,
              Math.PI * 2,
            );
            ctx.fill();
          }
      ctx.setLineDash([]);
    }
    const cars = [...snapshot.vehicles].sort((a, b) => a.x + a.y - (b.x + b.y));
    for (const v of cars) {
      const length = 15,
        width = 7;
      const c = Math.cos(v.heading),
        s = Math.sin(v.heading);
      const corners = [
        [-length / 2, -width / 2],
        [length / 2, -width / 2],
        [length / 2, width / 2],
        [-length / 2, width / 2],
      ].map(([a, b]) => [v.x + a * c - b * s, v.y + a * s + b * c, 4]);
      this.poly(
        corners,
        v.stopped
          ? "#f4ae73"
          : this.connected && v.connected
            ? lime
            : "#e7e8cf",
      );
      const p = this.project(v.x, v.y, 4);
      const receivingNode = snapshot.intersections.find(
        (n) => n.id === v.laneId.split(">")[1],
      );
      if (
        this.connected &&
        v.connected &&
        showNetwork &&
        v.id % 11 === 0 &&
        receivingNode?.connected &&
        receivingNode.fresh
      ) {
        ctx.strokeStyle = "#cef88d25";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.ellipse(
          p.x,
          p.y,
          14 * this.scale,
          7 * this.scale,
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
    }
    for (const n of snapshot.intersections) {
      const p = this.project(n.x + 30, n.y - 30, 8);
      const color =
        n.pedestrian || n.state === "clearance"
          ? "#e6c684"
          : n.connected && n.fresh && this.connected
            ? lime
            : "#f3c398";
      ctx.fillStyle = "#0d1a12";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      if (!n.pedestrian && n.state === "NS") {
        ctx.rect(p.x - 1, p.y - 3, 2, 6);
      } else if (!n.pedestrian && n.state === "EW") {
        ctx.rect(p.x - 3, p.y - 1, 6, 2);
      } else {
        ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
      }
      ctx.fill();
      if (this.connected && n.connected && n.fresh && showNetwork) {
        const radius =
          6 +
          ((pulseTime * 0.8 + Number(n.id.replace(/\D/g, "")) * 0.3) % 1) * 9;
        ctx.strokeStyle = "#c7f58b28";
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (snapshot.config.scenario === "school") {
      const crossing = snapshot.intersections.find((n) => n.id === "i01");
      if (crossing) {
        const p = this.project(crossing.x, crossing.y, 12);
        ctx.font = "11px ui-monospace, monospace";
        ctx.fillStyle = crossing.pedestrian ? "#fff0ba" : "#fff0ba77";
        ctx.textAlign = "center";
        ctx.fillText(
          crossing.pedestrian ? "CROSSING ACTIVE" : "CROSSING",
          p.x,
          p.y - 15,
        );
      }
    }
    if (snapshot.config.scenario === "incident") {
      const road = snapshot.roads.find((r) => r.disrupted);
      if (road) {
        const p = this.project(
          (road.x1 + road.x2) / 2,
          (road.y1 + road.y2) / 2,
          8,
        );
        ctx.strokeStyle = "#f5b087";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x - 5, p.y - 5);
        ctx.lineTo(p.x + 5, p.y + 5);
        ctx.moveTo(p.x + 5, p.y - 5);
        ctx.lineTo(p.x - 5, p.y + 5);
        ctx.stroke();
      }
    }
    this.drawMacroFocus(snapshot);
    // Keep all drawing in CSS pixels, even on high-density displays.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  destroy() {
    this.observer.disconnect();
  }
}
