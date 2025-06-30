#!/usr/bin/env tsx

import { readFileSync } from 'fs';
import { join } from 'path';

interface TestPattern {
  pattern: string;
  replacement: string;
}

interface TestCase {
  input: string;
  expected: string;
  description?: string;
}

interface TestConfig {
  division2_patterns: Record<string, TestPattern>;
  alternative_formats: Record<string, TestPattern>;
  test_titles: string[];
  expected_results: Record<string, { input: string; output: string }>;
}

/**
 * Test a regex pattern against a title
 */
function testPattern(pattern: string, replacement: string, title: string): string {
  try {
    const regex = new RegExp(pattern);
    return title.replace(regex, replacement);
  } catch (error) {
    console.error(`Invalid regex pattern: ${pattern}`);
    return title;
  }
}

/**
 * Run tests for a specific pattern
 */
function runPatternTests(patternName: string, pattern: TestPattern, testCases: TestCase[]): void {
  console.log(`\n🧪 Testing Pattern: ${patternName}`);
  console.log(`Pattern: ${pattern.pattern}`);
  console.log(`Replacement: ${pattern.replacement}`);
  console.log('─'.repeat(80));

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const result = testPattern(pattern.pattern, pattern.replacement, testCase.input);
    const success = result === testCase.expected;
    
    if (success) {
      console.log(`✅ PASS: "${testCase.input}"`);
      console.log(`   → "${result}"`);
      passed++;
    } else {
      console.log(`❌ FAIL: "${testCase.input}"`);
      console.log(`   Expected: "${testCase.expected}"`);
      console.log(`   Got:      "${result}"`);
      failed++;
    }
    
    if (testCase.description) {
      console.log(`   Note: ${testCase.description}`);
    }
    console.log('');
  }

  console.log(`Results: ${passed} passed, ${failed} failed`);
}

/**
 * Add a new test case
 */
function addTestCase(
  config: TestConfig,
  patternName: string,
  input: string,
  expected: string,
  description?: string
): void {
  if (!config.division2_patterns[patternName] && !config.alternative_formats[patternName]) {
    console.error(`Pattern "${patternName}" not found in config`);
    return;
  }

  const testCase: TestCase = { input, expected, description };
  
  // Add to test_titles if not already present
  if (!config.test_titles.includes(input)) {
    config.test_titles.push(input);
  }

  // Add to expected_results
  config.expected_results[`${patternName}_${config.test_titles.length}`] = { input, output: expected };

  console.log(`✅ Added test case for pattern "${patternName}":`);
  console.log(`   Input: "${input}"`);
  console.log(`   Expected: "${expected}"`);
  if (description) {
    console.log(`   Description: ${description}`);
  }
}

/**
 * Main test runner
 */
async function main(): Promise<void> {
  const configPath = join(__dirname, 'test-configs.json');
  const config: TestConfig = JSON.parse(readFileSync(configPath, 'utf-8'));

  console.log('🎯 Video Processing Pattern Tests');
  console.log('='.repeat(80));

  // Test Division 2 patterns
  for (const [patternName, pattern] of Object.entries(config.division2_patterns)) {
    const testCases: TestCase[] = [];
    
    // Add test cases from expected_results
    for (const [key, expected] of Object.entries(config.expected_results)) {
      if (key.startsWith(patternName)) {
        testCases.push({
          input: expected.input,
          expected: expected.output
        });
      }
    }

    // Add some default test cases if none exist
    if (testCases.length === 0) {
      testCases.push({
        input: "Tom Clancy's The Division 2 2025 03 29 10 01 17 02 going rogue gone wrong",
        expected: "DZ going rogue gone wrong / The Division 2 / 2025-03-29"
      });
    }

    runPatternTests(patternName, pattern, testCases);
  }

  // Test alternative formats
  for (const [patternName, pattern] of Object.entries(config.alternative_formats)) {
    const testCases: TestCase[] = [];
    
    // Add test cases from expected_results
    for (const [key, expected] of Object.entries(config.expected_results)) {
      if (key.startsWith(patternName)) {
        testCases.push({
          input: expected.input,
          expected: expected.output
        });
      }
    }

    runPatternTests(patternName, pattern, testCases);
  }

  console.log('\n📝 To add new test cases, use:');
  console.log('addTestCase(config, "patternName", "input title", "expected output", "description")');
  console.log('\n📝 To add new patterns, edit tests/test-configs.json');
}

// Example of how to add new test cases
if (require.main === module) {
  main().catch(console.error);
}

export { addTestCase, runPatternTests, testPattern }; 