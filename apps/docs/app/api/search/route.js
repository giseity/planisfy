"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = void 0;
var source_1 = require("@/lib/source");
var server_1 = require("fumadocs-core/search/server");
exports.GET = (0, server_1.createFromSource)(source_1.source, {
    // https://docs.orama.com/docs/orama-js/supported-languages
    language: 'english',
}).GET;
