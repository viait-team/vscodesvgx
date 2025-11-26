// SVGX Logical Mapping Validator
// Implementation of the SvgxLogicalMapping class and validation logic

class SvgxLogicalMapping {
	constructor() {
		this.has_x_start_date = false;
		this.x_start_date = new Date();
		this.x_scale_days = 365;
	}

	toLogicalX(vx, dx_min, dx_max, vx_min, vx_max) {
		if (vx_max === vx_min) return dx_min;
		return dx_min + (vx - vx_min) * (dx_max - dx_min) / (vx_max - vx_min);
	}

	toLogicalY(vy, dy_min, dy_max, vy_min, vy_max) {
		if (vy_min === vy_max) return dy_min;
		return dy_min + (vy - vy_min) * (dy_max - dy_min) / (vy_max - vy_min);
	}

	fromLogicalX(dx, dx_min, dx_max, vx_min, vx_max) {
		if (dx_max === dx_min) return vx_min;
		return vx_min + (dx - dx_min) * (vx_max - vx_min) / (dx_max - dx_min);
	}

	fromLogicalY(dy, dy_min, dy_max, vy_min, vy_max) {
		if (dy_max === dy_min) return vy_max;
		return vy_min + (dy - dy_min) * (vy_max - vy_min) / (dy_max - dy_min);
	}

	// Helper: Check if a value is .NET Ticks (large datetime number)
	isDateTimeTicks(value) {
		return Math.abs(value) > 1e15;
	}

	// Convert .NET Ticks to JavaScript Date
	ticksToDate(ticks) {
		const EPOCH_DIFF_DAYS = 719163;
		const EPOCH_DIFF_SECONDS = EPOCH_DIFF_DAYS * 86400;
		const TICKS_PER_SECOND = 10000000;
		const total_seconds = Math.floor(Number(ticks) / TICKS_PER_SECOND);
		const seconds_from_unix_epoch = total_seconds - EPOCH_DIFF_SECONDS;
		return new Date(seconds_from_unix_epoch * 1000);
	}

	// Convert JavaScript Date to .NET Ticks
	dateToTicks(date) {
		const EPOCH_DIFF_DAYS = 719163;
		const EPOCH_DIFF_SECONDS = EPOCH_DIFF_DAYS * 86400;
		const TICKS_PER_SECOND = 10000000;
		const seconds_from_unix_epoch = Math.round(date.getTime() / 1000);
		const total_seconds = seconds_from_unix_epoch + EPOCH_DIFF_SECONDS;
		return total_seconds * TICKS_PER_SECOND;
	}

	// Format date for display
	formatDate(date) {
		return date.toLocaleString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false
		});
	}
}

// App State
const state = {
	svgDocument: null,
	svgElement: null,
	xlm: null,
	ylm: null,
	isLogicalMappingLocal: null,
	mapping: new SvgxLogicalMapping(),
	validationResults: {}
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
	initializeApp();
});

function initializeApp() {
	setupFileUpload();
	setupInteractiveTester();
	setupRoundTripTester();
	setupExportButton();
}

// File Upload
function setupFileUpload() {
	const dropZone = document.getElementById('dropZone');
	const fileInput = document.getElementById('fileInput');
	const browseBtn = document.getElementById('browseBtn');

	browseBtn.addEventListener('click', (e) => {
		e.stopPropagation(); // Prevent bubbling to dropZone
		fileInput.click();
	});

	fileInput.addEventListener('change', (e) => {
		if (e.target.files.length > 0) {
			handleFile(e.target.files[0]);
		}
	});

	dropZone.addEventListener('click', () => fileInput.click());

	dropZone.addEventListener('dragover', (e) => {
		e.preventDefault();
		dropZone.classList.add('drag-over');
	});

	dropZone.addEventListener('dragleave', () => {
		dropZone.classList.remove('drag-over');
	});

	dropZone.addEventListener('drop', (e) => {
		e.preventDefault();
		dropZone.classList.remove('drag-over');
		if (e.dataTransfer.files.length > 0) {
			handleFile(e.dataTransfer.files[0]);
		}
	});
}

