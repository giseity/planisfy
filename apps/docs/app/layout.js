"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var next_1 = require("fumadocs-ui/provider/next");
require("./global.css");
var google_1 = require("next/font/google");
var inter = (0, google_1.Inter)({
    subsets: ['latin'],
});
function Layout(_a) {
    var children = _a.children;
    return (<html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <next_1.RootProvider>{children}</next_1.RootProvider>
      </body>
    </html>);
}
exports.default = Layout;
