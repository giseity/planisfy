type UploadTilingOptions = {
  minZoom: number;
  maxZoom: number;
  dropDensest?: boolean;
  simplification?: number;
};

export function buildTippecanoeArgs(params: {
  inputPath: string;
  outputPath: string;
  options: UploadTilingOptions;
}): string[] {
  const args = [
    "-o",
    params.outputPath,
    `-z${params.options.maxZoom}`,
    `-Z${params.options.minZoom}`,
    "--force",
    "--no-tile-compression",
  ];

  if (params.options.dropDensest) {
    args.push("--drop-densest-as-needed");
  } else {
    args.push("--coalesce-densest-as-needed");
  }

  if (params.options.simplification) {
    args.push(`--simplification=${params.options.simplification}`);
  }

  args.push(params.inputPath);
  return args;
}

export function shouldStoreRawFallback(params: {
  missingTippecanoe: boolean;
  allowRawFallback: boolean;
}): boolean {
  return params.missingTippecanoe && params.allowRawFallback;
}

export function missingTippecanoeMessage(path: string): string {
  return `GeoJSON, CSV, and Shapefile tiling require Tippecanoe at ${path}. Set TIPPECANOE_PATH or enable GEODATA_ALLOW_RAW_FALLBACK=true only for local degraded development.`;
}
