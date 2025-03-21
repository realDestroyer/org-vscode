import * as vscode from "vscode";
import open from "open";


export class WindowMessage {
    type: "information" | "warning" | "error";
    message: string;
    haveButton: boolean;
    buttonText?: string;
    haveUrl: boolean;
    urlText?: string;

    constructor(
        theType: "information" | "warning" | "error",
        theMessage: string,
        showButton: boolean,
        useUrl: boolean,
        theButtonText?: string,
        textForUrl?: string
    ) {
        this.type = theType;
        this.message = theMessage;
        this.haveButton = showButton;
        this.buttonText = theButtonText;
        this.haveUrl = useUrl;
        this.urlText = textForUrl;
    }

    showMessage(): void {
        if (this.haveUrl && this.haveButton && this.buttonText && this.urlText) {
            const showMessageFn =
                this.type === "information"
                    ? vscode.window.showInformationMessage
                    : this.type === "warning"
                    ? vscode.window.showWarningMessage
                    : vscode.window.showErrorMessage;

            showMessageFn(this.message, this.buttonText).then(async (selection) => {
                if (selection === this.buttonText) {
                    await open(this.urlText!);
                }
            });                    
        } else {
            const showMessageFn =
                this.type === "information"
                    ? vscode.window.showInformationMessage
                    : this.type === "warning"
                    ? vscode.window.showWarningMessage
                    : vscode.window.showErrorMessage;
            showMessageFn(this.message);
        }
    }
}