function handleFile(file) {
	if (!file.name.endsWith('.svg') && !file.name.endsWith('.svgx')) {
		alert('Please select an SVG or SVGX file');
		return;
	}

	const reader = new FileReader();
	reader.onload = (e) => {
		try {
			parseSVG(e.target.result, file.name);
		} catch (error) {
			alert('Error parsing SVG: ' + error.message);
			console.error(error);
		}
	};
	reader.readAsText(file);
}

function parseSVG(svgContent, filename) {
	const parser = new DOMParser();
	const doc = parser.parseFromString(svgContent, 'image/svg+xml');

	const svgElement = doc.querySelector('svg');
	if (!svgElement) {
		throw new Error('No SVG element found');
	}

	// Store state
	state.svgDocument = doc;
	state.svgElement = svgElement;

	// Extract attributes
	const xlmAttr = svgElement.getAttribute('xlm');
	const ylmAttr = svgElement.getAttribute('ylm');
	const isLocalAttr = svgElement.getAttribute('is_logical_mapping_local');

	state.xlm = xlmAttr ? JSON.parse(xlmAttr) : null;
	state.ylm = ylmAttr ? JSON.parse(ylmAttr) : null;
	state.isLogicalMappingLocal = isLocalAttr === 'true';

	// Update UI
	displayFileInfo(filename);
	displayAttributes();
	detectMethod();
	displayDebugLog();
	runValidation();
	displaySVG();
	updateDateTimeInputs();

	// Enable export button
	document.getElementById('exportReportBtn').disabled = false;
}

function displayDebugLog() {
	const display = document.getElementById('debugLog');

	if (!state.svgElement) {
		display.innerHTML = '<p class="placeholder">No SVG loaded</p>';
		return;
	}

	let html = '<h3 style="margin-bottom:12px;font-size:0.9rem;">Grid Path Analysis</h3>';

	// Y-axis grid paths
	const yGridPaths = state.svgElement.querySelectorAll('.gridlayer .y path');
	if (yGridPaths.length > 0) {
		html += '<div class="debug-item">';
		html += '<strong>Y-Axis Grid Paths (first 3):</strong>';
		Array.from(yGridPaths).slice(0, 3).forEach((path, i) => {
			const transform = path.getAttribute('transform') || 'none';
			const d = path.getAttribute('d') || 'none';
			html += `<div style="margin-top:8px;"><em>Path ${i + 1}:</em></div>`;
			html += `<code>transform: ${transform}</code>`;
			html += `<code>d: ${d}</code>`;
		});
		html += '</div>';
	} else {
		html += '<div class="debug-item">⚠️ No Y-axis grid paths found (.gridlayer .y path)</div>';
	}

	// X-axis grid paths
	const xGridPaths = state.svgElement.querySelectorAll('.gridlayer .x path');
	if (xGridPaths.length > 0) {
		html += '<div class="debug-item">';
		html += '<strong>X-Axis Grid Paths (first 3):</strong>';
		Array.from(xGridPaths).slice(0, 3).forEach((path, i) => {
			const transform = path.getAttribute('transform') || 'none';
			const d = path.getAttribute('d') || 'none';
			html += `<div style="margin-top:8px;"><em>Path ${i + 1}:</em></div>`;
			html += `<code>transform: ${transform}</code>`;
			html += `<code>d: ${d}</code>`;
		});
		html += '</div>';
	} else {
		html += '<div class="debug-item">⚠️ No X-axis grid paths found (.gridlayer .x path)</div>';
	}

	display.innerHTML = html;
}

function displayFileInfo(filename) {
	const fileInfo = document.getElementById('fileInfo');
	fileInfo.innerHTML = `<strong>📄 File:</strong> ${filename}`;
	fileInfo.classList.remove('hidden');
}

