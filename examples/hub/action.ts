import "./action.css";
import { Zoomap, type ToolId } from "zmap";
import { actionYard } from "../action-content";
import { identities } from "../content";
import { loadActionKit } from "../action-models";
import {
  createNavigationControls,
  type MovementMode,
} from "../navigation-controls";

const query = new URLSearchParams(location.search);
const actor = Object.hasOwn(identities, query.get("as") ?? "ari")
  ? (query.get("as") ?? "ari")
  : "ari";
const friend = actor === "ari" ? "sam" : "ari";
const tools: {
  id: ToolId;
  number: string;
  name: string;
  description: string;
  action: string;
}[] = [
  {
    id: "tether-winch",
    number: "01",
    name: "Tether winch",
    description:
      "Catch a loose ball. Draw it in. Let go to pitch it to a friend.",
    action: "Hold to reel · release to pitch",
  },
  {
    id: "rebound-panel",
    number: "02",
    name: "Rebound panel",
    description:
      "Brace for an incoming ball. A teammate touching the panel gets a little boost.",
    action: "Hold to brace",
  },
  {
    id: "wake-driver",
    number: "03",
    name: "Wake driver",
    description:
      "Jump, drive it into the ground, and bounce back. The impact lifts nearby balls and nudges friends.",
    action: "Press to jump & strike",
  },
];
document.querySelector("#app")!.innerHTML = `
<header><a class="brand" href="/">zoomap<span> / FIELDWORK</span></a><a class="back" href="/">Back to the courtyard ↗</a></header>
<main><section class="intro"><div><p class="eyebrow">THE SHARED ACTION YARD</p><h1>A little force.<br>A lot of <em>possibility.</em></h1></div><p>Big tools. Both hands. Real reactions.<br>Bring a friend and put something in motion.</p></section>
<div class="workspace"><section class="field" aria-label="Shared action yard"><div class="field-top"><span>FIELD 01 <i></i> <strong id="connection" role="status">Opening the yard…</strong></span><span id="people">0 PLAYERS</span></div><div id="yard"></div><div id="loading" class="loading" role="status">Getting the field equipment ready…</div><div class="field-bottom"><div><strong>${identities[actor].name}</strong><span id="position">Ground level</span></div><button id="focus" class="small">⌖ Keyboard focus</button></div><div class="movement-controls" role="group" aria-label="Movement mode"><button id="mode-path" aria-pressed="true">Click / tap</button><button id="mode-joystick" aria-pressed="false">Joystick</button></div><div class="movement-hint"><span id="movement-status" role="status">Click or tap the ground to move</span><button id="stop-moving" hidden>Stop</button></div><div id="stick" class="stick" aria-label="Movement joystick" hidden><span></span></div><button id="use-tool" class="use-tool" disabled aria-pressed="false">Choose a field tool</button><button id="cancel-tool" class="cancel-tool" disabled>Put it at rest</button></section>
<aside><p class="eyebrow">YOUR FIELD EQUIPMENT</p><h2>Make a good move.</h2><div class="tool-list">${tools.map((tool) => `<button class="tool-card" id="pick-${tool.id}" data-tool="${tool.id}" aria-pressed="false" disabled><span class="tool-number">${tool.number}</span><span><strong>${tool.name}</strong><small>${tool.description}</small></span><b aria-hidden="true">↗</b></button>`).join("")}</div><div class="phase"><span id="tool-phase" role="status">Hands free</span><button id="empty-tool" class="text-button" disabled>Empty hands</button></div><p id="feedback" class="feedback" role="status">Choose one tool. The whole room sees the same result.</p><a class="invite" href="/action.html?as=${friend}" target="_blank" rel="noopener">Open a friend’s view <span>↗</span></a><p class="fine">Another connected player, with a separate demo identity.</p><div class="rules"><h3>Built for a little back-and-forth.</h3><p>Aim by moving, or point into the yard. Balls stay loose, walls stop reach, and the bridge is a different level.</p><p>Try a pass with the winch and panel. Stand near a friend for a ground pulse.</p></div><ol id="activity" aria-label="Recent shared actions"><li>The field is ready for an idea.</li></ol></aside></div>
<footer><span>Click / tap to walk <kbd>Q</kbd> Use tool <kbd>Esc</kbd> Stop</span><span>Switch to Joystick for direct movement. Keyboard: <kbd>W A S D</kbd></span><button id="leave" class="text-button">Leave yard ↗</button></footer><details><summary>About this shared field</summary><p>This independent application uses the public Zoomap room and avatar APIs. The active browser simulates bounded shared play; the relay fences its authority and checkpoints actions. No physical result grants inventory, access, rewards or training credit.</p><pre id="diagnostics"></pre></details></main>`;
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
$("yard").insertAdjacentHTML(
  "afterend",
  `<div class="camera-controls" role="group" aria-label="Camera distance"><button id="camera-wider" aria-label="See more of the yard" title="Wider view">−</button><output id="camera-scale" aria-live="polite">2×</output><button id="camera-closer" aria-label="See the tools closer" title="Closer view">+</button></div>`,
);
$("feedback").insertAdjacentHTML(
  "afterend",
  `<button id="retry-equipment" class="retry-equipment" hidden>Retry equipment</button>`,
);
const use = $<HTMLButtonElement>("use-tool"),
  lifecycle = new AbortController(),
  signal = lifecycle.signal;
