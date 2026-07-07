import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MANAGED_BASEMAP_SOURCE_ID,
  MANAGED_BASEMAP_TILEJSON_PATH,
  buildStyleTemplate,
  defaultStyleTemplateId,
  isManagedDeploymentMode,
  managedPlatformSources,
} from "@/lib/managed-defaults";

describe("managed defaults", () => {
  it("builds a managed light starter style with hosted tiles and glyphs", () => {
    const style = buildStyleTemplate({
      templateId: "planisfy-streets-light",
      name: "My First Style",
      apiRoot: "https://api.planisfy.localhost/",
    });

    expect(style.name).toBe("My First Style");
    expect(style.sources[MANAGED_BASEMAP_SOURCE_ID]).toEqual({
      type: "vector",
      url: `https://api.planisfy.localhost${MANAGED_BASEMAP_TILEJSON_PATH}`,
    });
    expect(style.glyphs).toBe(
      "https://api.planisfy.localhost/fonts/v1/{fontstack}/{range}.pbf",
    );
    expect(style.layers.length).toBeGreaterThan(0);
    expect(style.layers.some((layer) => layer.id === "water")).toBe(true);
  });

  it("keeps dark and blank templates distinct", () => {
    const light = buildStyleTemplate({
      templateId: "planisfy-streets-light",
      name: "Light",
      apiRoot: "https://api.planisfy.localhost",
    });
    const dark = buildStyleTemplate({
      templateId: "planisfy-streets-dark",
      name: "Dark",
      apiRoot: "https://api.planisfy.localhost",
    });
    const blank = buildStyleTemplate({
      templateId: "blank",
      name: "Blank",
      apiRoot: "https://api.planisfy.localhost",
    });

    expect(light.layers[0]?.paint).not.toEqual(dark.layers[0]?.paint);
    expect(blank.sources).toEqual({});
    expect(blank.layers).toEqual([]);
  });

  it("exposes platform sources only for managed mode callers", () => {
    expect(isManagedDeploymentMode("managed")).toBe(true);
    expect(isManagedDeploymentMode("self_host")).toBe(false);
    expect(defaultStyleTemplateId("managed")).toBe("planisfy-streets-light");
    expect(defaultStyleTemplateId("self_host")).toBe("blank");
    expect(managedPlatformSources("https://api.planisfy.localhost")[0]).toMatchObject({
      id: "planet-osm-basemap",
      sourceId: MANAGED_BASEMAP_SOURCE_ID,
      source: {
        type: "vector",
        url: `https://api.planisfy.localhost${MANAGED_BASEMAP_TILEJSON_PATH}`,
      },
    });
  });

  it("wires the template picker and platform source section in Console UI", () => {
    const stylesPage = readFileSync(
      resolve(__dirname, "../app/(studio)/styles/page.tsx"),
      "utf8",
    );
    const sourcePanel = readFileSync(
      resolve(__dirname, "../features/style-editor/components/source-panel.tsx"),
      "utf8",
    );

    expect(stylesPage).toContain("create-style-template");
    expect(stylesPage).toContain("STYLE_TEMPLATE_OPTIONS");
    expect(sourcePanel).toContain("Platform sources");
    expect(sourcePanel).toContain("managedPlatformSources");
  });
});
