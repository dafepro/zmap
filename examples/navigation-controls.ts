import * as THREE from "three";
import {
  findWalkPath,
  canWalkSegment,
  actionMovementLocked,
  type Vec3,
  type WorldMap,
  type Zoomap,
} from "zmap";
import { inside } from "zmap/core";

/** Pick the visible walk surface, including a ramp or bridge above the ground. */
export function pickWalkSurface(
  world: Zoomap,
  map: WorldMap,
  clientX: number,
  clientY: number,
): Vec3 | null {
  const rect = world.view.canvas.getBoundingClientRect(),
    ray = new THREE.Raycaster();
  ray.setFromCamera(
    new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((clientY - rect.top) / rect.height) * 2,
    ),
    world.view.camera,
  );
  let nearest = Infinity,
    result: Vec3 | null = null;
  for (const surface of map.surfaces) {
    const slope = surface.slope ?? 0,
      plane = new THREE.Plane(
        new THREE.Vector3(0, 1, -slope),
        -surface.y + slope * surface.z,
      ).normalize();
    const hit = ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (!hit || !inside(surface, hit.x, hit.z)) continue;
    const distance = hit.distanceTo(ray.ray.origin);
    if (distance < nearest) {
      nearest = distance;
      result = { x: hit.x, y: hit.y, z: hit.z };
    }
  }
  return result;
}

