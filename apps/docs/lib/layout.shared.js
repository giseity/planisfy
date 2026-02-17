"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.baseOptions = exports.gitConfig = void 0;
// fill this with your actual GitHub info, for example:
exports.gitConfig = {
    user: 'fuma-nama',
    repo: 'fumadocs',
    branch: 'main',
};
function baseOptions() {
    return {
        nav: {
            title: 'My App',
        },
        githubUrl: "https://github.com/".concat(exports.gitConfig.user, "/").concat(exports.gitConfig.repo),
    };
}
exports.baseOptions = baseOptions;
