"use client";
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Providers = void 0;
var React = require("react");
var next_themes_1 = require("next-themes");
function Providers(_a) {
    var children = _a.children;
    return (<next_themes_1.ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange enableColorScheme>
      {children}
    </next_themes_1.ThemeProvider>);
}
exports.Providers = Providers;
