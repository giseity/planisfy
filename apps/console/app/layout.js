"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var google_1 = require("next/font/google");
require("@workspace/ui/globals.css");
var providers_1 = require("@/components/providers");
var fontSans = (0, google_1.Geist)({
    subsets: ["latin"],
    variable: "--font-sans",
});
var fontMono = (0, google_1.Geist_Mono)({
    subsets: ["latin"],
    variable: "--font-mono",
});
function RootLayout(_a) {
    var children = _a.children;
    return (<html lang="en" suppressHydrationWarning>
      <body className={"".concat(fontSans.variable, " ").concat(fontMono.variable, " font-sans antialiased ")}>
        <providers_1.Providers>{children}</providers_1.Providers>
      </body>
    </html>);
}
exports.default = RootLayout;