function displayAttributes() {
	const display = document.getElementById('attributesDisplay');

	if (!state.xlm && !state.ylm) {
		display.innerHTML = '<p class="placeholder">No xlm/ylm attributes found</p>';
		return;
	}

	let html = '';

	if (state.xlm) {
		html += `
            <div class="attr-row">
                <strong>xlm (X-axis Logical Mapping)</strong>
                <code>${JSON.stringify(state.xlm)}</code>
                <small style="display:block;margin-top:8px;color:#6b7280;">
                    [Logical Min, Logical Max, Pixel Min, Pixel Max]
                </small>
            </div>
        `;
	}

	if (state.ylm) {
		html += `
            <div class="attr-row">
                <strong>ylm (Y-axis Logical Mapping)</strong>
                <code>${JSON.stringify(state.ylm)}</code>
                <small style="display:block;margin-top:8px;color:#6b7280;">
                    [Logical Min, Logical Max, Pixel Value 1, Pixel Value 2]
                </small>
            </div>
        `;
	}

	html += `
        <div class="attr-row">
            <strong>is_logical_mapping_local</strong>
            <code>${state.isLogicalMappingLocal !== null ? state.isLogicalMappingLocal : 'not set (defaults to false)'}</code>
        </div>
    `;

	display.innerHTML = html;
}

function detectMethod() {
	const display = document.getElementById('methodDisplay');

	if (!state.ylm) {
		display.innerHTML = '<p class="placeholder">No ylm attribute to analyze</p>';
		return;
	}

	const ylm2 = state.ylm[2];
	const ylm3 = state.ylm[3];

	let method, methodClass, explanation;

	if (ylm2 < ylm3) {
		// ylm[2] is smaller (top), ylm[3] is larger (bottom)
		method = 'Boundary Method';
		methodClass = 'method-boundary';
		explanation = `
            <strong>Method 1: Boundary Definition</strong><br>
            Pixel values represent the boundaries of the chart area:<br>
            • ylm[2] = ${ylm2} (Top boundary - smaller Y)<br>
            • ylm[3] = ${ylm3} (Bottom boundary - larger Y)<br>
            <br>
            This is typical of d3.js/Highcharts implementations.
        `;
	} else {
		// ylm[2] is larger (bottom), ylm[3] is smaller (top)
		method = 'Point-Pair Method';
		methodClass = 'method-pointpair';
		explanation = `
            <strong>Method 2: Point-Pair Definition</strong><br>
            Each pixel value corresponds to its logical counterpart:<br>
            • ylm[2] = ${ylm2} → Maps to ylm[0] = ${state.ylm[0]}<br>
            • ylm[3] = ${ylm3} → Maps to ylm[1] = ${state.ylm[1]}<br>
            <br>
            This is typical of Plotly.js implementations.
        `;
	}

	display.innerHTML = `
        <div class="method-badge ${methodClass}">${method}</div>
        <div class="method-details">${explanation}</div>
    `;
}

function runValidation() {
	state.validationResults = {};

	// Step 1: Validate xlm/ylm values
	validateMappingValues();

	// Step 2: Verify coordinate system flag
	validateCoordinateSystem();

	// Step 3: Check for non-linear scales
	checkNonLinearScales();

	// Step 4: Inspect CTM
	inspectCTM();

	// Step 5: Test with known values
	testKnownValues();

	updateValidationUI();
}

