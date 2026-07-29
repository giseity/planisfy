import { afterEach, describe, expect, it, vi } from "vitest";
import { useStyleStore } from "@/features/style-editor/store/style-store";

const STYLE_A = "11111111-1111-1111-1111-111111111111";
const STYLE_B = "22222222-2222-2222-2222-222222222222";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("style editor persistence sessions", () => {
  it("ignores a stale load after navigation", async () => {
    let resolveFirst!: (response: Response) => void;
    const first = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith(STYLE_A)) return first;
        return Promise.resolve(styleResponse(STYLE_B, "Style B", 7));
      }),
    );

    const firstToken = useStyleStore.getState().beginStyleSession(STYLE_A);
    const firstLoad = useStyleStore
      .getState()
      .loadStyleFromApi(STYLE_A, firstToken);
    const secondToken = useStyleStore.getState().beginStyleSession(STYLE_B);
    await useStyleStore
      .getState()
      .loadStyleFromApi(STYLE_B, secondToken);
    resolveFirst(styleResponse(STYLE_A, "Style A", 2));
    await firstLoad;

    expect(useStyleStore.getState().styleId).toBe(STYLE_B);
    expect(useStyleStore.getState().style?.name).toBe("Style B");
    expect(useStyleStore.getState().serverRevision).toBe(7);
  });

  it("coalesces an edit during save into one trailing snapshot", async () => {
    let resolveFirstSave!: (response: Response) => void;
    const firstSave = new Promise<Response>((resolve) => {
      resolveFirstSave = resolve;
    });
    let putCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "PUT") {
          putCount += 1;
          return putCount === 1
            ? firstSave
            : Promise.resolve(jsonResponse({ data: { version: 3 } }));
        }
        return Promise.resolve(styleResponse(STYLE_A, "Original", 1));
      }),
    );

    const token = useStyleStore.getState().beginStyleSession(STYLE_A);
    await useStyleStore.getState().loadStyleFromApi(STYLE_A, token);
    useStyleStore.getState().updateStyleName("First edit");
    const saving = useStyleStore.getState().saveStyle();
    await vi.waitFor(() =>
      expect(useStyleStore.getState().saveStatus).toBe("saving"),
    );
    useStyleStore.getState().updateStyleName("Trailing edit");
    resolveFirstSave(jsonResponse({ data: { version: 2 } }));
    await saving;

    const state = useStyleStore.getState();
    expect(putCount).toBe(2);
    expect(state.style?.name).toBe("Trailing edit");
    expect(state.serverRevision).toBe(3);
    expect(state.persistedRevision).toBe(state.documentRevision);
    expect(state.saveStatus).toBe("saved");
  });
});

function styleResponse(id: string, name: string, version: number) {
  return jsonResponse({
    data: {
      id,
      version,
      handle: name.toLowerCase().replaceAll(" ", "-"),
      isPublic: false,
      publishedVersion: null,
      styleJson: {
        version: 8,
        name,
        sources: {},
        layers: [],
      },
    },
  });
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
