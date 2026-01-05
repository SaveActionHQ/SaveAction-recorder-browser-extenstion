#!/bin/bash
# XPath Precision Fix - Verification Script

echo "=== XPath Precision Fix Verification ==="
echo ""

# Check if test recording exists
if [ ! -f "test_1766752315390.json" ]; then
  echo "❌ Test recording not found"
  exit 1
fi

echo "✅ Test recording found"
echo ""

echo "=== 1. Verify No SVG Elements ==="
svg_count=$(grep -c '"tagName": "svg"' test_1766752315390.json)
echo "SVG elements: $svg_count (expected: 0)"
[ "$svg_count" -eq 0 ] && echo "✅ PASS" || echo "❌ FAIL"
echo ""

echo "=== 2. Verify Carousel Actions ==="
carousel_count=$(grep -c '"clickType": "carousel-navigation"' test_1766752315390.json)
echo "Carousel actions: $carousel_count (expected: 6)"
[ "$carousel_count" -eq 6 ] && echo "✅ PASS" || echo "❌ FAIL"
echo ""

echo "=== 3. Verify XPath Contains Direction ==="
next_count=$(grep -c '"xpath".*contains.*next' test_1766752315390.json)
prev_count=$(grep -c '"xpath".*contains.*prev' test_1766752315390.json)
echo "XPath with 'next': $next_count (expected: 3)"
echo "XPath with 'prev': $prev_count (expected: 3)"
[ "$next_count" -eq 3 ] && [ "$prev_count" -eq 3 ] && echo "✅ PASS" || echo "❌ FAIL"
echo ""

echo "=== 4. Verify XPath Contains Arrow Class ==="
arrow_count=$(grep -c '"xpath".*contains.*content__body__item-img-arrow' test_1766752315390.json)
echo "XPath with arrow class: $arrow_count (expected: 6)"
[ "$arrow_count" -eq 6 ] && echo "✅ PASS" || echo "❌ FAIL"
echo ""

echo "=== 5. Verify XPath Selects Child Span ==="
child_span_count=$(grep -c '"xpath".*\/span\[1\]' test_1766752315390.json)
echo "XPath with /span[1]: $child_span_count (expected: 6)"
[ "$child_span_count" -eq 6 ] && echo "✅ PASS" || echo "❌ FAIL"
echo ""

echo "=== 6. Sample XPath Patterns ==="
echo "Carousel 1 Next:"
grep '"id": "act_012"' -A 30 test_1766752315390.json | grep '"xpath"' | grep 'listings_cn'
echo ""
echo "Carousel 2 Next:"
grep '"id": "act_016"' -A 30 test_1766752315390.json | grep '"xpath"' | grep 'listings_cn'
echo ""

echo "=== Summary ==="
echo "If all tests show ✅ PASS, the XPath precision fix is working correctly."
