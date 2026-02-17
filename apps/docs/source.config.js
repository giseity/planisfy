"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.docs = void 0;
var config_1 = require("fumadocs-mdx/config");
var schema_1 = require("fumadocs-core/source/schema");
// You can customise Zod schemas for frontmatter and `meta.json` here
// see https://fumadocs.dev/docs/mdx/collections
exports.docs = (0, config_1.defineDocs)({
    dir: 'content/docs',
    docs: {
        schema: schema_1.pageSchema,
        postprocess: {
            includeProcessedMarkdown: true,
        },
    },
    meta: {
        schema: schema_1.metaSchema,
    },
});
exports.default = (0, config_1.defineConfig)({
    mdxOptions: {
        lastModifiedTime: 'git',
        portableTranspiler: true,
    },
});
