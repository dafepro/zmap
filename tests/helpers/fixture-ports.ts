export const testPort = Number(process.env.ZMAP_TEST_PORT ?? 5174);
export const relayPort = Number(process.env.ZMAP_TEST_RELAY_PORT ?? 8788);
export const actionPort = Number(process.env.ZMAP_TEST_ACTION_PORT ?? 8790);
export const baseURL = `http://127.0.0.1:${testPort}`;
export const relayURL = `ws://127.0.0.1:${relayPort}/room`;
export const actionURL = `ws://127.0.0.1:${actionPort}/room`;
