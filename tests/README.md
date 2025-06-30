# Video Processing Tests

This directory contains comprehensive tests for the video processing functionality, including named group regex patterns.

## Test Files

- `video-processing.test.ts` - Main test suite using Vitest
- `test-configs.json` - Configuration file with various regex patterns and test cases
- `run-pattern-tests.ts` - Standalone test runner for quick pattern testing

## Named Groups

The tests demonstrate the use of named groups in regex patterns for better readability:

```json
{
  "pattern": "Tom Clancy's The Division 2 (?<year>\\d{4}) (?<month>\\d{2}) (?<day>\\d{2}) (?<hour>\\d{2}) (?<minute>\\d{2}) (?<second>\\d{2}) (?<centisecond>\\d{2}) (?<rest>.+)",
  "replacement": "DZ $<rest> / The Division 2 / $<year>-$<month>-$<day>"
}
```

### Named Group Benefits

1. **Readability**: `$<year>` is clearer than `$1`
2. **Maintainability**: Adding/removing groups doesn't break references
3. **Self-documenting**: Pattern intent is clear from group names
4. **Flexibility**: Easy to reorder or modify groups

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests in watch mode
```bash
npm run test:watch
```

### Run pattern tests only
```bash
npm run test:patterns
```

## Adding New Test Cases

### Method 1: Edit test-configs.json

Add new test cases to `tests/test-configs.json`:

```json
{
  "expected_results": {
    "basic_new_case": {
      "input": "Tom Clancy's The Division 2 2025 03 29 10 01 17 02 new test case",
      "output": "DZ new test case / The Division 2 / 2025-03-29"
    }
  }
}
```

### Method 2: Add to test suite

Add new test cases to `tests/video-processing.test.ts`:

```typescript
it('should handle new title format', () => {
  const originalTitle = "Tom Clancy's The Division 2 2025 03 29 10 01 17 02 new test case";
  const recordingDate = '2025-03-29T10:01:17.020Z';
  
  const result = processor['transformTitle'](originalTitle, recordingDate);
  
  expect(result).toBe("DZ new test case / The Division 2 / 2025-03-29");
});
```

## Adding New Patterns

### 1. Add to test-configs.json

```json
{
  "division2_patterns": {
    "new_pattern": {
      "pattern": "Your regex pattern with (?<named>groups)",
      "replacement": "Your replacement with $<named> references"
    }
  }
}
```

### 2. Add test cases

```json
{
  "expected_results": {
    "new_pattern_test1": {
      "input": "Input title",
      "output": "Expected output"
    }
  }
}
```

### 3. Test the pattern

```bash
npm run test:patterns
```

## Pattern Examples

### Basic Division 2 Pattern
```regex
Tom Clancy's The Division 2 (?<year>\d{4}) (?<month>\d{2}) (?<day>\d{2}) (?<hour>\d{2}) (?<minute>\d{2}) (?<second>\d{2}) (?<centisecond>\d{2}) (?<rest>.+)
```

### Flexible Spacing
```regex
Tom Clancy's The Division 2\s+(?<year>\d{4})\s+(?<month>\d{2})\s+(?<day>\d{2})\s+(?<hour>\d{2})\s+(?<minute>\d{2})\s+(?<second>\d{2})\s+(?<centisecond>\d{2})\s+(?<rest>.+)
```

### With Game Group
```regex
(?<game>Tom Clancy's The Division 2) (?<year>\d{4}) (?<month>\d{2}) (?<day>\d{2}) (?<hour>\d{2}) (?<minute>\d{2}) (?<second>\d{2}) (?<centisecond>\d{2}) (?<rest>.+)
```

### Optional Time Components
```regex
Tom Clancy's The Division 2 (?<year>\d{4}) (?<month>\d{2}) (?<day>\d{2})(?: (?<hour>\d{2}) (?<minute>\d{2}) (?<second>\d{2}) (?<centisecond>\d{2}))? (?<rest>.+)
```

## Testing Different Formats

The test suite includes patterns for various datetime formats:

- **Space-separated**: `2025 03 29 10 01 17 02`
- **Dash-separated**: `2025-03-29 10:01:17`
- **Underscore-separated**: `2025_03_29_10_01_17`
- **Compact**: `20250329_100117`

## Best Practices

1. **Use named groups** for clarity and maintainability
2. **Test edge cases** like multiple spaces, special characters
3. **Validate patterns** before using them in production
4. **Document expected behavior** in test descriptions
5. **Test both matching and non-matching cases**

## Troubleshooting

### Pattern not matching
- Check for extra spaces or special characters
- Verify regex syntax with online tools
- Test with `npm run test:patterns`

### Replacement not working
- Ensure named group references use `$<groupname>` syntax
- Check that all referenced groups exist in the pattern
- Verify the replacement string syntax

### Tests failing
- Run `npm run test:patterns` to isolate pattern issues
- Check console output for detailed error messages
- Verify test expectations match actual behavior 