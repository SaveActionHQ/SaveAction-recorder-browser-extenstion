#!/usr/bin/env node

/**
 * CAROUSEL VALIDATION VERIFICATION SCRIPT
 *
 * This script verifies that carousel actions have validation and fallback metadata
 * after the BUGFIX_CAROUSEL_VALIDATION fix.
 *
 * Usage:
 *   node verify-carousel-validation.js path/to/recording.json
 *
 * Expected output:
 *   ✅ All carousel actions have validation metadata
 *   ✅ All carousel actions have fallback metadata
 *   ✅ All carousel selectors are unique (cssMatches === 1)
 */

const fs = require('fs');
const path = require('path');

// Check command line arguments
if (process.argv.length < 3) {
  console.error('Usage: node verify-carousel-validation.js <recording.json>');
  process.exit(1);
}

const recordingPath = process.argv[2];

// Check if file exists
if (!fs.existsSync(recordingPath)) {
  console.error(`❌ Error: File not found: ${recordingPath}`);
  process.exit(1);
}

// Load recording
let data;
try {
  data = JSON.parse(fs.readFileSync(recordingPath, 'utf8'));
} catch (error) {
  console.error(`❌ Error: Failed to parse JSON: ${error.message}`);
  process.exit(1);
}

console.log('\n🔍 CAROUSEL VALIDATION VERIFICATION\n');
console.log('='.repeat(60));
console.log(`Recording: ${path.basename(recordingPath)}`);
console.log(`Total actions: ${data.actions.length}`);
console.log('='.repeat(60));

// Filter actions
const carouselActions = data.actions.filter(
  (a) => a.carouselContext && a.carouselContext.isCarouselControl
);
const nonCarouselClicks = data.actions.filter(
  (a) => a.type === 'click' && (!a.carouselContext || !a.carouselContext.isCarouselControl)
);

console.log(`\nCarousel actions: ${carouselActions.length}`);
console.log(`Non-carousel clicks: ${nonCarouselClicks.length}`);

// Verification results
let allCarouselValid = true;
let allCarouselFallback = true;
let allCarouselUnique = true;
const issues = [];

console.log('\n' + '='.repeat(60));
console.log('CAROUSEL ACTIONS VERIFICATION');
console.log('='.repeat(60));

if (carouselActions.length === 0) {
  console.log('\n⚠️  No carousel actions found in this recording.');
} else {
  carouselActions.forEach((a) => {
    const card = a.selector.css.match(/li:nth-child\((\d+)\)/)?.[1] || 'N/A';
    const dir = a.carouselContext.direction.toUpperCase();

    console.log(`\n[${a.id}] Card ${card} ${dir} arrow`);

    // Check validation
    if (!a.selector.validation) {
      console.log('  ❌ validation: MISSING');
      allCarouselValid = false;
      issues.push(`${a.id}: Missing validation metadata`);
    } else {
      console.log('  ✅ validation: YES');
      console.log(`     - cssMatches: ${a.selector.validation.cssMatches}`);
      console.log(`     - isUnique: ${a.selector.validation.isUnique}`);
      console.log(`     - strategy: ${a.selector.validation.strategy}`);

      // Check uniqueness
      if (a.selector.validation.cssMatches !== 1) {
        console.log(
          `  ⚠️  WARNING: cssMatches = ${a.selector.validation.cssMatches} (should be 1)`
        );
        allCarouselUnique = false;
        issues.push(`${a.id}: CSS selector matches ${a.selector.validation.cssMatches} elements`);
      }

      if (!a.selector.validation.isUnique) {
        console.log('  ⚠️  WARNING: isUnique = false');
        allCarouselUnique = false;
        issues.push(`${a.id}: Selector is not unique`);
      }
    }

    // Check fallback
    if (!a.selector.fallback) {
      console.log('  ❌ fallback: MISSING');
      allCarouselFallback = false;
      issues.push(`${a.id}: Missing fallback metadata`);
    } else {
      console.log('  ✅ fallback: YES');
      console.log(
        `     - visualPosition: (${a.selector.fallback.visualPosition.x}, ${a.selector.fallback.visualPosition.y})`
      );
      console.log(`     - siblingIndex: ${a.selector.fallback.siblingIndex}`);
    }

    // Check carouselContext
    console.log('  ✅ carouselContext: YES');
  });
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('VERIFICATION SUMMARY');
console.log('='.repeat(60));

if (carouselActions.length === 0) {
  console.log('\n⚠️  Cannot verify - no carousel actions in recording');
  console.log('\nTIP: Record some carousel navigation actions and try again.');
  process.exit(0);
}

console.log(`\nTotal carousel actions verified: ${carouselActions.length}`);

if (allCarouselValid && allCarouselFallback && allCarouselUnique) {
  console.log('\n✅ ALL CHECKS PASSED!');
  console.log('   - All carousel actions have validation metadata');
  console.log('   - All carousel actions have fallback metadata');
  console.log('   - All carousel selectors are unique (cssMatches === 1)');
  console.log('\n🎉 The BUGFIX_CAROUSEL_VALIDATION fix is working correctly!');
  process.exit(0);
} else {
  console.log('\n❌ VERIFICATION FAILED!');

  if (!allCarouselValid) {
    console.log('   ❌ Some carousel actions missing validation metadata');
  }

  if (!allCarouselFallback) {
    console.log('   ❌ Some carousel actions missing fallback metadata');
  }

  if (!allCarouselUnique) {
    console.log('   ⚠️  Some carousel selectors are not unique');
  }

  console.log('\n📋 Issues found:');
  issues.forEach((issue) => console.log(`   - ${issue}`));

  console.log('\n💡 ACTION REQUIRED:');
  console.log('   1. Rebuild the extension: npm run build');
  console.log('   2. Reload the extension in Chrome');
  console.log('   3. Record a new test with carousel navigation');
  console.log('   4. Run this verification script again');

  process.exit(1);
}
