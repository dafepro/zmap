import "./style.css";
import type { Zoomap, Placement, EditCommand } from "zmap";
import { courtyard, catalog, identities } from "../content";
import { character, decoration, ball } from "../characters";
import { scenery } from "../scenery";
const params = new URLSearchParams(location.search);
const mode = ["explore", "shared", "decorate"].includes(
  params.get("mode") ?? "",
)
  ? params.get("mode")!
  : "explore";
const actor = Object.hasOwn(identities, params.get("as") ?? "ari")
  ? (params.get("as") ?? "ari")
  : "ari";
const copy: Record<
  string,
  { title: string; eyebrow: string; description: string; steps: string[] }
> = {
  explore: {
    title: "Take the scenic route.",
    eyebrow: "01 / EXPLORATION",
    description:
      "A little room to roam. Head up the ramp, cross the bridge, then find the path beneath it.",
    steps: [
      "Follow the terracotta ramp to the overlook",
      "Cross above the courtyard at +3 metres",
      "Walk under the same bridge on the ground",
    ],
  },
  shared: {
    title: "Better with company.",
    eyebrow: "02 / SHARED PLAY",
    description:
      "One ball. One shared world. Bring a friend, make a pass, and try the golden launch pad.",
    steps: [
      "Get close to the ball, then kick",
      "Roll it onto the golden pad for a surprise",
      "Close the host tab. The room carries on.",
    ],
  },
  decorate: {
    title: "Make yourself at home.",
    eyebrow: "03 / APP INTEGRATION",
    description:
      "Your app supplies the person and their belongings. Zoomap gives them a place in the world.",
    steps: [
      "Choose a decoration from your inventory",
      "Place it in either green garden",
      "Leave and return. Your corner stays yours.",
    ],
  },
};
const c = copy[mode];
document.querySelector("#app")!.innerHTML = `
<header class="header"><a class="brand" href="/?mode=explore"><span class="brand-mark">z<span>↗</span></span><span>zoomap<small>A LITTLE WORLD, TOGETHER</small></span></a><nav aria-label="Examples">${[
  ["explore", "Explore"],
  ["shared", "Play together"],
  ["decorate", "Make it yours"],
]
  .map(
    ([id, label]) =>
      `<a href="/?mode=${id}&as=${actor}" ${id === mode ? 'aria-current="page"' : ""}>${label}</a>`,
  )
  .join(
    "",
  )}</nav><span class="build-tag">V3 <span>PLAYABLE LAB</span></span></header>
<main><section class="intro"><div><div class="eyebrow">${c.eyebrow} <span>•</span> THE COURTYARD</div><h1>${c.title}</h1><p>${c.description}</p></div><div class="intro-note"><span class="note-star">✳</span> A shared place.<br>A little more possibility.</div></section>
<div class="workspace"><section class="world-card" aria-label="Interactive world"><div id="world"></div><div class="world-top"><span class="location"><span>↗</span> The Courtyard <small>OVERLOOK & GARDENS</small></span><span id="status" class="status" role="status">Connecting…</span></div><div class="world-bottom"><div class="player-chip"><span class="avatar-dot">${identities[actor].name.slice(0, 1)}</span><div><strong>${identities[actor].name}</strong><small id="elevation">Ground level · 0.0 m</small></div></div><button id="recenter" class="small-button" title="Focus movement controls">⌖ <span>Move here</span></button></div><div id="world-message" class="world-message" hidden><strong id="message-title"></strong><p id="message-detail"></p><button id="rejoin">Enter courtyard ↗</button></div><div id="stick" class="stick" aria-label="Touch movement control"><span></span></div><div class="touch-actions"><button id="kick" aria-label="Kick nearby ball">↗<small>Kick</small></button><button id="wave" aria-label="Wave">✋<small>Wave</small></button></div><div id="placement-hint" class="placement-hint" hidden>Tap a green garden to preview your decoration</div></section>
<aside class="sidebar"><div class="panel-header"><span class="eyebrow">YOUR VISIT</span><span class="live-dot"></span></div><h2>${mode === "decorate" ? "A corner of your own" : mode === "shared" ? "Good company. Good play." : "Small world. Real depth."}</h2><ol class="steps">${c.steps.map((s, i) => `<li><span>0${i + 1}</span>${s}</li>`).join("")}</ol>
<div class="divider"></div><div class="people-heading"><h3>In the courtyard</h3><span id="count">0 / 20</span></div><div id="people" class="people"></div><a class="invite" href="/?mode=${mode}&as=${actor === "ari" ? "sam" : "ari"}" target="_blank" rel="noopener">Open a friend’s view <span>↗</span></a><p class="fine-print">A second real client, with a separate demo identity.</p>
${mode === "decorate" ? `<div class="divider"></div><h3>My app inventory</h3><div id="inventory" class="inventory"></div><div id="editor" hidden><div class="edit-title"><strong id="edit-name"></strong><button id="cancel" class="text-button">Cancel</button></div><div class="nudge"><button data-nudge="-0.5,0" aria-label="Move west">←</button><button data-nudge="0,-0.5" aria-label="Move north">↑</button><button data-nudge="0,0.5" aria-label="Move south">↓</button><button data-nudge="0.5,0" aria-label="Move east">→</button><button id="rotate" aria-label="Rotate decoration">↻</button></div><p id="placement-status" role="status"></p><button id="save" class="primary">Save placement</button><button id="remove" class="text-button" hidden>Return to inventory</button></div><p id="save-status" class="save-status" role="status"></p>` : `<div class="discovery"><span>✳</span><div><strong>${mode === "shared" ? "Pass, launch, repeat." : "There’s another way up."}</strong><p>${mode === "shared" ? "Kick the ball onto the golden pad. Every visitor sees the same launch." : "The bridge is a real surface. The path below it is a different place."}</p></div></div>`}
<div class="divider"></div><button id="leave" class="leave">Leave courtyard <span>↗</span></button></aside></div>
<footer class="footer"><div class="controls"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move</span><span><kbd>Space</kbd> Kick</span><span><kbd>E</kbd> Wave</span><span class="touch-note">Touch: move with the thumb pad</span></div><details><summary>Under the hood <span>＋</span></summary><div class="diagnostics"><p>Independent consumer · public ZMap API · app-owned content & identity</p><pre id="diagnostics"></pre><p>Development identities only. No training data or rewards. Desktop samples are not phone benchmarks.</p></div></details></footer></main>`;
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
let world: Zoomap | undefined,
  preview: Placement | undefined,
  current: Placement | undefined,
  saving = false;
