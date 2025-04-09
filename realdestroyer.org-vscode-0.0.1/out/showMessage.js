"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WindowMessage = void 0;
const vscode = require("vscode");
const opn = require('opn');
class WindowMessage {
    //attributes
    type;
    message;
    haveButton;
    buttonText;
    haveUrl;
    urlText;
    /**
     *
     * @param theType the type of message needs to be information, warning, or error
     * @param theMessage the message
     * @param showButton true or false to show a button
     * @param useUrl true or false have button open a url
     * @param theButtonText the button text optional
     * @param textForUrl the url text optional
     */
    constructor(theType, theMessage, showButton, useUrl, theButtonText, textForUrl) {
        this.type = theType;
        this.message = theMessage;
        this.haveButton = showButton;
        this.buttonText = theButtonText;
        this.haveUrl = useUrl;
        this.urlText = textForUrl;
    }
    showMessage() {
        //information type
        if (this.type === "information") {
            //open in browswer
            if (this.haveUrl === true && this.haveButton === true && this.buttonText !== undefined) {
                vscode.window.showInformationMessage(this.message, ...[this.buttonText]).then(selection => {
                    opn(this.urlText);
                });
            }
            else {
                vscode.window.showErrorMessage(this.message);
            }
        }
        else if (this.type === "warning") {
            //open in browswer
            if (this.haveUrl === true && this.haveButton === true && this.buttonText !== undefined) {
                vscode.window.showWarningMessage(this.message, ...[this.buttonText]).then(selection => {
                    opn(this.urlText);
                });
            }
            else {
                vscode.window.showErrorMessage(this.message);
            }
        }
        else if (this.type === "error") {
            //open in browswer
            if (this.haveUrl === true && this.haveButton === true && this.buttonText !== undefined) {
                vscode.window.showErrorMessage(this.message, ...[this.buttonText]).then(selection => {
                    opn(this.urlText);
                });
            }
            else {
                vscode.window.showErrorMessage(this.message);
            }
        }
    }
}
exports.WindowMessage = WindowMessage;
//# sourceMappingURL=showMessage.js.map