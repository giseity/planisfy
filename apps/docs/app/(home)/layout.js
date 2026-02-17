"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var home_1 = require("fumadocs-ui/layouts/home");
var layout_shared_1 = require("@/lib/layout.shared");
function Layout(_a) {
    var children = _a.children;
    return <home_1.HomeLayout {...(0, layout_shared_1.baseOptions)()}>{children}</home_1.HomeLayout>;
}
exports.default = Layout;
