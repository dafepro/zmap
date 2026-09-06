import { mkdir, open, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  finite,
  validateDurableState,
  placementError,
  validId,
  validVec,
  type WorldMap,
  type Identity,
  type EditCommand,
  type DurableState,
  type ItemType,
  type Placement,
} from "zmap/core";
import type { DurableStore } from "zmap/server";

/** Demo app policy/storage; deliberately outside zmap. Single writer, local filesystem. */
export class ExampleStore implements DurableStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    readonly directory: string,
    readonly owns: (identity: Identity, type: string) => boolean,
  ) {}
  async load(room: string, map: WorldMap): Promise<DurableState> {
    if (!validId(room)) throw Error("Invalid room");
    try {
      const state = JSON.parse(
        await readFile(join(this.directory, `${room}.json`), "utf8"),
      ) as DurableState;
      validateDurableState(state, map);
      return state;
    } catch (error: any) {
      if (error.code !== "ENOENT") throw error;
      return {
        version: 1,
        mapId: map.id,
        revision: 0,
        items: [],
        receipts: {},
      };
    }
  }
  commit(
    room: string,
    identity: Identity,
    command: EditCommand,
    map: WorldMap,
    catalog: ItemType[],
  ): Promise<DurableState> {
    const result = this.queue.then(() =>
      this.apply(room, identity, command, map, catalog),
    );
    this.queue = result.catch(() => {});
    return result;
  }
  private async apply(
    room: string,
    identity: Identity,
    c: EditCommand,
    map: WorldMap,
    catalog: ItemType[],
  ) {
    if (
      !c ||
      !validId(c.id) ||
      !validId(c.itemId) ||
      !validId(c.type) ||
      !validVec(c.position) ||
      !finite(c.rotation) ||
      !Number.isSafeInteger(c.expectedRevision) ||
      !["place", "move", "remove"].includes(c.operation)
    )
      throw Error("Invalid edit");
    const state = await this.load(room, map);
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify([
          c.operation,
          c.itemId,
          c.type,
          c.position.x,
          c.position.y,
          c.position.z,
          c.rotation,
          c.expectedRevision,
        ]),
      )
      .digest("hex");
    const key = `${identity.id}:${c.id}`;
    if (state.receipts[key]) {
      if (state.receipts[key].fingerprint !== fingerprint)
        throw Error("Command ID already used with different content");
      return state;
    }
    if (Object.keys(state.receipts).length >= 10000)
      throw Error("Demo receipt limit reached; archive this room");
    const current = state.items.find((p) => p.id === c.itemId);
    if (c.operation !== "place" && (!current || current.owner !== identity.id))
      throw Error("Only the owner can edit this decoration");
    if (c.operation === "place" && (current || c.expectedRevision !== 0))
      throw Error("Item already placed or stale revision");
    if (current && current.revision !== c.expectedRevision)
      throw Error("Item changed; refresh before editing");
    if (current && current.type !== c.type)
      throw Error("Item type cannot change");
    if (!this.owns(identity, c.type))
      throw Error("This item is not in your app inventory");
    if (
      c.operation === "place" &&
      (state.items.length >= 50 ||
        state.items.some((i) => i.owner === identity.id && i.type === c.type))
    )
      throw Error("Your available copy is already placed");
    const proposed: Placement = {
      id: c.itemId,
      owner: identity.id,
      type: c.type,
      position: { ...c.position },
      rotation: c.rotation,
      revision: (current?.revision ?? 0) + 1,
    };
    if (c.operation !== "remove") {
      const error = placementError(map, catalog, state.items, proposed);
      if (error) throw Error(error);
    }
    state.items = state.items.filter((p) => p.id !== c.itemId);
    if (c.operation !== "remove") state.items.push(proposed);
    state.revision++;
    state.receipts[key] = { fingerprint, revision: state.revision };
    await mkdir(this.directory, { recursive: true });
    const destination = join(this.directory, `${room}.json`),
      temporary = `${destination}.tmp`;
    const file = await open(temporary, "w", 0o600);
    try {
      await file.writeFile(JSON.stringify(state));
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, destination);
    const directory = await open(this.directory, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
    return state;
  }
}