export type MovementMode = "path" | "joystick";
/** Consumer-owned pointer UI over reusable geometry navigation and world-space input. */
export function createNavigationControls(
  world: Zoomap,
  map: WorldMap,
  ui: {
    stick: HTMLElement;
    status: HTMLElement;
    stop: HTMLButtonElement;
  },
) {
  const lifecycle = new AbortController(),
    signal = lifecycle.signal,
    canvas = world.view.canvas;
  let mode: MovementMode = "path",
    route: Vec3[] = [],
    target: Vec3 | null = null,
    waypoint = 1,
    frame = 0,
    dead = false,
    revision = -1,
    lastCheck = 0,
    lastProgress = 0,
    progressPoint = { x: 0, z: 0 },
    retries = 0,
    stickPointer: number | undefined;
  let tap: { id: number; x: number; y: number } | undefined;
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.17, 0.23, 32),
    new THREE.MeshBasicMaterial({
      color: 0x426f62,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  const line = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: 0x426f62,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    }),
  );
  line.visible = false;
  world.view.scene.add(marker, line);
  const hint = () =>
    mode === "path"
      ? "Click or tap the ground to move"
      : "Drag the pad to move · point to aim";
  const status = (message: string) => {
    if (ui.status.textContent !== message) ui.status.textContent = message;
  };
  const stop = (message = hint()) => {
    if (dead) return;
    if (target || stickPointer !== undefined) world.setWorldInput(0, 0);
    target = null;
    route = [];
    marker.visible = line.visible = false;
    ui.stop.hidden = true;
    status(message);
  };
  const airborne = () => {
    const body = world.local;
    return (
      !!body &&
      (Math.abs(body.vy) > 0.05 ||
        actionMovementLocked(world.state.actions?.players[world.session]))
    );
  };
  const plan = (destination: Vec3, retry = false): boolean => {
    if (dead) return false;
    if (!world.local || world.status !== "ready") {
      stop("Waiting for the field…");
      return false;
    }
    if (!retry) retries = 0;
    if (airborne()) {
      target = { ...destination };
      route = [];
      world.setWorldInput(0, 0);
      marker.visible = line.visible = false;
      ui.stop.hidden = false;
      status("Landing first · your next destination is queued");
      return true;
    }
    const result = findWalkPath(map, world.local, destination, {
      items: world.durable.items,
      catalog: world.options.catalog,
    });
    if (result.status !== "ready") {
      stop(
        result.status === "budget-exceeded"
          ? "That route is too complex. Try a nearer spot."
          : "No walking route to that spot",
      );
      return false;
    }
    target = { ...destination };
    route = result.points;
    waypoint = 1;
    revision = world.durable.revision;
    lastProgress = performance.now();
    progressPoint = { ...world.local };
    marker.position.set(destination.x, destination.y + 0.035, destination.z);
    marker.visible = line.visible = true;
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry().setFromPoints(
      route.map((p) => new THREE.Vector3(p.x, p.y + 0.035, p.z)),
    );
    ui.stop.hidden = false;
    status("On the way · tap somewhere else to redirect");
    return true;
  };
  const aim = (event: PointerEvent) => {
    if (!world.local || world.status !== "ready") return;
    const point = pickWalkSurface(world, map, event.clientX, event.clientY);
    if (
      point &&
      Math.hypot(point.x - world.local.x, point.z - world.local.z) > 0.15
    )
      world.setToolAim(point.x - world.local.x, point.z - world.local.z);
  };
  canvas.style.touchAction = "none";
  canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0 || tap) return;
      event.preventDefault();
      canvas.focus({ preventScroll: true });
      aim(event);
      tap = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    },
    { signal },
  );
  canvas.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType === "mouse") aim(event);
    },
    { signal },
  );
  canvas.addEventListener(
    "pointerup",
    (event) => {
      if (!tap || tap.id !== event.pointerId) return;
      const click =
        Math.hypot(event.clientX - tap.x, event.clientY - tap.y) < 12;
      tap = undefined;
      if (mode !== "path" || !click) return;
      const point = pickWalkSurface(world, map, event.clientX, event.clientY);
      if (point) plan(point);
      else stop("Tap a walkable part of the yard");
    },
    { signal },
  );
  for (const name of ["pointercancel", "lostpointercapture"] as const)
    canvas.addEventListener(
      name,
      () => {
        tap = undefined;
      },
      { signal },
    );
  const knob = ui.stick.querySelector<HTMLElement>("span")!;
  const stickMove = (event: PointerEvent) => {
    if (event.pointerId !== stickPointer) return;
    const rect = ui.stick.getBoundingClientRect(),
      x = (event.clientX - rect.left - rect.width / 2) / 35,
      y = (event.clientY - rect.top - rect.height / 2) / 35,
      magnitude = Math.hypot(x, y),
      length = Math.max(1, magnitude);
    const gain = magnitude < 0.12 ? 0 : Math.min(1, (magnitude - 0.12) / 0.88);
    world.setInput(
      magnitude ? (x / magnitude) * gain : 0,
      magnitude ? (y / magnitude) * gain : 0,
    );
    knob.style.transform = `translate(${(x / length) * 28}px,${(y / length) * 28}px)`;
  };
  const releaseStick = () => {
    if (stickPointer === undefined) return;
    const pointer = stickPointer;
    stickPointer = undefined;
    world.setWorldInput(0, 0);
    knob.style.transform = "";
    if (ui.stick.hasPointerCapture(pointer))
      ui.stick.releasePointerCapture(pointer);
  };
  ui.stick.addEventListener(
    "pointerdown",
    (event) => {
      if (
        mode !== "joystick" ||
        stickPointer !== undefined ||
        event.button !== 0
      )
        return;
      event.preventDefault();
      stop();
      canvas.focus({ preventScroll: true });
      stickPointer = event.pointerId;
      ui.stick.setPointerCapture(stickPointer);
      stickMove(event);
    },
    { signal },
  );
  ui.stick.addEventListener("pointermove", stickMove, { signal });
  for (const name of [
    "pointerup",
    "pointercancel",
    "lostpointercapture",
  ] as const)
    ui.stick.addEventListener(
      name,
      (event) => {
        if (event.pointerId === stickPointer) releaseStick();
      },
      { signal },
    );
  // Capture cancellation before the existing keyboard handler sets fresh input.
  window.addEventListener(
    "keydown",
    (event) => {
      if (
        [
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Escape",
        ].includes(event.code)
      ) {
        stop();
        releaseStick();
      }
    },
    { signal, capture: true },
  );
  const suspend = () => {
    stop();
    releaseStick();
    tap = undefined;
  };
  window.addEventListener("blur", suspend, { signal });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) suspend();
    },
    { signal },
  );
  ui.stop.addEventListener("click", () => stop(), { signal });
  const update = (now: number) => {
    if (dead) return;
    frame = requestAnimationFrame(update);
    if (!target) return;
    const body = world.local;
    if (!body || world.status !== "ready" || document.hidden) {
      stop();
      return;
    }
    if (airborne()) {
      world.setWorldInput(0, 0);
      lastProgress = now;
      route = [];
      line.visible = false;
      status("Landing first · your next destination is queued");
      return;
    }
    if (!route.length) {
      plan(target, true);
      return;
    }
    const point = route[waypoint],
      dx = point.x - body.x,
      dz = point.z - body.z,
      distance = Math.hypot(dx, dz);
    if (distance < 0.075 && Math.abs(point.y - body.y) < 0.15) {
      if (++waypoint === route.length) {
        stop("You’re here · choose your next move");
        return;
      }
    } else {
      const speed = Math.min(1, distance * 4);
      world.setWorldInput(
        (dx / Math.max(distance, 0.001)) * speed,
        (dz / Math.max(distance, 0.001)) * speed,
      );
    }
    if (Math.hypot(body.x - progressPoint.x, body.z - progressPoint.z) > 0.08) {
      lastProgress = now;
      progressPoint = { ...body };
    }
    if (now - lastCheck < 350) return;
    lastCheck = now;
    if (
      revision !== world.durable.revision ||
      now - lastProgress > 1600 ||
      !canWalkSegment(map, body, route[waypoint], {
        items: world.durable.items,
        catalog: world.options.catalog,
      })
    ) {
      if (++retries > 3) {
        stop("Movement interrupted · tap to choose a new route");
        return;
      }
      plan(target, true);
    }
  };
  const setMode = (value: MovementMode) => {
    if (dead) return;
    stop();
    releaseStick();
    mode = value;
    ui.stick.hidden = mode !== "joystick";
    canvas.style.cursor = mode === "path" ? "crosshair" : "default";
    status(hint());
  };
  setMode("path");
  frame = requestAnimationFrame(update);
  return {
    setMode,
    stop,
    moveTo: (point: Vec3) => plan(point),
    state: () => ({
      mode,
      target: target ? { ...target } : null,
      route: route.map((point) => ({ ...point })),
      waypoint,
    }),
    dispose() {
      suspend();
      dead = true;
      cancelAnimationFrame(frame);
      lifecycle.abort();
      world.view.scene.remove(marker, line);
      marker.geometry.dispose();
      marker.material.dispose();
      line.geometry.dispose();
      line.material.dispose();
    },
  };
}
