/******/ (function() { // webpackBootstrap
const inputTags = ["input", "textarea", "select"];
const labelTags = ["label", "span"];
const attributeKeys = ["id", "name", "label-aria", "placeholder"];
const invalidElement = chrome.i18n.getMessage("copyCustomFieldNameInvalidElement");
const noUniqueIdentifier = chrome.i18n.getMessage("copyCustomFieldNameNotUnique");
let clickedElement = null;
// Find the best attribute to be used as the Name for an element in a custom field.
function getClickedElementIdentifier() {
    var _a, _b;
    if (clickedElement == null) {
        return invalidElement;
    }
    const clickedTag = clickedElement.nodeName.toLowerCase();
    let inputElement = null;
    // Try to identify the input element (which may not be the clicked element)
    if (labelTags.includes(clickedTag)) {
        let inputId;
        if (clickedTag === "label") {
            inputId = clickedElement.getAttribute("for");
        }
        else {
            inputId = (_a = clickedElement.closest("label")) === null || _a === void 0 ? void 0 : _a.getAttribute("for");
        }
        if (inputId) {
            inputElement = document.getElementById(inputId);
        }
    }
    else {
        inputElement = clickedElement;
    }
    if (inputElement == null || !inputTags.includes(inputElement.nodeName.toLowerCase())) {
        return invalidElement;
    }
    for (const attributeKey of attributeKeys) {
        const attributeValue = inputElement.getAttribute(attributeKey);
        const selector = "[" + attributeKey + '="' + attributeValue + '"]';
        if (!isNullOrEmpty(attributeValue) && ((_b = document.querySelectorAll(selector)) === null || _b === void 0 ? void 0 : _b.length) === 1) {
            return attributeValue;
        }
    }
    return noUniqueIdentifier;
}
function isNullOrEmpty(s) {
    return s == null || s === "";
}
// We only have access to the element that's been clicked when the context menu is first opened.
// Remember it for use later.
document.addEventListener("contextmenu", (event) => {
    clickedElement = event.target;
});
// Runs when the 'Copy Custom Field Name' context menu item is actually clicked.
chrome.runtime.onMessage.addListener((event, _sender, sendResponse) => {
    if (event.command === "getClickedElement") {
        const identifier = getClickedElementIdentifier();
        if (sendResponse) {
            sendResponse(identifier);
        }
        void chrome.runtime.sendMessage({
            command: "getClickedElementResponse",
            sender: "contextMenuHandler",
            identifier: identifier,
        });
    }
});

/******/ })()
;