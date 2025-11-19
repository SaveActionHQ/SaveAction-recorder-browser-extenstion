# Icons

To generate the required PNG icons from the SVG:

1. Use an online tool like https://cloudconvert.com/svg-to-png or a local tool
2. Convert `icon.svg` to:
   - `icon-16.png` (16x16)
   - `icon-48.png` (48x48)
   - `icon-128.png` (128x128)

Or use ImageMagick:
```bash
convert -background none -resize 16x16 icon.svg icon-16.png
convert -background none -resize 48x48 icon.svg icon-48.png
convert -background none -resize 128x128 icon.svg icon-128.png
```

The icon design represents:
- Purple background (#6366f1) - brand color
- White person silhouette - represents user
- Red recording dot - indicates recording functionality
