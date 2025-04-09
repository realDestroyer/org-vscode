"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WindowMessage = void 0;
const vscode = require("vscode");
const open_1 = require("open");
class WindowMessage {
    type;
    message;
    haveButton;
    buttonText;
    haveUrl;
    urlText;
    constructor(theType, theMessage, showButton, useUrl, theButtonText, textForUrl) {
        this.type = theType;
        this.message = theMessage;
        this.haveButton = showButton;
        this.buttonText = theButtonText;
        this.haveUrl = useUrl;
        this.urlText = textForUrl;
    }
    showMessage() {
        if (this.haveUrl && this.haveButton && this.buttonText && this.urlText) {
            const showMessageFn = this.type === "information"
                ? vscode.window.showInformationMessage
                : this.type === "warning"
                    ? vscode.window.showWarningMessage
                    : vscode.window.showErrorMessage;
            showMessageFn(this.message, this.buttonText).then(async (selection) => {
                if (selection === this.buttonText) {
                    await (0, open_1.default)(this.urlText);
                }
            });
        }
        else {
            const showMessageFn = this.type === "information"
                ? vscode.window.showInformationMessage
                : this.type === "warning"
                    ? vscode.window.showWarningMessage
                    : vscode.window.showErrorMessage;
            showMessageFn(this.message);
        }
    }
}
exports.WindowMessage = WindowMessage;
//# sourceMappingURL=showMessage.js.map