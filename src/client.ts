import { SnapshotPresentation } from "./presentation.js";
import {
  validateActionIntent,
  type ActionCommand,
  type ActionIntent,
  type ToolId,
} from "./world-actions.js";
import {
  STEP,
  idleInput,
  initialSimulation,
  movePlayer,
  normalizeInput,
  placementError,
  stepWorld,
  validateMap,
  validateCatalog,
  type WorldMap,
  type ItemType,
  type Identity,
  type Body,
  type Input,
  type Simulation,
  type RoomLayout,
  type EditCommand,
  type Placement,
} from "./core.js";
import { WorldView, screenToWorld, type VisualOptions } from "./view.js";
export type ConnectionState =
  | "idle"
  | "connecting"
  | "ready"
  | "paused"
  | "reconnecting"
  | "denied"
  | "full"
  | "failed"
  | "left";
export type ClientOptions = {
  container: HTMLElement;
  map: WorldMap;
  catalog: ItemType[];
  visuals?: VisualOptions;
  onStatus?: (status: ConnectionState, detail?: string) => void;
  onChange?: () => void;
  onActionRejected?: (reason: string) => void;
};
export class Zoomap {
  readonly view: WorldView;
  status: ConnectionState = "idle";
  session = "";
  host: string | null = null;
  epoch = 0;
  roster: { session: string; identity: Identity }[] = [];
  state: Simulation;
  durable: RoomLayout;
  local?: Body;
  readonly traffic = { incoming: 0, outgoing: 0 };
  joinMs = 0;
  private socket?: WebSocket;
  private address?: {
    url: string;
    room: string;
    credential: () => Promise<string>;
  };
  private keys = new Set<string>();
  private input = idleInput();
  private inputs: Record<string, Input> = {};
  private inputAt: Record<string, number> = {};
  private actionCommands: ActionCommand[] = [];
  private actionSequence = 0;
  private toolPressed = false;
  private pendingAim?: { x: number; z: number };
  private aimAt = 0;
  private disabled = false;
  private stopped = true;
  private disposed = false;
  private generation = 0;
  private presentation = new SnapshotPresentation();
  private joining?: {
    resolve: () => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  };
  private frame = 0;
  private retry?: ReturnType<typeof setTimeout>;
  private last = 0;
  private accumulator = 0;
  private heartbeatAt = 0;
  private started = 0;
  private lastStateAt = 0;
  private abort = new AbortController();
  private pending = new Map<
    string,
    {
      command: EditCommand;
      resolve: (revision: number) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(readonly options: ClientOptions) {
    validateMap(options.map);
    validateCatalog(options.catalog);
    this.state = initialSimulation(options.map);
    this.durable = {
      version: 1,
      mapId: options.map.id,
      revision: 0,
      items: [],
    };
    this.view = new WorldView(
      options.container,
      options.map,
      options.catalog,
      options.visuals,
    );
    const signal = this.abort.signal;
    this.view.canvas.addEventListener(
      "keydown",
      (e) => {
        if (
          [
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
            "w",
            "a",
            "s",
            "d",
            "W",
            "A",
            "S",
            "D",
            " ",
            "e",
            "E",
          ].includes(e.key)
        ) {
          e.preventDefault();
          if (!this.disabled) {
            this.keys.add(e.key.toLowerCase());
            if (e.key === " " && !e.repeat) this.input.kick = true;
            if (e.key.toLowerCase() === "e" && !e.repeat)
              this.input.wave = true;
          }
        }
      },
      { signal },
    );
    window.addEventListener(
      "keyup",
      (e) => this.keys.delete(e.key.toLowerCase()),
      { signal },
    );
    this.view.canvas.addEventListener("blur", () => this.clearInput(), {
      signal,
    });
    window.addEventListener("blur", () => this.clearInput(), { signal });
    document.addEventListener(
      "visibilitychange",
      () => {
        this.clearInput();
        this.send({ type: "heartbeat", eligible: !document.hidden });
      },
      { signal },
    );
    this.view.canvas.addEventListener(
      "webglcontextlost",
      (e) => {
        e.preventDefault();
        this.leave();
        this.setStatus(
          "failed",
          "Graphics unavailable. Leave the world or reload to retry.",
        );
      },
      { signal },
    );
  }
  private setStatus(status: ConnectionState, detail?: string) {
    if (
      this.joining &&
      (status === "ready" ||
        ["failed", "denied", "full", "left"].includes(status))
    ) {
      clearTimeout(this.joining.timer);
      if (status === "ready") this.joining.resolve();
      else this.joining.reject(Error(detail ?? `Room ${status}`));
      this.joining = undefined;
    }
    if (this.status !== status || detail) {
      this.status = status;
      this.options.onStatus?.(status, detail);
    }
  }
  async enter(address: {
    url: string;
    room: string;
    credential: () => Promise<string>;
  }) {
    if (this.disposed) throw Error("World disposed");
    this.leave();
    this.address = address;
    this.view.reset();
    this.presentation.reset();
    this.stopped = false;
    this.started = performance.now();
    this.setStatus("connecting");
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.animate);
    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.stopped = true;
        this.socket?.close();
        cancelAnimationFrame(this.frame);
        this.setStatus("failed", "Room entry timed out");
      }, 10000);
      this.joining = { resolve, reject, timer };
    });
    void this.connect();
    return ready;
  }
  private async connect() {
    const generation = this.generation;
    try {
      const credential = await this.address!.credential();
      if (this.stopped || generation !== this.generation) return;
      const ws = new WebSocket(this.address!.url);
      this.socket = ws;
      ws.onopen = () =>
        this.send({
          type: "join",
          version: 1,
          ...(this.options.map.actionCatalog
            ? { capabilities: ["actions-v1"] }
            : {}),
          room: this.address!.room,
          credential,
        });
      ws.onmessage = (event) => {
        if (this.socket !== ws || this.stopped) return;
        this.traffic.incoming += new TextEncoder().encode(event.data).length;
        let m: any;
        try {
          m = JSON.parse(event.data);
        } catch {
          this.setStatus("failed", "Invalid room response");
          return;
        }
        if (m.type === "welcome") {
          this.session = m.session;
          this.actionSequence = 0;
          this.toolPressed = false;
          this.pendingAim = undefined;
        }
        if (m.type === "room") {
          this.host = m.host;
          this.epoch = m.epoch;
          this.roster = m.roster;
          this.state = m.state;
          this.presentation.reset();
          this.presentation.push(this.state, performance.now());
          this.durable = m.durable;
          this.local = this.state.players[this.session]
            ? { ...this.state.players[this.session] }
            : undefined;
          this.inputs = {};
          this.inputAt = {};
          this.actionCommands =
            this.host === this.session ? (m.actionCommands ?? []) : [];
          this.lastStateAt = performance.now();
          this.view.render(
            this.state,
            this.roster,
            this.session,
            this.local,
            this.durable.items,
            this.durable.revision,
            performance.now(),
            matchMedia("(prefers-reduced-motion: reduce)").matches,
          );
          if (!this.joinMs) this.joinMs = performance.now() - this.started;
          this.setStatus(
            this.host ? "ready" : "paused",
            this.host ? undefined : "Waiting for an active browser",
          );
          for (const p of this.pending.values())
            this.send({ type: "edit", command: p.command });
        } else if (m.type === "snapshot" && m.epoch === this.epoch) {
          this.lastStateAt = performance.now();
          if (this.host !== this.session) {
            this.state = m.state;
            this.presentation.push(this.state, performance.now());
            const authoritative = this.state.players[this.session];
            if (authoritative && this.local) {
              const error = Math.hypot(
                authoritative.x - this.local.x,
                authoritative.z - this.local.z,
              );
              const amount = error > 2 ? 1 : 0.22;
              this.local.x += (authoritative.x - this.local.x) * amount;
              this.local.z += (authoritative.z - this.local.z) * amount;
              this.local.y = authoritative.y;
              this.local.vy = authoritative.vy;
            }
          }
          if (this.host) this.setStatus("ready");
        } else if (m.type === "input") {
          this.inputs[m.session] = m.input;
          this.inputAt[m.session] = performance.now();
        } else if (
          m.type === "action" &&
          m.epoch === this.epoch &&
          this.host === this.session
        ) {
          if (
            !this.actionCommands.some(
              (command) => command.sequence === m.command.sequence,
            ) &&
            m.command.sequence > (this.state.actions?.appliedSequence ?? 0)
          )
            this.actionCommands.push(m.command);
        } else if (m.type === "durable") this.durable = m.durable;
        else if (m.type === "saved") {
          const p = this.pending.get(m.id);
          if (p) {
            clearTimeout(p.timer);
            p.resolve(m.revision);
            this.pending.delete(m.id);
          }
        } else if (m.type === "rejected") {
          if (m.actionSequence !== undefined)
            this.options.onActionRejected?.(String(m.reason));
          const p = this.pending.get(m.id);
          if (p) {
            clearTimeout(p.timer);
            p.reject(Error(m.reason));
            this.pending.delete(m.id);
          }
        }
        if (["room", "durable", "saved", "rejected"].includes(m.type))
          this.options.onChange?.();
      };
      ws.onclose = (event) => {
        if (this.socket !== ws || this.stopped) return;
        this.clearInput();
        this.host = null;
        if ([4403, 4409, 4410, 4400, 4429].includes(event.code)) {
          this.stopped = true;
          this.setStatus(
            event.code === 4403
              ? "denied"
              : event.code === 4409
                ? "full"
                : "failed",
            event.reason,
          );
          return;
        }
        this.setStatus(
          "reconnecting",
          "Connection interrupted. Shared play is paused.",
        );
        this.retry = setTimeout(() => void this.connect(), 1000);
      };
      ws.onerror = () => {};
    } catch {
      if (generation === this.generation && !this.stopped)
        this.setStatus("failed", "Could not obtain room credentials");
    }
  }
  private send(message: unknown) {
    if (
      this.socket?.readyState !== WebSocket.OPEN ||
      this.socket.bufferedAmount > 65536
    )
      return;
    const raw = JSON.stringify(message);
    this.traffic.outgoing += new TextEncoder().encode(raw).length;
    this.socket.send(raw);
  }
  setInput(x: number, y: number) {
    if (!this.disabled) Object.assign(this.input, screenToWorld(x, y));
  }
  action(action: "kick" | "wave") {
    if (!this.disabled && this.status === "ready") this.input[action] = true;
  }
  private submitAction(intent: ActionIntent) {
    const catalog = this.options.map.actionCatalog;
    if (!catalog) throw Error("This map has no shared tools");
    validateActionIntent(intent, catalog);
    if (this.status !== "ready" || this.socket?.readyState !== WebSocket.OPEN)
      throw Error("Reconnect before using shared tools");
    this.send({ type: "action", epoch: this.epoch, intent });
  }
  equipTool(tool: ToolId | null) {
    this.submitAction({ sequence: ++this.actionSequence, kind: "equip", tool });
    this.toolPressed = false;
  }
  useTool(pressed: boolean) {
    if (typeof pressed !== "boolean") throw Error("Tool input must be boolean");
    if (
      this.disabled ||
      this.status !== "ready" ||
      !this.options.map.actionCatalog
    )
      return;
    if (this.pendingAim) {
      this.submitAction({
        sequence: ++this.actionSequence,
        kind: "aim",
        ...this.pendingAim,
      });
      this.pendingAim = undefined;
    }
    if (pressed === this.toolPressed) return;
    this.submitAction({
      sequence: ++this.actionSequence,
      kind: "use",
      pressed,
    });
    this.toolPressed = pressed;
  }
  cancelTool() {
    this.toolPressed = false;
    if (
      this.options.map.actionCatalog &&
      this.status === "ready" &&
      this.socket?.readyState === WebSocket.OPEN
    )
      this.submitAction({ sequence: ++this.actionSequence, kind: "cancel" });
  }
  /** World-space horizontal direction; actual targeting is resolved by shared simulation. */
  setToolAim(x: number, z: number) {
    if (!this.options.map.actionCatalog)
      throw Error("This map has no shared tools");
    if (!Number.isFinite(x) || !Number.isFinite(z) || Math.hypot(x, z) < 1e-6)
      throw Error("Tool aim needs a finite nonzero direction");
    const length = Math.hypot(x, z);
    this.pendingAim = { x: x / length, z: z / length };
  }
  setInputEnabled(enabled: boolean) {
    this.disabled = !enabled;
    this.clearInput();
  }
  private clearInput() {
    this.pendingAim = undefined;
    this.cancelTool();
    this.keys.clear();
    this.input = idleInput();
    this.send({ type: "input", input: this.input });
  }
  private currentInput() {
    if (this.disabled || document.hidden) return idleInput();
    const x =
      +(this.keys.has("d") || this.keys.has("arrowright")) -
      +(this.keys.has("a") || this.keys.has("arrowleft"));
    const y =
      +(this.keys.has("s") || this.keys.has("arrowdown")) -
      +(this.keys.has("w") || this.keys.has("arrowup"));
    return normalizeInput({
      ...this.input,
      ...(this.options.map.actionCatalog ? { toolHeld: this.toolPressed } : {}),
      ...(x || y ? screenToWorld(x, y) : {}),
    });
  }
  private animate = (time: number) => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.animate);
    const elapsed = Math.min((time - this.last) / 1000, 0.1);
    this.last = time;
    if (document.hidden) {
      this.accumulator = 0;
      return;
    }
    if (!this.stopped && time - this.heartbeatAt > 700) {
      this.send({ type: "heartbeat", eligible: true });
      this.heartbeatAt = time;
    }
    if (
      this.status === "ready" &&
      this.host !== this.session &&
      time - this.lastStateAt > 1500
    )
      this.setStatus("paused", "Recovering simulation host");
    if (this.status === "ready") {
      if (this.pendingAim && time - this.aimAt >= 90) {
        this.submitAction({
          sequence: ++this.actionSequence,
          kind: "aim",
          ...this.pendingAim,
        });
        this.pendingAim = undefined;
        this.aimAt = time;
      }
      this.accumulator += elapsed;
      while (this.accumulator >= STEP) {
        const input = this.currentInput();
        this.send({ type: "input", input });
        this.input.kick = false;
        this.input.wave = false;
        if (this.host === this.session) {
          for (const id of Object.keys(this.inputs))
            if (time - (this.inputAt[id] ?? 0) > 250)
              this.inputs[id] = idleInput();
          // Local movement responds immediately; shared actions still arrive through relay identity stamping.
          this.inputs[this.session] = {
            ...input,
            kick: this.inputs[this.session]?.kick ?? false,
            wave: input.wave || (this.inputs[this.session]?.wave ?? false),
          };
          stepWorld(
            this.options.map,
            this.state,
            this.inputs,
            this.durable.items,
            this.options.catalog,
            this.actionCommands,
          );
          this.actionCommands = this.actionCommands.filter(
            (command) =>
              command.sequence > (this.state.actions?.appliedSequence ?? 0),
          );
          for (const i of Object.values(this.inputs)) {
            i.kick = false;
            i.wave = false;
          }
          this.local = this.state.players[this.session]
            ? { ...this.state.players[this.session] }
            : undefined;
          if (this.state.tick % 2 === 0)
            this.send({
              type: "snapshot",
              epoch: this.epoch,
              state: this.state,
            });
        } else if (this.local)
          movePlayer(
            this.options.map,
            this.local,
            input,
            STEP,
            this.durable.items,
            this.options.catalog,
            this.state.actions?.players[this.session]?.impulse,
          );
        this.accumulator -= STEP;
      }
    } else this.accumulator = 0;
    if (this.local)
      this.view.render(
        this.host === this.session
          ? this.state
          : (this.presentation.sample(time) ?? this.state),
        this.roster,
        this.session,
        this.local,
        this.durable.items,
        this.durable.revision,
        time,
        matchMedia("(prefers-reduced-motion: reduce)").matches,
      );
  };
  preview(placement?: Placement) {
    const error = placement
      ? placementError(
          this.options.map,
          this.options.catalog,
          this.durable.items,
          placement,
        )
      : undefined;
    this.view.showPreview(placement, !error);
    return error;
  }
  edit(command: EditCommand): Promise<number> {
    if (this.status !== "ready")
      return Promise.reject(Error("Reconnect before saving"));
    if (this.pending.has(command.id))
      return Promise.reject(Error("Command already pending"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(command.id);
        reject(Error("Save outcome unknown. Retry this same command ID."));
      }, 10000);
      this.pending.set(command.id, { command, resolve, reject, timer });
      this.send({ type: "edit", command });
    });
  }
  leave() {
    this.generation++;
    this.stopped = true;
    this.presentation.reset();
    cancelAnimationFrame(this.frame);
    clearTimeout(this.retry);
    this.clearInput();
    this.socket?.close();
    this.socket = undefined;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error("Left room; pending save outcome may be unknown"));
    }
    this.pending.clear();
    this.actionCommands = [];
    this.pendingAim = undefined;
    this.session = "";
    this.roster = [];
    this.host = null;
    this.local = undefined;
    this.joinMs = 0;
    this.setStatus("left");
  }
  dispose() {
    if (this.disposed) return;
    this.leave();
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.abort.abort();
    this.view.dispose();
  }
}