function validateMappingValues() {
	const results = [];
	let status = 'pass';

	// Check xlm
	if (!state.xlm) {
		results.push('❌ No xlm attribute found');
		status = 'fail';
	} else {
		if (state.xlm.length !== 4) {
			results.push(`❌ xlm has ${state.xlm.length} values (expected 4)`);
			status = 'fail';
		}
		if (state.xlm[0] === state.xlm[1]) {
			results.push('⚠️ xlm logical range is zero (xlm[0] === xlm[1])');
			status = status === 'fail' ? 'fail' : 'warn';
		}
		if (state.xlm[2] === state.xlm[3]) {
			results.push('⚠️ xlm pixel range is zero (xlm[2] === xlm[3])');
			status = status === 'fail' ? 'fail' : 'warn';
		}
		if (status === 'pass') {
			results.push('✓ xlm has 4 values with non-zero ranges');
		}
	}

	// Check ylm
	if (!state.ylm) {
		results.push('❌ No ylm attribute found');
		status = 'fail';
	} else {
		if (state.ylm.length !== 4) {
			results.push(`❌ ylm has ${state.ylm.length} values (expected 4)`);
			status = 'fail';
		}
		if (state.ylm[0] === state.ylm[1]) {
			results.push('⚠️ ylm logical range is zero (ylm[0] === ylm[1])');
			status = status === 'fail' ? 'fail' : 'warn';
		}
		if (state.ylm[2] === state.ylm[3]) {
			results.push('⚠️ ylm pixel range is zero (ylm[2] === ylm[3])');
			status = status === 'fail' ? 'fail' : 'warn';
		}
		if (status === 'pass') {
			results.push('✓ ylm has 4 values with non-zero ranges');
		}
	}

	state.validationResults.step1 = { status, details: results.join('<br>') };
}

function validateCoordinateSystem() {
	const results = [];
	let status = 'pass';

	if (state.isLogicalMappingLocal === null) {
		results.push('ℹ️ is_logical_mapping_local not set (defaults to false)');
		results.push('This means pixel coordinates are in global/user space');
		status = 'warn';
	} else if (state.isLogicalMappingLocal === true) {
		results.push('✓ is_logical_mapping_local = true');
		results.push('Pixel coordinates are local to the element');
	} else {
		results.push('✓ is_logical_mapping_local = false');
		results.push('Pixel coordinates are in global/user space');
	}

	state.validationResults.step2 = { status, details: results.join('<br>') };
}

function checkNonLinearScales() {
	const results = [];
	let status = 'pass';

	results.push('ℹ️ Current implementation supports LINEAR mapping only');
	results.push('');
	results.push('If your chart uses logarithmic, exponential, or other non-linear scales, conversion will be INCORRECT.');
	results.push('');
	results.push('⚠️ This validator cannot automatically detect non-linear scales. You must verify this manually.');

	status = 'warn';

	state.validationResults.step3 = { status, details: results.join('<br>') };
}

function inspectCTM() {
	const results = [];
	let status = 'pass';

	try {
		// Find elements with xlm/ylm
		const elementWithMapping = state.svgElement.querySelector('[xlm][ylm]') || state.svgElement;

		if (elementWithMapping.getCTM) {
			const ctm = elementWithMapping.getCTM();
			results.push('✓ CTM (Current Transformation Matrix) available');
			results.push(`<code>a: ${ctm.a.toFixed(4)}, b: ${ctm.b.toFixed(4)}, c: ${ctm.c.toFixed(4)}, d: ${ctm.d.toFixed(4)}, e: ${ctm.e.toFixed(2)}, f: ${ctm.f.toFixed(2)}</code>`);

			if (ctm.a === 1 && ctm.b === 0 && ctm.c === 0 && ctm.d === 1 && ctm.e === 0 && ctm.f === 0) {
				results.push('ℹ️ Identity matrix (no transformation)');
			} else {
				results.push('ℹ️ Transformation present');
			}
		} else {
			results.push('⚠️ Cannot get CTM - element may not support it');
			status = 'warn';
		}
	} catch (error) {
		results.push('❌ Error inspecting CTM: ' + error.message);
		status = 'fail';
	}

	state.validationResults.step4 = { status, details: results.join('<br>') };
}

