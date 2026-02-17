"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var button_1 = require("@workspace/ui/components/button");
function Page() {
    return (<div className="flex items-center justify-center min-h-svh">
      <div className="flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Hello World</h1>
        <div className="flex gap-2">
          <button_1.Button>Button</button_1.Button>
          <button_1.Button variant="outline">Outline</button_1.Button>
        </div>
      </div>
    </div>);
}
exports.default = Page;
