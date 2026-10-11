import { expect, type Page } from "@playwright/test";

export async function electedHost(
  pages: Page[],
  example: "zoomapExample" | "zoomapActionYard",
) {
  let election: { session: string; host: string; epoch: number }[] = [];
  await expect
    .poll(async () => {
      election = await Promise.all(
        pages.map((page) =>
          page.evaluate((example) => {
            const w = (window as any)[example].world;
            return { session: w.session, host: w.host, epoch: w.epoch };
          }, example),
        ),
      );
      return (
        !!election[0].host &&
        election.every(
          (peer) =>
            peer.host === election[0].host && peer.epoch === election[0].epoch,
        ) &&
        election.filter((peer) => peer.session === peer.host).length === 1
      );
    })
    .toBe(true);
  const hostIndex = election.findIndex((peer) => peer.session === peer.host);
  return {
    host: pages[hostIndex],
    survivors: pages.filter((_, index) => index !== hostIndex),
    epoch: election[0].epoch,
    departedSession: election[hostIndex].session,
  };
}