function testKnownValues() {
	const results = [];
	let status = 'pass';

	if (!state.ylm) {
		results.push('❌ Cannot test - no ylm attribute');
		state.validationResults.step5 = { status: 'fail', details: results.join('<br>') };
		return;
	}

	// Sort pixel coordinates
	let ylm1 = state.ylm[3];
	let ylm2 = state.ylm[2];
	if (ylm1 < ylm2) {
		ylm1 = state.ylm[2];
		ylm2 = state.ylm[3];
	}

	// Test top pixel (smaller Y) should give logical max
	const logicalAtTop = state.mapping.toLogicalY(
		ylm2,
		state.ylm[0],
		state.ylm[1],
		ylm1,
		ylm2
	);

	// Test bottom pixel (larger Y) should give logical min
	const logicalAtBottom = state.mapping.toLogicalY(
		ylm1,
		state.ylm[0],
		state.ylm[1],
		ylm1,
		ylm2
	);

	const topCorrect = Math.abs(logicalAtTop - state.ylm[1]) < 0.001;
	const bottomCorrect = Math.abs(logicalAtBottom - state.ylm[0]) < 0.001;

	if (topCorrect && bottomCorrect) {
		results.push('✓ Test passed: Known pixel values map to correct logical values');
		results.push(`  Top pixel (${ylm2.toFixed(2)}) → Logical: ${logicalAtTop.toFixed(4)} (Expected: ${state.ylm[1]})`);
		results.push(`  Bottom pixel (${ylm1.toFixed(2)}) → Logical: ${logicalAtBottom.toFixed(4)} (Expected: ${state.ylm[0]})`);
	} else {
		results.push('❌ Test failed: Conversion results do not match expected values');
		results.push(`  Top pixel → Logical: ${logicalAtTop.toFixed(4)} (Expected: ${state.ylm[1]})`);
		results.push(`  Bottom pixel → Logical: ${logicalAtBottom.toFixed(4)} (Expected: ${state.ylm[0]})`);
		status = 'fail';
	}

	state.validationResults.step5 = { status, details: results.join('<br>') };
}

function updateValidationUI() {
	for (let step = 1; step <= 5; step++) {
		const item = document.querySelector(`.checklist-item[data-step="${step}"]`);
		const result = state.validationResults[`step${step}`];

		if (!result) continue;

		// Update status icon and class
		item.className = `checklist-item ${result.status}`;
		const statusIcon = item.querySelector('.status');
		if (result.status === 'pass') {
			statusIcon.textContent = '✅';
		} else if (result.status === 'fail') {
			statusIcon.textContent = '❌';
		} else if (result.status === 'warn') {
			statusIcon.textContent = '⚠️';
		}

		// Update details
		const details = item.querySelector('.details');
		details.innerHTML = result.details;
		details.classList.remove('hidden');
	}
}

// Interactive Tester
function setupInteractiveTester() {
	// Will be activated after SVG is loaded
}

function displaySVG() {
	const preview = document.getElementById('svgPreview');

	if (!state.svgElement) {
		preview.innerHTML = '<p class="placeholder">No SVG loaded</p>';
		return;
	}

	// Clone and display
	const svgClone = state.svgElement.cloneNode(true);
	preview.innerHTML = '';
	preview.appendChild(svgClone);

	// Add click handler
	preview.addEventListener('click', handleSVGClick);
}

