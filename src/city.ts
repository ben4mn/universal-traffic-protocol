import { GRID_COORDS, WORLD_SIZE, type SimulationSnapshot } from "./simulation";

type Point = { x: number; y: number };
const lime = "#ccf58c";

/** Isometric renderer: geometry represents the actual engine's roads and vehicles. */
export class CityView {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private base = document.createElement("canvas");
  private width = 0;
  private height = 0;
  private scale = 1;
  private connected: boolean;
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

  private project(x: number, y: number, z = 0): Point {
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
    this.scale = Math.min((this.width - 32) / 1060, (this.height - 45) / 580);
    this.drawBase();
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
      if (this.connected && v.connected && showNetwork && v.id % 11 === 0) {
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
        n.state === "clearance"
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
      if (n.state === "NS") {
        ctx.rect(p.x - 1, p.y - 3, 2, 6);
      } else if (n.state === "EW") {
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
    // Keep all drawing in CSS pixels, even on high-density displays.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  destroy() {
    this.observer.disconnect();
  }
}
