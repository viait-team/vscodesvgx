/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


var previewVscode = previewAcquireVsCodeApi();
var previewClosing = false;
var previewD3LoadAttempted = false;
var previewD3LoadedSuccessfully = false;

function previewSafePostMessage(msg) {
	if (previewClosing) {
		return;
	}
	try {
		setTimeout(() => {
			if (previewClosing) {
				return;
			}
			try {
				if (typeof previewVscode === "object" && typeof previewVscode.postMessage === "function") {
					previewVscode.postMessage(msg);
				}
			} catch (e) {
				console.warn("postMessage failed:", e);
			}
		}, 0);
	} catch (e) {
		console.warn("safePostMessage scheduling failed", e);
	}
}
window.addEventListener("beforeunload", () => {
	previewClosing = true;
});
window.addEventListener("unload", () => {
	previewClosing = true;
});
window.addEventListener("pagehide", () => {
	previewClosing = true;
});
document.addEventListener("visibilitychange", () => {
	if (document.visibilityState === "hidden") {
		previewClosing = true;
	}
});
function previewLoadD3() {
	if (previewD3LoadAttempted) {
		return previewD3LoadedSuccessfully ? Promise.resolve() : Promise.reject(new Error("D3.js failed to load"));
	}
	previewD3LoadAttempted = true;
	return new Promise((resolve, reject) => {
		if (typeof window.d3 !== "undefined") {
			previewD3LoadedSuccessfully = true;
			console.log("D3.js already available");
			resolve();
			return;
		}
		const script = document.createElement("script");
		script.src = "https://d3js.org/d3.v7.min.js";
		script.crossOrigin = "anonymous";
		script.onload = () => {
			previewD3LoadedSuccessfully = true;
			console.log("D3.js loaded successfully");
			resolve();
		};
		script.onerror = (error) => {
			console.error("Failed to load D3.js:", error);
			reject(new Error("Failed to load D3.js from CDN"));
		};
		document.head.appendChild(script);
		setTimeout(() => {
			if (!previewD3LoadedSuccessfully) {
				reject(new Error("D3.js loading timeout"));
			}
		}, 1e4);
	});
}
async function previewFlashElement(selector) {
	console.log("flashElement called with selector:", selector);
	try {
		if (!previewD3LoadedSuccessfully) {
			console.log("D3.js not loaded, attempting to load...");
			await previewLoadD3();
		}
		if (typeof window.d3 === "undefined") {
			console.error("D3.js is not available after loading attempt");
			return;
		}
		const d3 = window.d3;
		const selection = d3.select("#svg-container").selectAll(selector);
		if (selection.empty()) {
			console.warn("No elements found for selector:", selector);
			const altSelection = d3.select("body").selectAll(selector);
			if (altSelection.empty()) {
				console.warn("No elements found anywhere for selector:", selector);
				return;
			}
			console.log("Found elements using alternative search");
			previewPerformFlashAnimation(altSelection);
		} else {
			console.log("Found elements for flashing:", selection.size());
			previewPerformFlashAnimation(selection);
		}
	} catch (error) {
		console.error("Error in flashElement:", error);
	}
}
function previewPerformFlashAnimation(selection) {
	if (!selection || selection.empty()) {
		console.warn("No selection to animate");
		return;
	}
	const d3 = window.d3;
	const originalStyles = /* @__PURE__ */ new Map();
	selection.each(function () {
		const element = this;
		originalStyles.set(element, {
			stroke: element.style.stroke || d3.select(element).attr("stroke"),
			strokeWidth: element.style.strokeWidth || d3.select(element).attr("stroke-width"),
			fill: element.style.fill || d3.select(element).attr("fill"),
			opacity: element.style.opacity || d3.select(element).attr("opacity") || "1"
		});
	});
	selection.transition().duration(150).style("stroke", "#ff6b35").style("stroke-width", "3px").style("fill", "rgba(255, 107, 53, 0.3)").style("opacity", "0.8").transition().duration(150).style("opacity", "1").transition().duration(150).style("opacity", "0.6").transition().duration(150).style("opacity", "1").transition().duration(200).style("stroke", function (_d, i, nodes) {
		const element = nodes[i];
		const original = originalStyles.get(element);
		return original?.stroke || null;
	}).style("stroke-width", function (_d, i, nodes) {
		const element = nodes[i];
		const original = originalStyles.get(element);
		return original?.strokeWidth || null;
	}).style("fill", function (_d, i, nodes) {
		const element = nodes[i];
		const original = originalStyles.get(element);
		return original?.fill || null;
	}).style("opacity", function (_d, i, nodes) {
		const element = nodes[i];
		const original = originalStyles.get(element);
		return original?.opacity || "1";
	});
	console.log("Flash animation applied to", selection.size(), "elements");
}
window.addEventListener("message", (event) => {
	const message = event.data;
	console.log("Preview webview received message:", message);
	switch (message.type) {
		case "highlightElement":
			console.log("highlightElement message received in preview webview:", message);
			if (message.data && message.data.selector) {
				console.log("Calling flashElement with selector:", message.data.selector);
				previewFlashElement(message.data.selector);
			} else {
				console.warn("highlightElement message missing data or selector");
			}
			break;
		case "flashElement":
			console.log("flashElement message received in preview webview:", message);
			previewFlashElement(message.elementId || message.selector);
			break;
		case "setSVGContent":
			console.log("setSVGContent message received, content length:", message.data?.content?.length);
			previewInitializePreviewFeatures();
			break;
		case "ready":
			console.log("Preview webview ready signal received");
			previewInitializePreviewFeatures();
			break;
		default:
			console.log("Unknown message type in preview webview:", message.type);
			break;
	}
});
function previewInitializePreviewFeatures() {
	console.log("Initializing preview features...");
	previewLoadD3().then(() => {
		console.log("Preview webview ready with D3.js support");
		previewSafePostMessage({
			type: "debug",
			msg: "Preview webview initialized with D3.js flashing support"
		});
	}).catch((error) => {
		console.error("Failed to initialize D3.js:", error);
		previewSafePostMessage({
			type: "debug",
			msg: "Preview webview initialized without D3.js: " + error.message
		});
	});
}
window.addEventListener("DOMContentLoaded", () => {
	console.log("Preview webview DOM loaded");
	previewSafePostMessage({ type: "ready" });
	previewInitializePreviewFeatures();
});
window.previewFlashElement = previewFlashElement;
//# sourceMappingURL=preview.js.map