let world: Zoomap | undefined,
  kit: Awaited<ReturnType<typeof loadActionKit>> | undefined,
  movement: ReturnType<typeof createNavigationControls> | undefined;
let closed = false,
  timer: ReturnType<typeof setInterval> | undefined,
  lastEvent = 0,
  initializedEvents = false,
  pendingEquipment: ToolId | null | undefined;
const messages: string[] = [];
const feedback = (text: string, error = false) => {
  $("feedback").textContent = text;
  $("feedback").classList.toggle("error", error);
};
function run(action: () => void) {
  try {
    action();
  } catch (error) {
    feedback((error as Error).message, true);
  }
}
function cancel() {
  world?.cancelTool();
  use.setAttribute("aria-pressed", "false");
}
function refresh() {
  if (!world || closed) return;
  const active = world.status === "ready",
    state = world.state.actions?.players[world.session],
    tool = tools.find((t) => t.id === state?.tool),
    equipment = kit
      ?.diagnostics()
      .readiness.find((entry) => entry.session === world!.session),
    fitted = equipment?.ready && equipment.desired === state?.tool;
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-tool]",
  )) {
    button.disabled = !active;
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.tool === state?.tool),
    );
  }
  if (
    active &&
    pendingEquipment !== undefined &&
    state?.tool === pendingEquipment &&
    fitted
  ) {
    feedback(
      tool
        ? `${tool.name} is ready. ${tool.action}.`
        : "Hands free. Choose your next move.",
    );
    pendingEquipment = undefined;
  }
  use.disabled = !active || !tool || !fitted || pendingEquipment !== undefined;
  const retry = $<HTMLButtonElement>("retry-equipment");
  retry.hidden = !equipment?.error;
  retry.disabled = !active || !!equipment?.pending;
  if (equipment?.error)
    feedback(
      `Your ${tool?.name ?? "equipment"} could not be prepared. Retry equipment to continue.`,
      true,
    );
  use.textContent = tool ? `Q · ${tool.action}` : "Choose a field tool";
  $<HTMLButtonElement>("cancel-tool").disabled = !active || !tool;
  $<HTMLButtonElement>("empty-tool").disabled = !active || !tool;
  const remaining = Math.max(
    0,
    ((state?.cooldownUntil ?? 0) - world.state.tick) / 30,
  );
  $("tool-phase").textContent = !tool
    ? "Hands free"
    : !fitted
      ? equipment?.error
        ? "Equipment needs attention"
        : "Preparing your field equipment…"
      : state?.phase === "cooldown"
        ? `Ready in ${remaining.toFixed(1)}s`
        : state?.phase === "reeling"
          ? "Reeling a shared ball"
          : state?.phase === "braced"
            ? "Braced · send something this way"
            : state?.phase === "charging"
              ? "Crouch · get ready…"
              : state?.phase === "leaping"
                ? "Up… and drive it down!"
                : state?.phase === "impact"
                  ? "Ground strike!"
                  : state?.phase === "recoiling"
                    ? "Bounce back · land on your feet"
                    : "Ready for your next move";
  $("people").textContent =
    `${world.roster.length} ${world.roster.length === 1 ? "PLAYER" : "PLAYERS"}`;
  $("position").textContent =
    (world.local?.y ?? 0) > 1
      ? `Raised route · ${world.local!.y.toFixed(1)} m`
      : "Ground level";
  if (!initializedEvents && world.state.actions) {
    lastEvent = world.state.actions.eventSequence;
    initializedEvents = true;
  }
  for (const event of world.state.actions?.events ?? [])
    if (event.id > lastEvent) {
      lastEvent = event.id;
      const name =
        world.roster.find((p) => p.session === event.session)?.identity.name ??
        "A teammate";
      const action = {
        reel: "caught a ball with the winch",
        pitch: "sent a ball across the yard",
        release: "let a ball go",
        rebound: "returned an incoming ball",
        boost: "gave a teammate a boost",
        charge: "is charging a ground pulse",
        pulse: "sent a pulse through the field",
      }[event.kind];
      messages.unshift(`${name} ${action}.`);
      messages.length = Math.min(messages.length, 5);
      $("activity").replaceChildren(
        ...messages.map((text) => {
          const row = document.createElement("li");
          row.textContent = text;
          return row;
        }),
      );
    }
  $("diagnostics").textContent = JSON.stringify(
    {
      session: world.session,
      host: world.host,
      epoch: world.epoch,
      tick: world.state.tick,
      phase: state?.phase,
      traffic: world.traffic,
      field: kit?.diagnostics(),
    },
    null,
    2,
  );
}
function dispose() {
  if (closed) return;
  closed = true;
  clearInterval(timer);
  lifecycle.abort();
  movement?.dispose();
  world?.dispose();
  kit?.dispose();
}
window.addEventListener("pagehide", dispose, { once: true });
async function start() {
  kit = await loadActionKit((error) =>
    feedback(`Field component stopped: ${(error as Error).message}`, true),
  );
  if (closed) {
    kit.dispose();
    return;
  }
  world = new Zoomap({
    container: $("yard"),
    map: actionYard,
    catalog: [],
    visuals: { character: kit.character, scenery: kit.scenery },
    onActionRejected: (reason) => {
      pendingEquipment = undefined;
      feedback(reason, true);
    },
    onStatus: (status, detail) => {
      $("connection").textContent = {
        ready: "Live together",
        connecting: "Connecting…",
        reconnecting: "Reconnecting…",
        paused: "Field paused",
        denied: "Access denied",
        failed: "Connection stopped",
        left: "Field closed",
        full: "Field full",
        idle: "Ready to enter",
      }[status];
      if (detail) feedback(detail, status === "failed" || status === "denied");
      refresh();
    },
  });
  const setCameraZoom = (zoom: number) => {
    const camera = world!.view.camera;
    camera.zoom = Math.min(2.5, Math.max(1.3, Math.round(zoom * 10) / 10));
    camera.updateProjectionMatrix();
    $("camera-scale").textContent =
      `${camera.zoom.toFixed(1).replace(/\.0$/, "")}×`;
    $<HTMLButtonElement>("camera-wider").disabled = camera.zoom <= 1.3;
    $<HTMLButtonElement>("camera-closer").disabled = camera.zoom >= 2.5;
  };
  setCameraZoom(2);
  movement = createNavigationControls(world, actionYard, {
    stick: $("stick"),
    status: $("movement-status"),
    stop: $<HTMLButtonElement>("stop-moving"),
  });
  for (const mode of ["path", "joystick"] as MovementMode[])
    $("mode-" + mode).addEventListener(
      "click",
      () => {
        movement!.setMode(mode);
        for (const value of ["path", "joystick"])
          $("mode-" + value).setAttribute(
            "aria-pressed",
            String(mode === value),
          );
      },
      { signal },
    );
  $("retry-equipment").addEventListener(
    "click",
    () =>
      run(() => {
        pendingEquipment = world!.state.actions?.players[world!.session]?.tool;
        kit!.retryFailed(world!.session);
        feedback("Preparing your field equipment again…");
        refresh();
      }),
    { signal },
  );
  $("camera-wider").addEventListener(
    "click",
    () => setCameraZoom(world!.view.camera.zoom - 0.2),
    { signal },
  );
  $("camera-closer").addEventListener(
    "click",
    () => setCameraZoom(world!.view.camera.zoom + 0.2),
    { signal },
  );
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-tool]",
  ))
    button.addEventListener(
      "click",
      () =>
        run(() => {
          world!.equipTool(button.dataset.tool as ToolId);
          pendingEquipment = button.dataset.tool as ToolId;
          feedback("Getting your shared tool ready…");
          refresh();
          world!.view.canvas.focus({ preventScroll: true });
        }),
      { signal },
    );
  $("empty-tool").addEventListener(
    "click",
    () =>
      run(() => {
        world!.equipTool(null);
        pendingEquipment = null;
        world!.view.canvas.focus({ preventScroll: true });
      }),
    { signal },
  );
  $("cancel-tool").addEventListener("click", cancel, { signal });
  $("focus").addEventListener(
    "click",
    () => world!.view.canvas.focus({ preventScroll: true }),
    { signal },
  );
  let pointer: number | undefined;
  const press = () => {
    if (use.disabled) return;
    movement?.stop();
    run(() => world!.useTool(true));
    use.setAttribute("aria-pressed", "true");
  };
  const release = () => {
    world!.useTool(false);
    use.setAttribute("aria-pressed", "false");
  };
  use.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0 || pointer !== undefined || use.disabled) return;
      event.preventDefault();
      pointer = event.pointerId;
      use.setPointerCapture(pointer);
      press();
    },
    { signal },
  );
  use.addEventListener(
    "pointerup",
    (event) => {
      if (event.pointerId !== pointer) return;
      pointer = undefined;
      release();
    },
    { signal },
  );
  for (const name of ["pointercancel", "lostpointercapture"] as const)
    use.addEventListener(
      name,
      (event) => {
        if (event.pointerId !== pointer) return;
        pointer = undefined;
        cancel();
      },
      { signal },
    );
  use.addEventListener(
    "keydown",
    (event) => {
      if ([" ", "Enter"].includes(event.key)) {
        event.preventDefault();
        if (!event.repeat) press();
      }
    },
    { signal },
  );
  use.addEventListener(
    "keyup",
    (event) => {
      if ([" ", "Enter"].includes(event.key)) {
        event.preventDefault();
        release();
      }
    },
    { signal },
  );
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") cancel();
      if (
        event.code !== "KeyQ" ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (event.target as HTMLElement).closest(
          "input,select,textarea,[contenteditable=true]",
        )
      )
        return;
      event.preventDefault();
      press();
    },
    { signal },
  );
  window.addEventListener(
    "keyup",
    (event) => {
      if (event.code === "KeyQ") release();
    },
    { signal },
  );
  window.addEventListener("blur", cancel, { signal });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) cancel();
    },
    { signal },
  );
  $("leave").addEventListener(
    "click",
    () => {
      dispose();
      $("loading").hidden = false;
      $("loading").textContent = "You left the field. Reload to play again.";
      $("connection").textContent = "Field closed";
    },
    { signal },
  );
  (window as any).zoomapActionYard = {
    world,
    kit,
    map: actionYard,
    movement,
    dispose,
  };
  await world.enter({
    url: new URL("/action-room", location.href).href.replace(/^http/, "ws"),
    room: "action-yard",
    credential: async () => actor,
  });
  if (closed) return;
  $("loading").hidden = true;
  timer = setInterval(refresh, 100);
  refresh();
  world.view.canvas.focus({ preventScroll: true });
}
void start().catch((error) => {
  if (closed) return;
  $("loading").textContent =
    `The field could not open: ${(error as Error).message}. Reload to retry.`;
  feedback((error as Error).message, true);
  world?.dispose();
  kit?.dispose();
});