let lastCommand: EditCommand | undefined;
const unique = () =>
  `edit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
function updateStatus(status: string, detail?: string) {
  const labels: Record<string, string> = {
    connecting: "Connecting…",
    ready: "Live together",
    paused: "Room paused",
    reconnecting: "Reconnecting…",
    denied: "Access denied",
    full: "Room full",
    failed: "Unable to enter",
    left: "See you soon",
    idle: "Ready to explore",
  };
  el("status").textContent = labels[status] ?? status;
  el("status").dataset.state = status;
  const overlay = [
    "left",
    "failed",
    "denied",
    "full",
    "reconnecting",
    "paused",
  ].includes(status);
  el("world-message").hidden = !overlay;
  el("message-title").textContent = labels[status] ?? status;
  el("message-detail").textContent =
    detail ?? "Your world will be here when you return.";
  el("rejoin").hidden = ["paused", "reconnecting"].includes(status);
}
function refresh() {
  if (!world) return;
  el("count").textContent = `${world.roster.length} / 20`;
  const people = el("people");
  people.replaceChildren();
  for (const p of world.roster) {
    const row = document.createElement("div");
    row.className = "person";
    const badge = document.createElement("span");
    badge.className = `person-icon ${p.identity.appearance}`;
    badge.textContent = p.identity.name.slice(0, 1);
    const name = document.createElement("span");
    name.textContent = `${p.identity.name}${p.identity.id === actor ? " · you" : ""}`;
    row.append(badge, name);
    people.append(row);
  }
  if (mode === "decorate") renderInventory();
}
function renderInventory() {
  if (!world) return;
  const owned = [
    "planter",
    ...(actor === "ari" ? ["bench"] : actor === "sam" ? ["lantern"] : []),
  ];
  const holder = el("inventory");
  holder.replaceChildren();
  for (const type of catalog) {
    const placed = world.durable.items.find(
      (i) => i.owner === actor && i.type === type.id,
    );
    const button = document.createElement("button");
    button.className = "inventory-item";
    button.disabled = !owned.includes(type.id) || saving;
    const name = document.createElement("strong");
    name.textContent = type.id[0].toUpperCase() + type.id.slice(1);
    const state = document.createElement("small");
    state.textContent = !owned.includes(type.id)
      ? "Locked in app"
      : placed
        ? "Placed · edit"
        : "1 available";
    button.append(name, state);
    button.onclick = () => startEdit(type.id, placed);
    holder.append(button);
  }
}
function startEdit(type: string, placed?: Placement) {
  if (!world || saving) return;
  current = placed;
  lastCommand = undefined;
  preview = placed
    ? structuredClone(placed)
    : {
        id: `${actor}-${type}`,
        type,
        owner: actor,
        position: { x: 10, y: 0, z: 4 },
        rotation: 0,
        revision: 0,
      };
  el("editor").hidden = false;
  el("placement-hint").hidden = false;
  el("edit-name").textContent = `${placed ? "Edit" : "Place"} ${type}`;
  el("remove").hidden = !placed;
  el("save-status").textContent = "";
  world.setInputEnabled(false);
  updatePreview();
}
function updatePreview() {
  if (!world || !preview) return;
  const error = world.preview(preview);
  el("placement-status").textContent = error ?? "✓ Valid spot · ready to save";
  (el("save") as HTMLButtonElement).disabled = !!error || saving;
}
function cancel() {
  if (saving) return;
  preview = undefined;
  current = undefined;
  lastCommand = undefined;
  world?.preview();
  world?.setInputEnabled(true);
  el("editor").hidden = true;
  el("placement-hint").hidden = true;
}
async function save(remove = false) {
  if (!world || !preview || saving) return;
  saving = true;
  renderInventory();
  updatePreview();
  const command: EditCommand = lastCommand ?? {
    id: unique(),
    operation: remove ? "remove" : current ? "move" : "place",
    itemId: preview.id,
    type: preview.type,
    position: { ...preview.position },
    rotation: preview.rotation,
    expectedRevision: current?.revision ?? 0,
  };
  lastCommand = command;
  el("save-status").textContent = "Saving with the app…";
  try {
    await world.edit(command);
    saving = false;
    cancel();
    el("save-status").textContent = remove
      ? "✓ Returned to app inventory"
      : "✓ Saved · safe to leave and return";
  } catch (error) {
    el("save-status").textContent = (error as Error).message;
    if (!(error as Error).message.includes("unknown")) lastCommand = undefined;
  } finally {
    saving = false;
    renderInventory();
    if (preview) updatePreview();
  }
}
async function mount() {
  try {
    const { Zoomap } = await import("zmap");
    world = new Zoomap({
      container: el("world"),
      map: courtyard,
      catalog,
      visuals: { character, decoration, toy: ball, scenery },
      onStatus: updateStatus,
      onChange: refresh,
    });
    world.view.canvas.addEventListener("pointerdown", (e) => {
      if (preview && !saving) {
        const p = world!.view.pick(e.clientX, e.clientY, 0);
        if (p) {
          preview.position = p;
          lastCommand = undefined;
          updatePreview();
        }
      } else world!.view.canvas.focus();
    });
    await enter();
    // Deliberately exposed sample diagnostics for reproducible integration tests, never an authority seam.
    (window as any).zoomapExample = { world, actor, mode };
  } catch (error) {
    updateStatus(
      "failed",
      `The world could not start: ${(error as Error).message}`,
    );
  }
}
async function enter() {
  await world?.enter({
    url: `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/room`,
    room: mode,
    credential: async () => actor,
  });
  world?.view.canvas.focus();
}
el("rejoin").onclick = () =>
  world
    ? void enter().catch((error) => updateStatus("failed", error.message))
    : void mount();
el("leave").onclick = () => {
  if (preview) cancel();
  world?.dispose();
  world = undefined;
  el("world").replaceChildren();
};
el("recenter").onclick = () => world?.view.canvas.focus();
el("kick").onclick = () => world?.action("kick");
el("wave").onclick = () => world?.action("wave");
if (mode === "decorate") {
  el("cancel").onclick = cancel;
  el("save").onclick = () => void save();
  el("remove").onclick = () => void save(true);
  el("rotate").onclick = () => {
    if (preview && !saving) {
      preview.rotation += Math.PI / 2;
      lastCommand = undefined;
      updatePreview();
    }
  };
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-nudge]",
  ))
    button.onclick = () => {
      if (preview && !saving) {
        const [x, z] = button.dataset.nudge!.split(",").map(Number);
        preview.position.x += x;
        preview.position.z += z;
        lastCommand = undefined;
        updatePreview();
      }
    };
}
const stick = el("stick");
let stickPointer: number | undefined;
function stickMove(e: PointerEvent) {
  if (stickPointer !== e.pointerId) return;
  const r = stick.getBoundingClientRect();
  const x = (e.clientX - r.left - r.width / 2) / 38,
    y = (e.clientY - r.top - r.height / 2) / 38;
  const n = Math.max(1, Math.hypot(x, y));
  world?.setInput(x / n, y / n);
  (stick.firstElementChild as HTMLElement).style.transform =
    `translate(${(x / n) * 26}px,${(y / n) * 26}px)`;
}
stick.addEventListener("pointerdown", (e) => {
  stickPointer = e.pointerId;
  stick.setPointerCapture(e.pointerId);
  stickMove(e);
});
stick.addEventListener("pointermove", stickMove);
for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
  stick.addEventListener(event, () => {
    stickPointer = undefined;
    world?.setInput(0, 0);
    (stick.firstElementChild as HTMLElement).style.transform = "";
  });
const diagnosticsTimer = setInterval(() => {
  if (!world) return;
  const d = world.view.diagnostics();
  el("elevation").textContent =
    `${(world.local?.y ?? 0) > 1 ? "Upper level" : "Ground level"} · ${(world.local?.y ?? 0).toFixed(1)} m`;
  el("diagnostics").textContent =
    `${world.host === world.session ? "Simulation host" : "Connected peer"} · epoch ${world.epoch}\nJoin sample ${world.joinMs.toFixed(0)} ms · frame p95 ${d.frameP95Ms.toFixed(1)} ms\n${d.drawCalls} draw calls · ${d.triangles} triangles\nRelay ↓ ${(world.traffic.incoming / 1024).toFixed(1)} KB ↑ ${(world.traffic.outgoing / 1024).toFixed(1)} KB\nLayout revision ${world.durable.revision}`;
}, 500);
window.addEventListener("pagehide", () => {
  clearInterval(diagnosticsTimer);
  world?.dispose();
});
void mount();
