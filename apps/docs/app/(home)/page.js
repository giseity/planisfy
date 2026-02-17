"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var link_1 = require("next/link");
function HomePage() {
    return (<div className="flex flex-col justify-center text-center flex-1">
      <h1 className="text-2xl font-bold mb-4">Hello World</h1>
      <p>
        You can open{' '}
        <link_1.default href="/docs" className="font-medium underline">
          /docs
        </link_1.default>{' '}
        and see the documentation.
      </p>
    </div>);
}
exports.default = HomePage;