function handleSVGClick(event) {
	if (!state.xlm || !state.ylm) return;

	// Get the SVG element from the preview
	const svgElement = event.currentTarget.querySelector('svg');
	if (!svgElement) {
		console.error('No SVG element found in preview');
		return;
	}

	// Create a point in screen coordinates
	const pt = svgElement.createSVGPoint();
	pt.x = event.clientX;
	pt.y = event.clientY;

	// Convert from screen coordinates to SVG user coordinates
	const screenCTM = svgElement.getScreenCTM();
	if (!screenCTM) {
		console.error('Could not get screen CTM');
		return;
	}

	const svgPt = pt.matrixTransform(screenCTM.inverse());

	// Use the SVG user coordinates
	const pixelX = svgPt.x;
	const pixelY = svgPt.y;

	// Convert to logical
	const logicalX = state.mapping.toLogicalX(
		pixelX,
		state.xlm[0],
		state.xlm[1],
		state.xlm[2],
		state.xlm[3]
	);

	// Sort ylm pixel coordinates
	let ylm1 = state.ylm[3];
	let ylm2 = state.ylm[2];
	if (ylm1 < ylm2) {
		ylm1 = state.ylm[2];
		ylm2 = state.ylm[3];
	}

	const logicalY = state.mapping.toLogicalY(
		pixelY,
		state.ylm[0],
		state.ylm[1],
		ylm1,
		ylm2
	);

	// Update UI with datetime support
	let logicalXDisplay = logicalX.toFixed(4);
	let logicalYDisplay = logicalY.toFixed(4);

	if (state.mapping.isDateTimeTicks(logicalX)) {
		const date = state.mapping.ticksToDate(logicalX);
		logicalXDisplay = `${logicalX.toFixed(0)} → ${state.mapping.formatDate(date)}`;
	}

	document.getElementById('pixelCoords').textContent = `(${pixelX.toFixed(2)}, ${pixelY.toFixed(2)})`;
	document.getElementById('logicalCoords').innerHTML = `X: ${logicalXDisplay}<br>Y: ${logicalYDisplay}`;
	document.getElementById('methodUsed').textContent = ylm2 < ylm1 ? 'Boundary Method' : 'Point-Pair Method';
}

// Update datetime inputs based on xlm detection
function updateDateTimeInputs() {
	if (!state.xlm) return;

	const isDateTime = state.mapping.isDateTimeTicks(state.xlm[0]) || state.mapping.isDateTimeTicks(state.xlm[1]);

	const dateInput = document.getElementById('testLogicalXDate');
	const helperText = document.getElementById('xHelperText');

	if (isDateTime) {
		dateInput.classList.remove('hidden');
		helperText.classList.remove('hidden');
	} else {
		dateInput.classList.add('hidden');
		helperText.classList.add('hidden');
	}
}

// Round-Trip Tester
function setupRoundTripTester() {
	document.getElementById('testRoundTripBtn').addEventListener('click', testRoundTrip);

	// Handle date input conversion
	document.getElementById('testLogicalXDate').addEventListener('change', function (e) {
		if (e.target.value) {
			const selectedDate = new Date(e.target.value);
			const ticks = state.mapping.dateToTicks(selectedDate);
			document.getElementById('testLogicalX').value = ticks;
		}
	});
}

