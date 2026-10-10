import assert from "node:assert/strict";
import test from "node:test";
import { createPlaylistItemsGetHandler } from "./route";

test("playlist items route requires session and playlist id", async () => {
  let calls = 0;
  const core = { listPlaylistItems: async () => { calls++; return { items: [] }; } };
  const request = (query = "") => new Request(`http://localhost/api/youtube/playlist-items${query}`);
  assert.equal((await createPlaylistItemsGetHandler({ getSession: async () => null, core })(request("?playlistId=p"))).status, 401);
  assert.equal((await createPlaylistItemsGetHandler({ getSession: async () => ({ user: { id: "user" } }), core })(request())).status, 400);
  assert.equal(calls, 0);
});

test("playlist items route forwards authenticated playlist id", async () => {
  const handler = createPlaylistItemsGetHandler({
    getSession: async () => ({ user: { id: "user" } }),
    core: { listPlaylistItems: async (input) => {
      assert.deepEqual(input, { credentialRef: { userId: "user" }, playlistId: "PL123" });
      return { items: [{ playlistItemId: "pi", videoId: "v", title: "Title", position: 0 }] };
    } },
  });
  const response = await handler(new Request("http://localhost/api/youtube/playlist-items?playlistId=PL123"));
  assert.equal(response.status, 200);
  assert.equal((await response.json())[0].playlistItemId, "pi");
});
