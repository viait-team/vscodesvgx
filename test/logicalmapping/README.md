# SVGX Logical

 Mapping Validator

Interactive validation tool for testing and debugging logical mapping attributes (`xlm` and `ylm`) in SVG charts.

## Overview

This tool implements the debugging checklist from [`TwoMethodsToLogicalMapping.md`](../../docs/TwoMethodsToLogicalMapping.md) and provides an interactive interface for validating SVG files with logical mapping attributes.

## Features

- **📁 File Upload**: Drag-and-drop or browse for SVG/SVGX files
- **🔍 Attribute Inspector**: Display and validate `xlm`, `ylm`, and `is_logical_mapping_local` attributes
- **🎯 Method Detection**: Automatically identify boundary vs. point-pair mapping method
- **✅ Validation Checklist**: Step-by-step validation with pass/fail indicators
- **🖱️ Interactive Point Tester**: Click on the SVG to see real-time pixel ↔ logical conversion
- **🔄 Round-Trip Tester**: Verify conversion accuracy (Logical → Pixel → Logical)
- **📊 Export Report**: Generate validation report for debugging

## Usage

### 1. Open the Tool

Simply open `index.html` in a modern web browser (Chrome, Edge, Firefox, Safari).

### 2. Load an SVG File

- **Drag & Drop**: Drag an SVG or SVGX file onto the upload zone
- **Browse**: Click "Browse Files" to select a file from your system

### 3. Review Validation Results

The tool will automatically:
- Extract `xlm` and `ylm` attributes
- Detect which mapping method is used (boundary vs. point-pair)
- Run all 5 validation checks from the debugging checklist
- Display results with status indicators (✅ Pass, ⚠️ Warning, ❌ Fail)

### 4. Test Interactive Points

Click anywhere on the displayed SVG to see:
- Pixel coordinates at that location
- Converted logical coordinates
- Which method was used for conversion

### 5. Test Round-Trip Conversion

1. Enter a logical X and Y value
2. Click "Test Round-Trip"
3. See the conversion flow: Logical → Pixel → Logical
4. Verify accuracy (should return to original values)

### 6. Export Report

Click "Export Validation Report" to download a text file with:
- All mapping attributes
- Detected method
- Validation results for all checks
- Timestamp

## Validation Checklist

The tool validates the following:

1. **xlm/ylm Values**
   - Checks that attributes exist
   - Verifies correct format (4 values each)
   - Warns about degenerate ranges (zero-width)

2. **Coordinate System Flag**
   - Checks `is_logical_mapping_local` setting
   - Explains local vs. global coordinate interpretation

3. **Non-Linear Scales**
   - Warns that only linear mapping is supported
   - Advises manual verification for logarithmic/exponential scales

4. **CTM Information**
   - Inspects the Current Transformation Matrix
   - Displays transformation values
   - Identifies identity matrix (no transform)

5. **Known Value Testing**
   - Tests boundary pixels with expected logical values
   - Verifies conversion accuracy
   - Reports pass/fail with actual vs. expected values

## Interpreting Results

### Status Indicators

- **✅ Pass**: Check passed successfully
- **⚠️ Warning**: Potential issue detected, review details
- **❌ Fail**: Critical issue found, must be addressed

### Common Issues

**❌ No xlm/ylm attributes found**
- SVG file doesn't have logical mapping metadata
- File may not be from a supported charting library

**⚠️ Zero range (xlm[2] === xlm[3])**
- Pixel range is degenerate (no width)
- Indicates incorrect boundary values

**❌ Test failed: Conversion does not match expected values**
- The mapping is mathematically inconsistent
- Likely incorrect pixel boundaries or logical min/max values

## Troubleshooting

### SVG Not Displaying

- Check that the file is valid SVG format
- Try opening the SVG in a regular browser first
- Verify the file isn't corrupted

### Click Testing Not Working

- Ensure the SVG has loaded successfully (visible in preview)
- Click directly on the chart area, not empty space
- Check browser console for JavaScript errors

### Unexpected Logical Values

Refer to the debugging guidance in [`TwoMethodsToLogicalMapping.md`](../../docs/TwoMethodsToLogicalMapping.md):
1. First validate the `xlm`/`ylm` attributes
2. Check coordinate system setting
3. Verify non-linear scales aren't in use
4. Test with known reference points

## Technical Details

### Supported Methods

**Method 1: Boundary Definition (d3.js/Highcharts)**
```
ylm = [Logical Min, Logical Max, Top Pixel, Bottom Pixel]
```

**Method 2: Point-Pair Definition (Plotly.js)**
```
ylm = [Logical Min, Logical Max, Pixel at Min, Pixel at Max]
```

### Formulas Used

**Pixel to Logical:**
```
logical = d_min + (pixel - v_min) * (d_max - d_min) / (v_max - v_min)
```

**Logical to Pixel:**
```
pixel = v_min + (logical - d_min) * (v_max - v_min) / (d_max - d_min)
```

## Browser Compatibility

- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+

## Files

- `index.html` - Main application interface
- `styles.css` - Styling and layout
- `validator.js` - Validation logic and interactivity
- `README.md` - This file

## Related Documentation

- [`TwoMethodsToLogicalMapping.md`](../../docs/TwoMethodsToLogicalMapping.md) - Technical specification and debugging guidance
- [`LogicalMapping.pdf`](../../docs/LogicalMapping.pdf) - Detailed  specification
- [`SVG Reader Writer Transformation.pdf`](../../docs/SVG%20Reader%20Writer%20Transformation.pdf) - Transformation details

## Support

For questions or issues, refer to the debugging guidance in the technical documentation or create an issue in the project repository.