function testRoundTrip() {
	const logicalX = parseFloat(document.getElementById('testLogicalX').value);
	const logicalY = parseFloat(document.getElementById('testLogicalY').value);

	if (isNaN(logicalX) || isNaN(logicalY)) {
		alert('Please enter valid numeric values');
		return;
	}

	if (!state.xlm || !state.ylm) {
		alert('No mapping loaded');
		return;
	}

	// Convert logical → pixel
	const pixelX = state.mapping.fromLogicalX(
		logicalX,
		state.xlm[0],
		state.xlm[1],
		state.xlm[2],
		state.xlm[3]
	);

	let ylm1 = state.ylm[3];
	let ylm2 = state.ylm[2];
	if (ylm1 < ylm2) {
		ylm1 = state.ylm[2];
		ylm2 = state.ylm[3];
	}

	const pixelY = state.mapping.fromLogicalY(
		logicalY,
		state.ylm[0],
		state.ylm[1],
		ylm1,
		ylm2
	);

	// Convert pixel → logical
	const logicalXBack = state.mapping.toLogicalX(
		pixelX,
		state.xlm[0],
		state.xlm[1],
		state.xlm[2],
		state.xlm[3]
	);

	const logicalYBack = state.mapping.toLogicalY(
		pixelY,
		state.ylm[0],
		state.ylm[1],
		ylm1,
		ylm2
	);

	// Calculate accuracy
	const errorX = Math.abs(logicalX - logicalXBack);
	const errorY = Math.abs(logicalY - logicalYBack);
	const maxError = Math.max(errorX, errorY);
	const accurate = maxError < 0.0001;

	// Format display with datetime support
	const isDateTime = state.mapping.isDateTimeTicks(logicalX);

	let logical1Display, logical2Display;
	if (isDateTime) {
		const date1 = state.mapping.ticksToDate(logicalX);
		const date2 = state.mapping.ticksToDate(logicalXBack);
		logical1Display = `X: ${logicalX.toFixed(0)} (${state.mapping.formatDate(date1)})<br>Y: ${logicalY.toFixed(4)}`;
		logical2Display = `X: ${logicalXBack.toFixed(0)} (${state.mapping.formatDate(date2)})<br>Y: ${logicalYBack.toFixed(4)}`;
	} else {
		logical1Display = `(${logicalX.toFixed(4)}, ${logicalY.toFixed(4)})`;
		logical2Display = `(${logicalXBack.toFixed(4)}, ${logicalYBack.toFixed(4)})`;
	}

	// Update UI
	document.getElementById('rtLogical1').innerHTML = logical1Display;
	document.getElementById('rtPixel').textContent = `(${pixelX.toFixed(2)}, ${pixelY.toFixed(2)})`;
	document.getElementById('rtLogical2').innerHTML = logical2Display;

	const accuracySpan = document.getElementById('rtAccuracy');
	if (accurate) {
		accuracySpan.textContent = `✅ PASS (Error: ${maxError.toExponential(2)})`;
		accuracySpan.className = 'accuracy-pass';
	} else {
		accuracySpan.textContent = `❌ FAIL (Error: ${maxError.toFixed(6)})`;
		accuracySpan.className = 'accuracy-fail';
	}

	document.getElementById('roundtripResults').classList.remove('hidden');
}

// Export Report
function setupExportButton() {
	document.getElementById('exportReportBtn').addEventListener('click', exportReport);
}

function exportReport() {
	const report = generateReport();
	const blob = new Blob([report], { type: 'text/plain' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = 'logical-mapping-validation-report.txt';
	a.click();
	URL.revokeObjectURL(url);
}

function generateReport() {
	const timestamp = new Date().toISOString();

	let report = `SVGX Logical Mapping Validation Report
Generated: ${timestamp}
${'='.repeat(60)}

`;

	// Attributes
	report += `MAPPING ATTRIBUTES\n${'-'.repeat(60)}\n`;
	report += `xlm: ${JSON.stringify(state.xlm)}\n`;
	report += `ylm: ${JSON.stringify(state.ylm)}\n`;
	report += `is_logical_mapping_local: ${state.isLogicalMappingLocal}\n\n`;

	// Method
	const ylm2 = state.ylm[2];
	const ylm3 = state.ylm[3];
	const method = ylm2 < ylm3 ? 'Boundary Method (d3.js style)' : 'Point-Pair Method (Plotly.js style)';
	report += `DETECTED METHOD\n${'-'.repeat(60)}\n${method}\n\n`;

	// Validation Results
	report += `VALIDATION RESULTS\n${'-'.repeat(60)}\n`;
	for (let step = 1; step <= 5; step++) {
		const result = state.validationResults[`step${step}`];
		if (result) {
			const statusSymbol = result.status === 'pass' ? '✓' : result.status === 'fail' ? '✗' : '⚠';
			report += `${statusSymbol} Step ${step}: ${result.status.toUpperCase()}\n`;
			report += result.details.replace(/<br>/g, '\n').replace(/<\/?code>/g, '').replace(/<\/?strong>/g, '') + '\n\n';
		}
	}

	return report;
}
