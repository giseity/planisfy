"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var source_1 = require("@/lib/source");
var docs_1 = require("fumadocs-ui/layouts/docs");
var layout_shared_1 = require("@/lib/layout.shared");
function Layout(_a) {
    var children = _a.children;
    return (<docs_1.DocsLayout tree={source_1.source.getPageTree()} {...(0, layout_shared_1.baseOptions)()}>
      {children}
    </docs_1.DocsLayout>);
}
exports.default = Layout;
